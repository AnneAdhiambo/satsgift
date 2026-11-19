import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceFor, lookupAddress, parsePayTarget } from './lnurl.ts';

const reply = (body: unknown) => async () => ({ ok: true, json: async () => body });

test('parsePayTarget tells addresses from invoices', () => {
  assert.deepEqual(parsePayTarget(' Amina@Blink.sv '), { kind: 'address', address: 'amina@blink.sv' });
  assert.deepEqual(parsePayTarget('0712345678@bitcoin.co.ke'), { kind: 'address', address: '0712345678@bitcoin.co.ke' });
  assert.deepEqual(parsePayTarget('lightning:LNBC10U1PXYZ'), { kind: 'invoice', invoice: 'lnbc10u1pxyz' });
  assert.equal(parsePayTarget('hello'), null);
  assert.equal(parsePayTarget('amina@localhost'), null);
});

test('lookupAddress reads LNURL-pay limits in sats', async () => {
  let asked = '';
  const params = await lookupAddress('amina@wallet.example', async url => { asked = url; return { ok: true, json: async () => ({ tag: 'payRequest', callback: 'https://wallet.example/cb', minSendable: 1000, maxSendable: 100000000 }) }; });
  assert.equal(asked, 'https://wallet.example/.well-known/lnurlp/amina');
  assert.deepEqual(params, { callback: 'https://wallet.example/cb', minSats: 1, maxSats: 100000 });
});

test('lookupAddress surfaces server errors and junk', async () => {
  await assert.rejects(lookupAddress('a@b.co', reply({ status: 'ERROR', reason: 'User not found' })), /User not found/);
  await assert.rejects(lookupAddress('a@b.co', reply({ tag: 'withdrawRequest' })), /doesn’t look like/);
  await assert.rejects(lookupAddress('a@b.co', async () => { throw new TypeError('CORS'); }), /Couldn’t reach b\.co/);
});

test('invoiceFor asks for millisats and validates the invoice', async () => {
  let asked = '';
  const pr = await invoiceFor({ callback: 'https://w.example/cb?x=1', minSats: 1, maxSats: 5000 }, 975, async url => { asked = url; return { ok: true, json: async () => ({ pr: 'LNBC9750N1ABC' }) }; });
  assert.equal(asked, 'https://w.example/cb?x=1&amount=975000');
  assert.equal(pr, 'lnbc9750n1abc');
  await assert.rejects(invoiceFor({ callback: 'https://w.example/cb', minSats: 10, maxSats: 50 }, 5, reply({})), /at least 10/);
  await assert.rejects(invoiceFor({ callback: 'https://w.example/cb', minSats: 1, maxSats: 50 }, 5, reply({ pr: 'not-an-invoice' })), /isn’t an invoice/);
});

test('tandoAddress turns Kenyan mobile numbers into Tando addresses', async () => {
  const { tandoAddress } = await import('./lnurl.ts');
  for (const n of ['0712345678', '0712 345 678', '+254712345678', '254712345678', '712345678', '0712-345-678'])
    assert.equal(tandoAddress(n), '0712345678@bitcoin.co.ke', n);
  assert.equal(tandoAddress('0112345678'), '0112345678@bitcoin.co.ke');
  for (const n of ['', '12345', '0812345678', '+255712345678', '07123456789'])
    assert.equal(tandoAddress(n), null, n);
});
