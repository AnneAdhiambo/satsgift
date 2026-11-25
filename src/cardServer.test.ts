import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, memoryStore, LIMITS, type CardView } from '../api/card.ts';

const BASE = 'https://satsgift.test/api/card';
const AUTH = 'organiser-token';
const sha = async (t: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))), b => b.toString(16).padStart(2, '0')).join('');
const PUB = '02' + 'ab'.repeat(32);

async function call(store: ReturnType<typeof memoryStore>, path: string, body?: unknown, now?: () => number) {
  const req = new Request(BASE + path, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) });
  const res = await handle(req, store, now);
  return { status: res.status, body: await res.json() as any };
}
async function newCard(store: ReturnType<typeof memoryStore>) {
  const { status, body } = await call(store, '', { h: 'iv.header', pub: PUB, auth: await sha(AUTH) });
  assert.equal(status, 201);
  return body.id as string;
}

test('create, sign and read a card', async () => {
  const store = memoryStore();
  const id = await newCard(store);
  assert.match(id, /^[A-Za-z0-9]{12}$/);
  assert.equal((await call(store, `?id=${id}&action=sign`, { m: 'iv.msg1' })).body.index, 0);
  assert.equal((await call(store, `?id=${id}&action=sign`, { m: 'iv.msg2', t: 'eph.iv.tok' })).body.index, 1);
  const card = (await call(store, `?id=${id}`)).body as CardView;
  assert.equal(card.status, 'open');
  assert.deepEqual(card.entries.map(e => [e.m, e.t]), [['iv.msg1', undefined], ['iv.msg2', 'eph.iv.tok']]);
  assert.equal(card.gift, undefined);
  assert.equal('auth' in card, false, 'never hands out the auth hash');
});

test('only the organiser can hide messages or send the card', async () => {
  const store = memoryStore();
  const id = await newCard(store);
  await call(store, `?id=${id}&action=sign`, { m: 'iv.msg' });
  assert.equal((await call(store, `?id=${id}&action=hide`, { auth: 'wrong', index: 0 })).status, 403);
  assert.equal((await call(store, `?id=${id}&action=hide`, { auth: AUTH, index: 0 })).status, 200);
  assert.deepEqual((await call(store, `?id=${id}`)).body.hidden, [0]);
  await call(store, `?id=${id}&action=hide`, { auth: AUTH, index: 0, hidden: false });
  assert.deepEqual((await call(store, `?id=${id}`)).body.hidden, []);
  assert.equal((await call(store, `?id=${id}&action=send`, { auth: 'wrong', gift: 'iv.gift' })).status, 403);
  assert.equal((await call(store, `?id=${id}&action=send`, { auth: AUTH, gift: 'iv.gift' })).status, 200);
  const card = (await call(store, `?id=${id}`)).body as CardView;
  assert.equal(card.status, 'sent');
  assert.equal(card.gift, 'iv.gift');
  assert.equal((await call(store, `?id=${id}&action=sign`, { m: 'iv.late' })).status, 409, 'no signing after sending');
  assert.equal((await call(store, `?id=${id}&action=send`, { auth: AUTH, gift: 'iv.again' })).status, 409);
});

test('rejects bad input and full cards', async () => {
  const store = memoryStore();
  assert.equal((await call(store, '', { h: 'x', pub: 'nope', auth: 'nope' })).status, 400);
  assert.equal((await call(store, '?id=../etc')).status, 400);
  assert.equal((await call(store, '?id=AAAAAAAAAAAA')).status, 404);
  const id = await newCard(store);
  assert.equal((await call(store, `?id=${id}&action=sign`, { m: '<script>' })).status, 400);
  assert.equal((await call(store, `?id=${id}&action=sign`, { m: 'a'.repeat(LIMITS.message + 1) })).status, 400);
  for (let i = 0; i < LIMITS.entries; i++) await call(store, `?id=${id}&action=sign`, { m: 'iv.m' });
  assert.equal((await call(store, `?id=${id}&action=sign`, { m: 'iv.m' })).status, 409);
});

test('cards expire', async () => {
  let t = 1_000_000;
  const store = memoryStore(() => t);
  const { body } = await call(store, '', { h: 'iv.h', pub: PUB, auth: await sha(AUTH) }, () => t);
  t += 91 * 86_400_000;
  assert.equal((await call(store, `?id=${body.id}`, undefined, () => t)).status, 404);
});
