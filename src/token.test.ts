import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Amount, getEncodedToken } from '@cashu/cashu-ts';
import { readGiftToken } from './token.ts';

// Syntactically complete test proofs only. These are not signed or redeemable.
const proof = { id: '009a1f293253e41e', amount: 512, secret: 'test-only-not-money', C: '02' + 'ab'.repeat(32) };
const legacy = (overrides = {}) => 'cashuA' + Buffer.from(JSON.stringify({ token: [{ mint: 'https://mint.example.com', proofs: [proof, { ...proof, amount: 128, secret: 'another-test-proof' }] }], unit: 'sat', ...overrides })).toString('base64url');

test('reads legacy sats and removes wallet URI wrappers', () => {
  const token = legacy();
  for (const prefix of ['', 'cashu:', 'cashu://', 'web+cashu://']) assert.deepEqual(readGiftToken(` ${prefix}${token} `), { token, amount: 640, mint: 'https://mint.example.com' });
});
test('reads CBOR tokens including shortened v2 keyset IDs without contacting a mint', () => {
  for (const id of [proof.id, '01' + 'ab'.repeat(32)]) {
    const token = getEncodedToken({ mint: 'https://mint.example.com', unit: 'sat', proofs: [{ ...proof, id, amount: Amount.from(512) }] });
    assert.equal(readGiftToken(token).amount, 512);
  }
});
test('rejects malformed tokens, wrong units, empty proofs, bad mint URLs and unsafe amounts', () => {
  const entry = (proofs: unknown[], mint = 'https://mint.example.com') => ({ token: [{ mint, proofs }] });
  for (const token of ['', 'cashuBbroken', 'cashuAdemo', legacy({ unit: 'usd' }), legacy(entry([])), legacy(entry([{ ...proof, amount: -1 }])), legacy(entry([{ ...proof, C: 'invalid' }])), legacy(entry([proof], 'javascript:alert(1)')), legacy(entry([{ ...proof, amount: '9007199254740992' }]))]) assert.throws(() => readGiftToken(token));
});
