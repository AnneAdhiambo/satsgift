// Browser saving, so a refresh never loses sats. Everything stays in this browser's localStorage.
// Every read is validated: stored data may be old, edited by hand, or missing.
import { formats, themes, type Format, type Theme } from './themes.ts';

const KEY = { draft: 'satsgift:v1:draft', invoice: 'satsgift:v1:invoice', gifts: 'satsgift:v1:gifts' } as const;

export type Draft = {
  step: number; token: string; demo: boolean;
  format: Format; theme: Theme; to: string; from: string; message: string;
};
export type PendingInvoice = { mint: string; quote: string; request: string; amount: number; expiry: number | null };
export type SentGift = { token: string; amount: number; mint: string; to: string; from: string; link: string; createdAt: number };

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
    return [{ token: d.token, amount: d.amount, mint: str(d.mint), to: str(d.to, 50), from: str(d.from, 50), link: str(d.link, 10000), createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0 }];
  });
}

/** Insert or update a gift (one entry per token), newest first. */
export function upsertGift(list: SentGift[], gift: SentGift): SentGift[] {
  const existing = list.find(g => g.token === gift.token);
  const merged = existing ? { ...gift, createdAt: existing.createdAt } : gift;
  return [merged, ...list.filter(g => g.token !== gift.token)].sort((a, b) => b.createdAt - a.createdAt);
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
  loadInvoice: () => parseInvoice(read(KEY.invoice)),
  saveInvoice: (i: PendingInvoice) => write(KEY.invoice, i),
  clearInvoice: () => write(KEY.invoice, null),
  loadGifts: () => parseGifts(read(KEY.gifts)),
  saveGift: (g: SentGift) => writeGifts(upsertGift(parseGifts(read(KEY.gifts)), g)),
  removeGift: (token: string) => writeGifts(parseGifts(read(KEY.gifts)).filter(g => g.token !== token)),
  /** True when this browser lets us save at all. */
  available(): boolean { try { localStorage.setItem('satsgift:probe', '1'); localStorage.removeItem('satsgift:probe'); return true; } catch { return false; } },
};
