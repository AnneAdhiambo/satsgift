// A gift travels inside the link's #fragment, which browsers never send to the server.
// Format: <page>#g=<base64url(deflate-raw(JSON))>
// A locked gift carries its token and message encrypted (see giftLock.ts); names, theme and format stay readable.
import { formats, themes, type Format, type Theme } from './themes.ts';
import { seal, unseal, type LockKind, type Sealed } from './giftLock.ts';
import { LETTER_MAX, SIGNED_BY_MAX } from './teamSend.ts';

export type Gift = {
  token: string;      // cashuA/B token; empty for demo gifts and for locked gifts until unlocked
  demo: boolean;
  to: string; from: string; message: string;
  theme: Theme; format: Format;
  sealed?: Sealed;    // present on a decoded gift that still needs its code
  letter?: Letter;    // team sends: a longer letter shown before the card
};
/** A letter from the sender (e.g. a company to its team). The gift's `message` holds the personal line. */
export type Letter = { body: string; signedBy: string };
/** How the sender locks a gift: a generated code, or an answer to their own question. */
export type Lock = { kind: LockKind; secret: string; question: string };

export const GIFT_HASH = '#g=';
type WireLock = { k: LockKind; q?: string; s: string; i: string; c: string };
type WireLetter = { b: string; s?: string };
type Wire = { v: 1; t?: string; d?: 1; to: string; fr: string; m?: string; l?: WireLetter; th: string; f: string; x?: WireLock };
type Secret = { t?: string; m: string; l?: WireLetter };

const toWireLetter = (l?: Letter): WireLetter | undefined => l && l.body.trim() ? (l.signedBy.trim() ? { b: l.body, s: l.signedBy } : { b: l.body }) : undefined;
function fromWireLetter(l: unknown): Letter | undefined {
  if (!l || typeof l !== 'object') return undefined;
  const body = text((l as WireLetter).b, LETTER_MAX);
  return body.trim() ? { body, signedBy: text((l as WireLetter).s, SIGNED_BY_MAX) } : undefined;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
function toBase64Url(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(text: string) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export const QUESTION_MAX = 100;

export async function encodeGift(gift: Gift, lock?: Lock | null): Promise<string> {
  const wire: Wire = { v: 1, to: gift.to, fr: gift.from, th: gift.theme, f: gift.format };
  if (gift.demo) wire.d = 1;
  const secret: Secret = { m: gift.message };
  if (!gift.demo) secret.t = gift.token;
  const letter = toWireLetter(gift.letter);
  if (letter) secret.l = letter;
  if (lock) {
    const s = await seal(JSON.stringify(secret), lock.kind, lock.secret, lock.question.slice(0, QUESTION_MAX));
    wire.x = { k: s.kind, s: s.salt, i: s.iv, c: s.data };
    if (s.question) wire.x.q = s.question;
  } else Object.assign(wire, secret);
  return toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(wire)), new CompressionStream('deflate-raw')));
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const isB64 = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v);

/** Decode and sanity-check a gift. The token itself is validated separately by readGiftToken. */
export async function decodeGift(encoded: string): Promise<Gift> {
  let wire: Partial<Wire>;
  try {
    const bytes = await pipe(fromBase64Url(encoded.trim()), new DecompressionStream('deflate-raw'));
    wire = JSON.parse(new TextDecoder().decode(bytes));
  } catch { throw new Error('This gift link looks incomplete. Ask the sender to share it again.'); }
  if (wire?.v !== 1) throw new Error('This gift link was made by a newer version of SatsGift.');
  const demo = wire.d === 1;
  const base = {
    demo, to: text(wire.to, 50), from: text(wire.fr, 50),
    theme: (wire.th && wire.th in themes ? wire.th : 'coral') as Theme,
    format: (formats.some(f => f.id === wire.f) ? wire.f : 'card') as Format,
  };
  const x = wire.x;
  if (x) {
    if ((x.k !== 'code' && x.k !== 'answer') || !isB64(x.s) || !isB64(x.i) || !isB64(x.c)) throw new Error('This gift link looks incomplete. Ask the sender to share it again.');
    return { ...base, token: '', message: '', sealed: { kind: x.k, question: text(x.q, QUESTION_MAX), salt: x.s, iv: x.i, data: x.c } };
  }
  if (!demo && typeof wire.t !== 'string') throw new Error('This gift link has no sats inside.');
  const letter = fromWireLetter(wire.l);
  return { ...base, token: demo ? '' : wire.t!, message: text(wire.m, 140), ...(letter && { letter }) };
}

/** Open a locked gift with its code. Throws WrongSecret for a wrong code. */
export async function unlockGift(gift: Gift, secret: string): Promise<Gift> {
  if (!gift.sealed) return gift;
  const plain = await unseal(gift.sealed, secret);
  let inner: Partial<Secret>;
  try { inner = JSON.parse(plain); } catch { throw new Error('This gift link looks damaged. Ask the sender to share it again.'); }
  if (!gift.demo && typeof inner.t !== 'string') throw new Error('This gift link has no sats inside.');
  const { sealed: _, ...rest } = gift;
  const letter = fromWireLetter(inner.l);
  return { ...rest, token: gift.demo ? '' : inner.t!, message: text(inner.m, 140), ...(letter && { letter }) };
}

/** Full shareable URL for the current page. */
export function giftUrl(encoded: string, base = `${location.origin}${location.pathname}`) {
  return `${base}${GIFT_HASH}${encoded}`;
}
