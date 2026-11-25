// Browser saving, so a refresh never loses sats. Everything stays in this browser's localStorage.
// Every read is validated: stored data may be old, edited by hand, or missing.
import { formats, themes, type Format, type Theme } from './themes.ts';
import { DEFAULT_OCCASION, OCCASION_LABEL_MAX, findOccasion } from './occasions.ts';
import { LETTER_MAX, NAME_MAX, NOTE_MAX, SIGNED_BY_MAX, TEAM_MAX_RECIPIENTS, TEAM_MAX_SATS_EACH, type TeamRecipient } from './teamSend.ts';

const KEY = { draft: 'satsgift:v1:draft', invoice: 'satsgift:v1:invoice', teamInvoice: 'satsgift:v1:team-invoice', cardInvoice: 'satsgift:v1:card-invoice', gifts: 'satsgift:v1:gifts', team: 'satsgift:v1:team', cards: 'satsgift:v1:cards' } as const;
export type InvoiceSlot = 'gift' | 'team' | 'card';
const invoiceKey = (slot: InvoiceSlot) => slot === 'team' ? KEY.teamInvoice : slot === 'card' ? KEY.cardInvoice : KEY.invoice;

export type Draft = {
  step: number; token: string; demo: boolean;
  format: Format; theme: Theme; to: string; from: string; message: string;
};
export type PendingInvoice = { mint: string; quote: string; request: string; amount: number; expiry: number | null };
/** `code` is the secret that opens a locked link (a generated code or the answer to `question`); empty if unlocked.
 *  Gifts from one team send share a `team` id; `teamName` is the sender's company. */
export type SentGift = { token: string; amount: number; mint: string; to: string; from: string; link: string; code?: string; question?: string; team?: string; teamName?: string; createdAt: number };

/** A team send in progress. `paidToken` holds the sats between payment and the split. */
export type TeamDraft = {
  id: string; step: number; company: string; letter: string; signedBy: string; occasion: string; occasionLabel: string;
  theme: Theme; format: Format; lock: boolean; recipients: TeamRecipient[]; paidToken: string;
};

// ---------- pure validators (unit-tested) ----------
const str = (v: unknown, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : '');
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

export function parseDraft(raw: unknown): Draft | null {
  const d = obj(raw); if (!d) return null;
  const step = typeof d.step === 'number' && d.step >= 1 && d.step <= 4 ? Math.floor(d.step) : 1;
  return {
    step, token: str(d.token), demo: d.demo === true,
    format: (formats.some(f => f.id === d.format) ? d.format : 'card') as Format,
    theme: (typeof d.theme === 'string' && d.theme in themes ? d.theme : 'coral') as Theme,
    to: str(d.to, 50), from: str(d.from, 50), message: str(d.message, 140),
  };
}

export function parseInvoice(raw: unknown): PendingInvoice | null {
  const d = obj(raw);
  if (!d || typeof d.mint !== 'string' || typeof d.quote !== 'string' || typeof d.request !== 'string' || typeof d.amount !== 'number') return null;
  return { mint: d.mint, quote: d.quote, request: d.request, amount: d.amount, expiry: typeof d.expiry === 'number' ? d.expiry : null };
}

export function parseGifts(raw: unknown): SentGift[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(g => {
    const d = obj(g);
    if (!d || typeof d.token !== 'string' || !d.token || typeof d.amount !== 'number') return [];
    return [{ token: d.token, amount: d.amount, mint: str(d.mint), to: str(d.to, 50), from: str(d.from, 50), link: str(d.link, 10000), code: str(d.code, 200), question: str(d.question, 100), team: str(d.team, 40), teamName: str(d.teamName, 50), createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0 }];
  });
}

/** Insert or update a gift (one entry per token), newest first. */
export function upsertGift(list: SentGift[], gift: SentGift): SentGift[] {
  const existing = list.find(g => g.token === gift.token);
  const merged = existing ? { ...gift, createdAt: existing.createdAt } : gift;
  return [merged, ...list.filter(g => g.token !== gift.token)].sort((a, b) => b.createdAt - a.createdAt);
}

/** Swap a reclaimed gift for the fresh token that replaced it, in one write so the sats are never missing. */
export function replaceGift(list: SentGift[], oldToken: string, gift: SentGift): SentGift[] {
  return upsertGift(list.filter(g => g.token !== oldToken), gift);
}

/** A group card this browser organises. `orgUrl` is the private organiser link: the only way back in. */
export type MyCard = { id: string; orgUrl: string; to: string; occasion: string; createdAt: number; recipientUrl?: string; code?: string };
export function parseCards(raw: unknown): MyCard[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(c => {
    const d = obj(c);
    if (!d || typeof d.id !== 'string' || typeof d.orgUrl !== 'string') return [];
    return [{ id: d.id.slice(0, 20), orgUrl: str(d.orgUrl, 500), to: str(d.to, 50), occasion: str(d.occasion, 60), createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0,
      ...(typeof d.recipientUrl === 'string' && { recipientUrl: str(d.recipientUrl, 500) }), ...(typeof d.code === 'string' && { code: str(d.code, 20) }) }];
  });
}

