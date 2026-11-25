import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDraft, parseGifts, parseInvoice, replaceGift, upsertGift, type SentGift } from './storage.ts';

test('parseDraft repairs bad or missing fields', () => {
  assert.equal(parseDraft(null), null);
  assert.equal(parseDraft([]), null);
  const d = parseDraft({ step: 9, token: 'cashuB1', format: 'hologram', theme: 'neon', to: 'x'.repeat(80), message: 42 })!;
  assert.equal(d.step, 1);
  assert.equal(d.format, 'card');
  assert.equal(d.theme, 'coral');
  assert.equal(d.to.length, 50);
  assert.equal(d.message, '');
  assert.equal(d.demo, false);
});

test('parseDraft keeps a valid draft', () => {
  const draft = { step: 3, token: 'cashuB1', demo: false, format: 'scratch', theme: 'night', to: 'Amina', from: 'Anne', message: 'Hi' };
  assert.deepEqual(parseDraft(draft), draft);
});

test('parseInvoice requires the essentials', () => {
  assert.equal(parseInvoice({ mint: 'https://m', quote: 'q' }), null);
  assert.deepEqual(parseInvoice({ mint: 'https://m', quote: 'q', request: 'lnbc1', amount: 5 }), { mint: 'https://m', quote: 'q', request: 'lnbc1', amount: 5, expiry: null });
});

test('parseGifts drops broken entries', () => {
  assert.deepEqual(parseGifts('nope'), []);
  assert.equal(parseGifts([{ token: '' , amount: 1 }, { token: 'a', amount: 'x' }, { token: 'b', amount: 2 }]).length, 1);
});

test('upsertGift keeps one entry per token, newest first, original date', () => {
  const g = (token: string, createdAt: number, to = ''): SentGift => ({ token, amount: 1, mint: 'm', to, from: '', link: '', createdAt });
  let list = upsertGift([], g('a', 1));
  list = upsertGift(list, g('b', 2));
  list = upsertGift(list, g('a', 3, 'Amina'));
  assert.deepEqual(list.map(x => x.token), ['b', 'a']);
  assert.equal(list[1].to, 'Amina');
  assert.equal(list[1].createdAt, 1);
});

test('replaceGift swaps a reclaimed gift for its fresh token', () => {
  const g = (token: string, createdAt: number, to = ''): SentGift => ({ token, amount: 5, mint: 'm', to, from: '', link: to ? 'https://x/#g=1' : '', createdAt });
  const list = replaceGift([g('old', 1, 'Amina'), g('b', 2)], 'old', g('fresh', 3));
  assert.deepEqual(list.map(x => x.token), ['fresh', 'b']);
  assert.equal(list[0].link, '');
});
