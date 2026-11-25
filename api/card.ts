// Group cards: the only server-side part of SatsGift.
//
// It stores *ciphertext only*. Messages and the card header are encrypted with a key that lives
// in the links' #fragment (never sent here); each contributor's sats are encrypted to the
// organiser's public key; the finished gift is encrypted with a key only the recipient's link holds.
// So this server can neither read the messages nor spend the sats.
//
// Self-contained on purpose (no relative imports): Vercel runs it as a function, Vite's dev server
// mounts it locally, and the tests import it directly.
//
// API (all JSON):
//   POST /api/card                         create   { h, pub, auth }            → { id }
//   GET  /api/card?id=…                    read                                  → card
//   POST /api/card?id=…&action=sign        sign     { m, t? }                   → { index }
//   POST /api/card?id=…&action=hide        hide     { auth, index, hidden }     → { ok }
//   POST /api/card?id=…&action=send        send     { auth, gift }              → { ok }

export const LIMITS = { entries: 50, header: 4_000, message: 2_000, token: 20_000, gift: 60_000, body: 100_000 };
const DAY = 86_400;
export const TTL = { open: 90 * DAY, sent: 60 * DAY };

export type Entry = { m: string; t?: string; at: number };
type Meta = { v: 1; h: string; pub: string; auth: string; status: 'open' | 'sent'; createdAt: number; hidden: number[]; gift?: string; sentAt?: number };
export type CardView = { id: string; h: string; pub: string; status: 'open' | 'sent'; hidden: number[]; entries: Entry[]; gift?: string; createdAt: number; sentAt?: number };

// ---------- storage ----------
export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
  /** Append to a list; returns the new length. */
  push(key: string, value: string, ttl: number): Promise<number>;
  list(key: string): Promise<string[]>;
}

/** For local development and tests. Forgets everything on restart. */
export function memoryStore(now = () => Date.now()): Store {
  const data = new Map<string, { value: string | string[]; until: number }>();
  const live = (key: string) => { const e = data.get(key); if (e && e.until <= now()) { data.delete(key); return undefined; } return e; };
  return {
    async get(key) { const e = live(key); return typeof e?.value === 'string' ? e.value : null; },
    async set(key, value, ttl) { data.set(key, { value, until: now() + ttl * 1000 }); },
    async push(key, value, ttl) {
      const e = live(key); const list = Array.isArray(e?.value) ? e.value : [];
      list.push(value); data.set(key, { value: list, until: now() + ttl * 1000 }); return list.length;
    },
    async list(key) { const e = live(key); return Array.isArray(e?.value) ? [...e.value] : []; },
  };
}

/** Upstash Redis over its REST API (what Vercel's Upstash integration provides). */
export function redisStore(url: string, token: string): Store {
  async function run(...commands: (string | number)[][]) {
    const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(commands) });
    if (!res.ok) throw new Error(`store ${res.status}`);
    const out = await res.json() as { result?: unknown; error?: string }[];
    const failed = out.find(r => r.error); if (failed) throw new Error(`store: ${failed.error}`);
    return out.map(r => r.result);
  }
  return {
    async get(key) { const [v] = await run(['GET', key]); return typeof v === 'string' ? v : null; },
    async set(key, value, ttl) { await run(['SET', key, value, 'EX', ttl]); },
    async push(key, value, ttl) { const [n] = await run(['RPUSH', key, value], ['EXPIRE', key, ttl]); return Number(n); },
    async list(key) { const [v] = await run(['LRANGE', key, 0, -1]); return Array.isArray(v) ? v.map(String) : []; },
  };
}

// ---------- helpers ----------
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (status: number, error: string) => json({ error }, status);
const B64 = /^[A-Za-z0-9_.-]+$/; // base64url pieces joined with dots
const isB64 = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && B64.test(v);
const isHex = (v: unknown, len: number): v is string => typeof v === 'string' && v.length === len && /^[0-9a-f]+$/.test(v);

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
/** Compare without leaking where two strings differ. */
function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function newId() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), b => abc[b % abc.length]).join('');
}
const metaKey = (id: string) => `card:${id}`;
const entriesKey = (id: string) => `card:${id}:entries`;

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > LIMITS.body) return null;
  try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

