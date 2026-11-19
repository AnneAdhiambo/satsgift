import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanAmount } from './amount.ts';

test('keeps digits only and drops leading zeros', () => {
  assert.equal(cleanAmount('1,000 sats', 100_000), '1000');
  assert.equal(cleanAmount('000250', 100_000), '250');
  assert.equal(cleanAmount('0', 100_000), '');
  assert.equal(cleanAmount('abc', 100_000), '');
});

test('caps huge or endless numbers at the limit', () => {
  assert.equal(cleanAmount('100001', 100_000), '100000');
  assert.equal(cleanAmount('9'.repeat(400), 100_000), '100000');
  assert.equal(cleanAmount('1e999', 100_000), '1999');
  assert.equal(cleanAmount('100000', 100_000), '100000');
});
