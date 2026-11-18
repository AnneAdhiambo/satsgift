import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestInvoice } from './testInvoice.ts';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function checksumOk(invoice: string) {
  const split = invoice.lastIndexOf('1');
  const hrp = invoice.slice(0, split), data = [...invoice.slice(split + 1)].map(c => CHARSET.indexOf(c));
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of [...[...hrp].map(c => c.charCodeAt(0) >> 5), 0, ...[...hrp].map(c => c.charCodeAt(0) & 31), ...data]) {
    const top = chk >>> 25; chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk === 1 && data.every(d => d >= 0);
}

test('encodes the amount in the prefix and has a valid bech32 checksum', () => {
  const inv = makeTestInvoice(979);
  assert.match(inv, /^lnbc9790n1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/);
  assert.ok(checksumOk(inv));
  assert.ok(!checksumOk(inv.slice(0, -1) + (inv.endsWith('q') ? 'p' : 'q')), 'a changed character must break the checksum');
});

test('every invoice is unique', () => {
  assert.notEqual(makeTestInvoice(5), makeTestInvoice(5));
});

test('rejects bad amounts', () => {
  assert.throws(() => makeTestInvoice(0));
  assert.throws(() => makeTestInvoice(1.5));
});
