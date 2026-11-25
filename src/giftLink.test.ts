import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeGift, encodeGift, giftUrl, type Gift } from './giftLink.ts';

const gift: Gift = { token: 'cashuBexample', demo: false, to: 'Amina', from: 'Anne', message: 'Karibu, enjoy! 🎂', theme: 'lagoon', format: 'scratch' };

test('round-trips a gift through the link', async () => {
  const encoded = await encodeGift(gift);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/, 'link payload must be URL-safe');
  assert.deepEqual(await decodeGift(encoded), gift);
});

test('demo gifts carry no token', async () => {
  const decoded = await decodeGift(await encodeGift({ ...gift, demo: true, token: 'ignored' }));
  assert.equal(decoded.demo, true);
  assert.equal(decoded.token, '');
});

test('rejects a damaged link', async () => {
  const encoded = await encodeGift(gift);
  await assert.rejects(decodeGift(encoded.slice(0, encoded.length / 2)), /incomplete/);
  await assert.rejects(decodeGift('not a gift'), /incomplete/);
});

test('falls back to safe theme/format and trims long text', async () => {
  const encoded = await encodeGift({ ...gift, theme: 'neon' as Gift['theme'], format: 'hologram' as Gift['format'], message: 'x'.repeat(500) });
  const decoded = await decodeGift(encoded);
  assert.equal(decoded.theme, 'coral');
  assert.equal(decoded.format, 'card');
  assert.equal(decoded.message.length, 140);
});

test('builds a fragment URL', () => {
  assert.equal(giftUrl('abc', 'https://satsgift.app/'), 'https://satsgift.app/#g=abc');
});

test('a locked gift hides the token and message until unlocked', async () => {
  const { unlockGift } = await import('./giftLink.ts');
  const { WrongSecret } = await import('./giftLock.ts');
  const encoded = await encodeGift(gift, { kind: 'code', secret: 'K7QM-4XPA', question: 'ignored' });
  const locked = await decodeGift(encoded);
  assert.equal(locked.token, '');
  assert.equal(locked.message, '');
  assert.equal(locked.to, 'Amina');
  assert.equal(locked.sealed?.kind, 'code');
  assert.equal(locked.sealed?.question, '');
  await assert.rejects(unlockGift(locked, 'K7QM-4XPB'), WrongSecret);
  assert.deepEqual(await unlockGift(locked, 'k7qm4xpa'), gift);
});

test('a locked demo gift carries the question and no token', async () => {
  const { unlockGift } = await import('./giftLink.ts');
  const locked = await decodeGift(await encodeGift({ ...gift, demo: true, token: 'ignored' }, { kind: 'answer', secret: 'Simba', question: 'Our dog?' }));
  assert.equal(locked.sealed?.question, 'Our dog?');
  const open = await unlockGift(locked, 'simba');
  assert.equal(open.demo, true);
  assert.equal(open.token, '');
  assert.equal(open.message, gift.message);
});

test('a team letter travels with the gift, sealed when locked', async () => {
  const { unlockGift } = await import('./giftLink.ts');
  const withLetter: Gift = { ...gift, from: 'Safari Tech', letter: { body: 'Dear team, thank you for a wonderful year.', signedBy: 'Wanjiru, CEO' } };
  assert.deepEqual(await decodeGift(await encodeGift(withLetter)), withLetter);
  const locked = await decodeGift(await encodeGift(withLetter, { kind: 'code', secret: 'K7QM-4XPA', question: '' }));
  assert.equal(locked.letter, undefined, 'letter hidden until unlocked');
  assert.deepEqual(await unlockGift(locked, 'K7QM4XPA'), withLetter);
  const blank = await decodeGift(await encodeGift({ ...gift, letter: { body: '  ', signedBy: 'x' } }));
  assert.equal('letter' in blank, false);
});