/** Swap one token for several (a team split) in one write. */
export function replaceWithMany(list: SentGift[], oldToken: string, gifts: SentGift[]): SentGift[] {
  return gifts.reduce(upsertGift, list.filter(g => g.token !== oldToken));
}

export function parseTeamDraft(raw: unknown): TeamDraft | null {
  const d = obj(raw); if (!d || typeof d.id !== 'string' || !d.id) return null;
  const recipients = (Array.isArray(d.recipients) ? d.recipients : []).slice(0, TEAM_MAX_RECIPIENTS).flatMap(r => {
    const o = obj(r); if (!o) return [];
    const sats = typeof o.sats === 'number' && Number.isInteger(o.sats) ? Math.min(Math.max(o.sats, 0), TEAM_MAX_SATS_EACH) : 0;
    return [{ name: str(o.name, NAME_MAX), sats, note: str(o.note, NOTE_MAX) }];
  });
  return {
    id: d.id.slice(0, 40), step: typeof d.step === 'number' && d.step >= 1 && d.step <= 4 ? Math.floor(d.step) : 1,
    company: str(d.company, NAME_MAX), letter: str(d.letter, LETTER_MAX), signedBy: str(d.signedBy, SIGNED_BY_MAX),
    occasion: typeof d.occasion === 'string' && findOccasion(d.occasion) ? d.occasion : DEFAULT_OCCASION, occasionLabel: str(d.occasionLabel, OCCASION_LABEL_MAX),
    theme: (typeof d.theme === 'string' && d.theme in themes ? d.theme : 'lagoon') as Theme,
    format: d.format === 'card' ? 'card' : 'scratch', lock: d.lock !== false, recipients, paidToken: str(d.paidToken, 20000),
  };
}

// ---------- localStorage access (never throws: private windows can block storage) ----------
function read(key: string): unknown {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function write(key: string, value: unknown) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const GIFTS_CHANGED = 'satsgift:gifts-changed';
function writeGifts(list: SentGift[]) {
  const ok = write(KEY.gifts, list);
  try { dispatchEvent(new Event(GIFTS_CHANGED)); } catch { /* not in a browser */ }
  return ok;
}

/** Call `onChange` whenever the saved gifts change, in this tab or another one. Returns an unsubscribe function. */
export function watchGifts(onChange: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY.gifts) onChange(); };
  addEventListener(GIFTS_CHANGED, onChange);
  addEventListener('storage', onStorage);
  return () => { removeEventListener(GIFTS_CHANGED, onChange); removeEventListener('storage', onStorage); };
}

export const storage = {
  loadDraft: () => parseDraft(read(KEY.draft)),
  saveDraft: (d: Draft) => write(KEY.draft, d),
  clearDraft: () => write(KEY.draft, null),
  loadInvoice: (slot: InvoiceSlot = 'gift') => parseInvoice(read(invoiceKey(slot))),
  saveInvoice: (i: PendingInvoice, slot: InvoiceSlot = 'gift') => write(invoiceKey(slot), i),
  clearInvoice: (slot: InvoiceSlot = 'gift') => write(invoiceKey(slot), null),
  loadCards: () => parseCards(read(KEY.cards)),
  saveCard: (c: MyCard) => write(KEY.cards, [c, ...parseCards(read(KEY.cards)).filter(x => x.id !== c.id)]),
  loadTeam: () => parseTeamDraft(read(KEY.team)),
  saveTeam: (t: TeamDraft) => write(KEY.team, t),
  clearTeam: () => write(KEY.team, null),
  replaceWithMany: (oldToken: string, gifts: SentGift[]) => writeGifts(replaceWithMany(parseGifts(read(KEY.gifts)), oldToken, gifts)),
  loadGifts: () => parseGifts(read(KEY.gifts)),
  saveGift: (g: SentGift) => writeGifts(upsertGift(parseGifts(read(KEY.gifts)), g)),
  replaceGift: (oldToken: string, g: SentGift) => writeGifts(replaceGift(parseGifts(read(KEY.gifts)), oldToken, g)),
  removeGift: (token: string) => writeGifts(parseGifts(read(KEY.gifts)).filter(g => g.token !== token)),
  /** True when this browser lets us save at all. */
  available(): boolean { try { localStorage.setItem('satsgift:probe', '1'); localStorage.removeItem('satsgift:probe'); return true; } catch { return false; } },
};
