// Lightning addresses (LUD-16): name@domain → LNURL-pay → a BOLT11 invoice for a chosen amount.

export type PayTarget =
  | { kind: 'address'; address: string }
  | { kind: 'invoice'; invoice: string };

const ADDRESS = /^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const INVOICE = /^ln(bc|tb|bcrt|tbs)[0-9a-z]+$/i;

/** Work out what the recipient typed: a Lightning address or an invoice. */
export function parsePayTarget(raw: string): PayTarget | null {
  const value = raw.trim().replace(/^lightning:/i, '');
  if (ADDRESS.test(value)) return { kind: 'address', address: value.toLowerCase() };
  if (INVOICE.test(value)) return { kind: 'invoice', invoice: value.toLowerCase() };
  return null;
}

export type PayParams = { callback: string; minSats: number; maxSats: number };
type Fetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** A problem with the Lightning address itself; the message is safe to show as-is. */
export class LnurlError extends Error {}
const bad = (reason: string) => new LnurlError(reason);

/** Step 1: ask the address's server how it accepts payments. */
export async function lookupAddress(address: string, fetchJson: Fetch = fetch): Promise<PayParams> {
  const [name, domain] = address.split('@');
  let data: Record<string, unknown>;
  try {
    const res = await fetchJson(`https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`);
    data = await res.json() as Record<string, unknown>;
  } catch { throw bad(`Couldn’t reach ${domain}. Check the address, or paste an invoice instead.`); }
  if (data.status === 'ERROR') throw bad(typeof data.reason === 'string' ? data.reason : 'That Lightning address isn’t accepting payments.');
  if (data.tag !== 'payRequest' || typeof data.callback !== 'string' || !data.callback.startsWith('https://')) throw bad('That doesn’t look like a Lightning address.');
  const minSats = Math.ceil(Number(data.minSendable) / 1000), maxSats = Math.floor(Number(data.maxSendable) / 1000);
  if (!Number.isFinite(minSats) || !Number.isFinite(maxSats) || maxSats < minSats) throw bad('That Lightning address sent back odd limits.');
  return { callback: data.callback, minSats, maxSats };
}

/** Step 2: get an invoice for exactly `sats`. */
export async function invoiceFor(params: PayParams, sats: number, fetchJson: Fetch = fetch): Promise<string> {
  if (sats < params.minSats) throw bad(`This address needs at least ${params.minSats.toLocaleString()} sats.`);
  const url = new URL(params.callback);
  url.searchParams.set('amount', String(Math.min(sats, params.maxSats) * 1000));
  let data: Record<string, unknown>;
  try { data = await (await fetchJson(url.toString())).json() as Record<string, unknown>; }
  catch { throw bad('The Lightning address didn’t send an invoice. Try again, or paste an invoice.'); }
  if (data.status === 'ERROR') throw bad(typeof data.reason === 'string' ? data.reason : 'The Lightning address refused this payment.');
  if (typeof data.pr !== 'string' || !INVOICE.test(data.pr)) throw bad('The Lightning address sent back something that isn’t an invoice.');
  return data.pr.toLowerCase();
}

/**
 * M-Pesa via Tando: every Safaricom M-Pesa number has a Lightning address,
 * 07XXXXXXXX@bitcoin.co.ke, and payments arrive as shillings. Accepts 0712 345 678,
 * +254712345678, 254712345678 or 712345678. Returns null if it isn't a Kenyan mobile number.
 */
export function tandoAddress(phone: string): string | null {
  let digits = phone.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (/^254\d{9}$/.test(digits)) digits = '0' + digits.slice(3);
  else if (/^[71]\d{8}$/.test(digits)) digits = '0' + digits;
  return /^0[71]\d{8}$/.test(digits) ? `${digits}@bitcoin.co.ke` : null;
}
