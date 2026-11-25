import test from 'node:test';
import assert from 'node:assert/strict';
import { cardUrl, open, openWith, organiserKeys, parseCardHash, randomKey, seal, sealTo } from './cardCrypto.ts';

test('seals and opens text with a shared key, and rejects the wrong key', async () => {
  const key = randomKey();
  const sealed = await seal(key, 'Happy birthday Amina! 🎂');
  assert.ok(!sealed.includes('Amina'));
  assert.equal(await open(key, sealed), 'Happy birthday Amina! 🎂');
  await assert.rejects(open(randomKey(), sealed));
});

test('organiser keys are stable for a secret, and only they open sats sealed to them', async () => {
  const secret = randomKey();
  const a = await organiserKeys(secret), b = await organiserKeys(secret);
  assert.equal(a.pub, b.pub);
  assert.equal(a.auth, b.auth);
  assert.match(a.pub, /^0[23][0-9a-f]{64}$/);
  assert.match(a.authHash, /^[0-9a-f]{64}$/);
  assert.notEqual(a.auth, a.authHash);
  const sealed = await sealTo(a.pub, 'cashuBtoken');
  assert.equal(await openWith(a.priv, sealed), 'cashuBtoken');
  await assert.rejects(openWith((await organiserKeys(randomKey())).priv, sealed));
});

test('card links round-trip and reject junk', () => {
  const id = 'abcDEF234567', msgKey = randomKey(), secret = randomKey();
  for (const link of [{ kind: 'join', id, msgKey }, { kind: 'org', id, msgKey, secret }, { kind: 'card', id, msgKey, giftKey: secret }] as const) {
    const url = cardUrl(link, 'https://satsgift.app/');
    assert.deepEqual(parseCardHash(url.slice(url.indexOf('#'))), link);
  }
  assert.equal(parseCardHash(`#join=${id}.${msgKey}.${secret}`), null);
  assert.equal(parseCardHash(`#org=${id}.${msgKey}`), null);
  assert.equal(parseCardHash('#join=bad.key'), null);
  assert.equal(parseCardHash('#g=abc'), null);
});
