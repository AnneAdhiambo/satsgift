// A gift travels inside the link's #fragment, which browsers never send to the server.
// Format: <page>#g=<base64url(deflate-raw(JSON))>
import { formats, themes, type Format, type Theme } from './themes.ts';

export type Gift = {
  token: string;      // cashuA/B token; empty for demo gifts
  demo: boolean;
  to: string; from: string; message: string;
  theme: Theme; format: Format;
};

export const GIFT_HASH = '#g=';
type Wire = { v: 1; t?: string; d?: 1; to: string; fr: string; m: string; th: string; f: string };

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

export async function encodeGift(gift: Gift): Promise<string> {
  const wire: Wire = { v: 1, to: gift.to, fr: gift.from, m: gift.message, th: gift.theme, f: gift.format };
  if (gift.demo) wire.d = 1; else wire.t = gift.token;
  return toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(wire)), new CompressionStream('deflate-raw')));
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Decode and sanity-check a gift. The token itself is validated separately by readGiftToken. */
export async function decodeGift(encoded: string): Promise<Gift> {
  let wire: Partial<Wire>;
  try {
    const bytes = await pipe(fromBase64Url(encoded.trim()), new DecompressionStream('deflate-raw'));
    wire = JSON.parse(new TextDecoder().decode(bytes));
  } catch { throw new Error('This gift link looks incomplete. Ask the sender to share it again.'); }
  if (wire?.v !== 1) throw new Error('This gift link was made by a newer version of SatsGift.');
  const demo = wire.d === 1;
  if (!demo && typeof wire.t !== 'string') throw new Error('This gift link has no sats inside.');
  return {
    token: demo ? '' : wire.t!, demo,
    to: text(wire.to, 50), from: text(wire.fr, 50), message: text(wire.m, 140),
    theme: (wire.th && wire.th in themes ? wire.th : 'coral') as Theme,
    format: (formats.some(f => f.id === wire.f) ? wire.f : 'card') as Format,
  };
}

/** Full shareable URL for the current page. */
export function giftUrl(encoded: string, base = `${location.origin}${location.pathname}`) {
  return `${base}${GIFT_HASH}${encoded}`;
}
