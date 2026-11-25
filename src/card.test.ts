import test from 'node:test';
import assert from 'node:assert/strict';
import { cardFee, parseHeader, parseMessage } from './card.ts';

test('the fee only applies from 5 contributors: 2%, at least 50 sats', () => {
  assert.equal(cardFee(10_000, 4), 0);
  assert.equal(cardFee(10_000, 5), 200);
  assert.equal(cardFee(1_000, 5), 50);
  assert.equal(cardFee(30, 6), 30, 'never more than the pot');
  assert.equal(cardFee(0, 9), 0);
});

test('messages from the server are validated', () => {
  assert.deepEqual(parseMessage({ name: 'Juma', text: 'Happy birthday!', pen: 2, sticker: '🎂', sats: 500 }), { name: 'Juma', text: 'Happy birthday!', pen: 2, sticker: '🎂', sats: 500 });
  assert.equal(parseMessage({ name: 'Juma', text: '  ' }), null);
  assert.equal(parseMessage('junk'), null);
  const odd = parseMessage({ name: 'A', text: 'x'.repeat(999), pen: 99, sticker: '<img>', sats: -5 })!;
  assert.equal(odd.text.length, 280);
  assert.deepEqual([odd.pen, odd.sticker, odd.sats], [0, '', 0]);
  assert.equal(parseHeader({ to: 'Amina', theme: 'neon' }).theme, 'coral');
});
