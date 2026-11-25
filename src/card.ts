// Group cards: everyone signs one card, the organiser sends it with all the sats inside.
// The server stores only ciphertext (see api/card.ts and cardCrypto.ts).
import { cardUrl, open, openWith, organiserKeys, randomKey, seal, sealTo, type CardLink } from './cardCrypto.ts';
import { themes, type Theme } from './themes.ts';

export const NAME_MAX = 40;
export const TEXT_MAX = 280;
export const PENS = ['#1f2f4a', '#c23b26', '#137067', '#6b3fa0', '#94600a'] as const;
export const PEN_NAMES = ['Navy', 'Red', 'Green', 'Purple', 'Gold'] as const;
export const STICKERS = ['🎉', '❤️', '🎂', '🌸', '⭐', '🙏', '🥳', '🤗', '✨', '💐', '🎄', '🌙'] as const;

export type CardHeader = { to: string; from: string; occasion: string; theme: Theme };
export type CardMessage = { name: string; text: string; pen: number; sticker: string; sats: number };
export type CardEntry = { index: number; message: CardMessage | null; hidden: boolean; sealedToken?: string };
export type LoadedCard = { id: string; header: CardHeader; entries: CardEntry[]; status: 'open' | 'sent'; pub: string; giftSealed?: string };

// ---------- the fee ----------
export const CARD_FEE_MIN_CONTRIBUTORS = 5;
export const CARD_FEE_RATE = 0.02;
export const CARD_FEE_MIN = 50;
/** Free for small cards; 2% (at least 50 sats) once 5 or more people chip in sats. */
export function cardFee(pot: number, contributors: number): number {
  if (contributors < CARD_FEE_MIN_CONTRIBUTORS || pot <= 0) return 0;
  return Math.min(pot, Math.max(CARD_FEE_MIN, Math.ceil(pot * CARD_FEE_RATE)));
}

// ---------- validation (what comes back from the server may be anything) ----------
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
export function parseHeader(raw: unknown): CardHeader {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { to: str(d.to, 50), from: str(d.from, 50), occasion: str(d.occasion, 60), theme: (typeof d.theme === 'string' && d.theme in themes ? d.theme : 'coral') as Theme };
}
export function parseMessage(raw: unknown): CardMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const text = str(d.text, TEXT_MAX), name = str(d.name, NAME_MAX);
  if (!text.trim() || !name.trim()) return null;
  const pen = typeof d.pen === 'number' && Number.isInteger(d.pen) && d.pen >= 0 && d.pen < PENS.length ? d.pen : 0;
  const sticker = typeof d.sticker === 'string' && (STICKERS as readonly string[]).includes(d.sticker) ? d.sticker : '';
  const sats = typeof d.sats === 'number' && Number.isInteger(d.sats) && d.sats > 0 ? d.sats : 0;
  return { name, text, pen, sticker, sats };
}

// ---------- talking to the server ----------
const API = '/api/card';
async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try { res = await fetch(API + path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new Error('Couldn’t reach SatsGift. Check your connection and try again.'); }
  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data as T;
}

/** Start a card. Returns the organiser link (keep private) and the invite link (share). */
export async function createCard(header: CardHeader): Promise<{ org: CardLink & { kind: 'org' }; join: CardLink & { kind: 'join' } }> {
  const msgKey = randomKey(), secret = randomKey();
  const keys = await organiserKeys(secret);
  const { id } = await api<{ id: string }>('', { h: await seal(msgKey, JSON.stringify(header)), pub: keys.pub, auth: keys.authHash });
  return { org: { kind: 'org', id, msgKey, secret }, join: { kind: 'join', id, msgKey } };
}

type ServerCard = { id: string; h: string; pub: string; status: 'open' | 'sent'; hidden: number[]; entries: { m: string; t?: string }[]; gift?: string };

export async function loadCard(link: CardLink): Promise<LoadedCard> {
  const raw = await api<ServerCard>(`?id=${link.id}`);
  let header: CardHeader;
  try { header = parseHeader(JSON.parse(await open(link.msgKey, raw.h))); }
  catch { throw new Error('This card link looks damaged. Ask for it again.'); }
  const entries = await Promise.all(raw.entries.map(async (e, index): Promise<CardEntry> => {
    let message: CardMessage | null = null;
    try { message = parseMessage(JSON.parse(await open(link.msgKey, e.m))); } catch { /* unreadable: skipped */ }
    return { index, message, hidden: raw.hidden.includes(index), ...(e.t && { sealedToken: e.t }) };
  }));
  return { id: raw.id, header, entries, status: raw.status, pub: raw.pub, ...(raw.gift && { giftSealed: raw.gift }) };
}

/** Add a message (and optionally sats, encrypted so only the organiser can collect them). */
export async function signCard(link: CardLink, pub: string, message: CardMessage, token?: string): Promise<number> {
  const body: { m: string; t?: string } = { m: await seal(link.msgKey, JSON.stringify(message)) };
  if (token) body.t = await sealTo(pub, token);
  return (await api<{ index: number }>(`?id=${link.id}&action=sign`, body)).index;
}

export async function setHidden(link: CardLink & { kind: 'org' }, index: number, hidden: boolean) {
  const { auth } = await organiserKeys(link.secret);
  await api(`?id=${link.id}&action=hide`, { auth, index, hidden });
}

/** Decrypt the contributors' tokens (organiser only). Unreadable ones are skipped. */
export async function openTokens(link: CardLink & { kind: 'org' }, entries: CardEntry[]): Promise<{ index: number; token: string }[]> {
  const { priv } = await organiserKeys(link.secret);
  const out: { index: number; token: string }[] = [];
  for (const e of entries) {
    if (!e.sealedToken || e.hidden) continue;
    try { out.push({ index: e.index, token: await openWith(priv, e.sealedToken) }); } catch { /* skip */ }
  }
  return out;
}

/** Upload the finished gift; returns the recipient's link. */
export async function sendCard(link: CardLink & { kind: 'org' }, encodedGift: string) {
  const giftKey = randomKey();
  const { auth } = await organiserKeys(link.secret);
  await api(`?id=${link.id}&action=send`, { auth, gift: await seal(giftKey, encodedGift) });
  return cardUrl({ kind: 'card', id: link.id, msgKey: link.msgKey, giftKey });
}

/** The recipient: decrypt the finished gift back into a normal gift link payload. */
export async function openGift(link: CardLink & { kind: 'card' }, card: LoadedCard) {
  if (!card.giftSealed) throw new Error('This card hasn’t been sent yet.');
  try { return await open(link.giftKey, card.giftSealed); }
  catch { throw new Error('This card link looks damaged. Ask the sender to share it again.'); }
}
