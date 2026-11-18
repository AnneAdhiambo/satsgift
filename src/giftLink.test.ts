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
