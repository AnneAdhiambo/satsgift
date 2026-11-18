// TEST MODE ONLY: make a correctly signed BOLT11 invoice from a throwaway key.
// Test mints auto-pay invoices they issued themselves, so a recipient trying a payout needs an
// "outside" invoice instead. Nobody holds this invoice's preimage: on a real mint it could never be paid.
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]) {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk;
}
function bech32(hrp: string, words: number[]) {
  const expanded = [...[...hrp].map(c => c.charCodeAt(0) >> 5), 0, ...[...hrp].map(c => c.charCodeAt(0) & 31)];
  const mod = polymod([...expanded, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
  return hrp + '1' + [...words, ...checksum].map(w => CHARSET[w]).join('');
}
/** Regroup bits, e.g. bytes (8) → bech32 words (5). */
function convert(data: ArrayLike<number>, from: number, to: number, pad: boolean) {
  let acc = 0, bits = 0; const out: number[] = []; const max = (1 << to) - 1;
  for (let i = 0; i < data.length; i++) {
    acc = (acc << from) | data[i]; bits += from;
    while (bits >= to) { bits -= to; out.push((acc >>> bits) & max); }
  }
  if (pad && bits > 0) out.push((acc << (to - bits)) & max);
  return out;
}
const intWords = (n: number, len: number) => Array.from({ length: len }, (_, i) => Math.floor(n / 32 ** (len - 1 - i)) % 32);
const tag = (char: string, words: number[]) => [CHARSET.indexOf(char), ...intWords(words.length, 2), ...words];

/** Feature bits as bech32 words, most significant first. */
function featureWords(bits: number[]) {
  const len = Math.ceil((Math.max(...bits) + 1) / 5);
  const words = new Array(len).fill(0);
  for (const b of bits) words[len - 1 - Math.floor(b / 5)] |= 1 << (b % 5);
  return words;
}

export function makeTestInvoice(sats: number, description = 'SatsGift test payout', now = Date.now()): string {
  if (!Number.isInteger(sats) || sats < 1) throw new Error('Invoice amount must be a whole number of sats.');
  const hrp = `lnbc${sats * 10}n`; // 1n = 0.1 sat
  const words = [
    ...intWords(Math.floor(now / 1000), 7),
    ...tag('p', convert(crypto.getRandomValues(new Uint8Array(32)), 8, 5, true)), // payment hash (no one knows the preimage)
    ...tag('s', convert(crypto.getRandomValues(new Uint8Array(32)), 8, 5, true)), // payment secret
    ...tag('d', convert(new TextEncoder().encode(description), 8, 5, true)),
    ...tag('x', intWords(3600, 2)),                                                 // expires in an hour
    ...tag('9', featureWords([8, 14])),                                             // var_onion_optin + payment_secret
  ];
  const message = new Uint8Array([...new TextEncoder().encode(hrp), ...convert(words, 5, 8, true)]);
  const key = secp256k1.utils.randomSecretKey();
  const sig = secp256k1.sign(sha256(message), key, { prehash: false, format: 'recovered' }); // [recovery, r, s]
  const signature = [...sig.slice(1), sig[0]];                                              // BOLT11 wants r, s, recovery
  return bech32(hrp, [...words, ...convert(signature, 8, 5, true)]);
}
