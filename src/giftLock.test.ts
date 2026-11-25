import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCode, normaliseAnswer, normaliseCode, seal, secretReady, unseal, WrongSecret } from './giftLock.ts';

test('generated codes are XXXX-XXXX from the unambiguous alphabet', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const code = generateCode();
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    assert.ok(secretReady('code', code));
    seen.add(code);
  }
  assert.equal(seen.size, 200);
});

test('codes ignore case, spaces, dashes and look-alike letters', () => {
  assert.equal(normaliseCode(' k7qm-4xpa '), 'K7QM4XPA');
  assert.equal(normaliseCode('O1IL'), '0111');
  assert.equal(secretReady('code', 'K7QM-4XP'), false);
});

test('answers ignore case and extra spaces', () => {
  assert.equal(normaliseAnswer('  Mama   Simba '), 'mama simba');
  assert.equal(secretReady('answer', 'ab'), false);
  assert.equal(secretReady('answer', 'Rex'), true);
});

test('seals and unseals with the code, typed loosely', async () => {
  const code = generateCode();
  const sealed = await seal('cashuBsecret', 'code', code);
  assert.ok(!JSON.stringify(sealed).includes('cashuBsecret'));
  assert.equal(await unseal(sealed, ` ${code.toLowerCase().replace('-', ' ')} `), 'cashuBsecret');
});

test('rejects a wrong code', async () => {
  const sealed = await seal('cashuBsecret', 'code', 'K7QM-4XPA');
  await assert.rejects(unseal(sealed, 'K7QM-4XPB'), WrongSecret);
  await assert.rejects(unseal(sealed, 'short'), WrongSecret);
});

test('rejects a tampered link', async () => {
  const sealed = await seal('cashuBsecret', 'answer', 'Simba', 'Our dog’s name?');
  assert.equal(sealed.question, 'Our dog’s name?');
  const flipped = sealed.data[5] === 'A' ? 'B' : 'A';
  await assert.rejects(unseal({ ...sealed, data: sealed.data.slice(0, 5) + flipped + sealed.data.slice(6) }, 'simba'), WrongSecret);
  assert.equal(await unseal(sealed, 'SIMBA'), 'cashuBsecret');
});

test('refuses to seal with a weak secret', async () => {
  await assert.rejects(seal('x', 'code', 'ABC'));
  await assert.rejects(seal('x', 'answer', ' a '));
});