// ---------- the handler ----------
export async function handle(request: Request, store: Store, now = () => Date.now()): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  const action = url.searchParams.get('action') ?? '';
  if (id && !/^[A-Za-z0-9]{12}$/.test(id)) return fail(400, 'bad id');

  try {
    if (request.method === 'GET') {
      if (!id) return fail(400, 'missing id');
      const raw = await store.get(metaKey(id));
      if (!raw) return fail(404, 'This card doesn’t exist, or it has expired.');
      const meta = JSON.parse(raw) as Meta;
      const entries = (await store.list(entriesKey(id))).map(e => JSON.parse(e) as Entry);
      const view: CardView = { id, h: meta.h, pub: meta.pub, status: meta.status, hidden: meta.hidden, entries, createdAt: meta.createdAt, ...(meta.gift && { gift: meta.gift, sentAt: meta.sentAt }) };
      return json(view);
    }
    if (request.method !== 'POST') return fail(405, 'method not allowed');
    const body = await readBody(request);
    if (!body) return fail(400, 'bad body');

    if (!id) { // create
      if (!isB64(body.h, LIMITS.header) || !isHex(body.pub, 66) || !isHex(body.auth, 64)) return fail(400, 'bad card');
      const cardId = newId();
      const meta: Meta = { v: 1, h: body.h, pub: body.pub, auth: body.auth, status: 'open', createdAt: now(), hidden: [] };
      await store.set(metaKey(cardId), JSON.stringify(meta), TTL.open);
      return json({ id: cardId }, 201);
    }

    const raw = await store.get(metaKey(id));
    if (!raw) return fail(404, 'This card doesn’t exist, or it has expired.');
    const meta = JSON.parse(raw) as Meta;

    if (action === 'sign') {
      if (meta.status !== 'open') return fail(409, 'This card has already been sent.');
      if (!isB64(body.m, LIMITS.message) || (body.t !== undefined && !isB64(body.t, LIMITS.token))) return fail(400, 'bad message');
      const existing = await store.list(entriesKey(id));
      if (existing.length >= LIMITS.entries) return fail(409, `This card is full (${LIMITS.entries} messages).`);
      const entry: Entry = { m: body.m, at: now(), ...(typeof body.t === 'string' && { t: body.t }) };
      const length = await store.push(entriesKey(id), JSON.stringify(entry), TTL.open);
      return json({ index: length - 1 }, 201);
    }

    // Organiser-only actions: the token proves they hold the organiser link.
    if (typeof body.auth !== 'string' || !sameString(await sha256Hex(body.auth), meta.auth)) return fail(403, 'Only the organiser can do that.');

    if (action === 'hide') {
      if (typeof body.index !== 'number' || !Number.isInteger(body.index) || body.index < 0) return fail(400, 'bad index');
      const hidden = new Set(meta.hidden);
      if (body.hidden === false) hidden.delete(body.index); else hidden.add(body.index);
      meta.hidden = [...hidden].sort((a, b) => a - b);
      await store.set(metaKey(id), JSON.stringify(meta), TTL.open);
      return json({ ok: true });
    }
    if (action === 'send') {
      if (meta.status === 'sent') return fail(409, 'This card has already been sent.');
      if (!isB64(body.gift, LIMITS.gift)) return fail(400, 'bad gift');
      meta.status = 'sent'; meta.gift = body.gift; meta.sentAt = now();
      await store.set(metaKey(id), JSON.stringify(meta), TTL.sent);
      return json({ ok: true });
    }
    return fail(400, 'unknown action');
  } catch {
    return fail(500, 'Something went wrong on our side. Please try again.');
  }
}

// ---------- Vercel entry points ----------
declare const process: { env: Record<string, string | undefined> } | undefined;
let cached: Store | undefined;
function defaultStore(): Store {
  if (cached) return cached;
  const env = typeof process !== 'undefined' ? process.env : {};
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? redisStore(url, token) : memoryStore();
  return cached;
}
export const GET = (request: Request) => handle(request, defaultStore());
export const POST = (request: Request) => handle(request, defaultStore());
