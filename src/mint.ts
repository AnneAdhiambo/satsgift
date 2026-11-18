// Everything that talks to a Cashu mint lives here.
import { Wallet, getEncodedToken, getDecodedToken, getTokenMetadata, MintQuoteState, MeltQuoteState, CheckStateEnum, type MeltQuoteBolt11Response, type Proof } from '@cashu/cashu-ts';

export type MintOption = { url: string; name: string; test: boolean };

// TEST MODE: only test mints, so no real bitcoin can be lost while the app is being built.
// To go live, add real mints here, e.g. { url: 'https://mint.minibits.cash/Bitcoin', name: 'Minibits', test: false }.
export const MINTS: MintOption[] = [
  { url: 'https://testnut.cashu.space', name: 'Testnut', test: true },
];
export const DEFAULT_MINT = MINTS[0];

const normalise = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase();
/** Is this mint one SatsGift accepts? */
export function findMint(url: string): MintOption | undefined {
  return MINTS.find(m => normalise(m.url) === normalise(url));
}

export const MIN_SATS = 1;
export const MAX_SATS = 100_000;

export type Invoice = { mint: string; quote: string; request: string; amount: number; expiry: number | null };
export { MintQuoteState };

const wallets = new Map<string, Promise<Wallet>>();

/** One loaded wallet per mint, reused across calls. A failed load is forgotten so it can be retried. */
function getWallet(url: string): Promise<Wallet> {
  let wallet = wallets.get(url);
  if (!wallet) {
    wallet = (async () => { const w = new Wallet(url, { unit: 'sat' }); await w.loadMint(); return w; })();
    wallet.catch(() => wallets.delete(url));
    wallets.set(url, wallet);
  }
  return wallet;
}

/** NUT-04: ask the mint for a Lightning invoice that, once paid, lets us mint `amount` sats. */
export async function createInvoice(mint: string, amount: number): Promise<Invoice> {
  const wallet = await getWallet(mint);
  const quote = await wallet.createMintQuoteBolt11(amount);
  return { mint, quote: quote.quote, request: quote.request, amount, expiry: quote.expiry };
}

export async function invoiceState(invoice: Invoice): Promise<MintQuoteState> {
  const wallet = await getWallet(invoice.mint);
  return (await wallet.checkMintQuoteBolt11(invoice.quote)).state;
}

/** Mint the paid invoice into fresh proofs and return them as a cashuB token. */
export async function claimInvoice(invoice: Invoice): Promise<string> {
  const wallet = await getWallet(invoice.mint);
  const proofs = await wallet.mintProofsBolt11(invoice.amount, invoice.quote);
  // DLEQ proofs only allow offline verification; dropping them halves the token so gift links and QRs stay small.
  return getEncodedToken({ mint: invoice.mint, proofs, unit: 'sat' }, { removeDleq: true });
}

/**
 * NUT-03: swap a pasted token for fresh proofs. This proves the sats are real and unspent,
 * and the sender's original token stops working, so only the gift holds the sats.
 * Returns the new token and the amount after the mint's fee.
 */
export async function moveIntoGift(token: string): Promise<{ token: string; amount: number }> {
  const meta = getTokenMetadata(token);
  if (!findMint(meta.mint)) throw new Error('TEST_MODE');
  const wallet = await getWallet(meta.mint);
  try {
    const proofs = await wallet.receive(token);
    return {
      token: getEncodedToken({ mint: meta.mint, proofs, unit: 'sat' }, { removeDleq: true }),
      amount: proofs.reduce((sum, p) => sum + p.amount.toNumber(), 0),
    };
  } catch (e) {
    if (e instanceof Error && /already spent/i.test(e.message)) throw new Error('SPENT');
    throw e;
  }
}

/** NUT-07: has any proof in this token been spent? `null` when the mint can't be asked. */
export async function tokenClaimed(token: string): Promise<boolean | null> {
  try {
    const meta = getTokenMetadata(token);
    const wallet = await getWallet(meta.mint);
    const states = await wallet.checkProofsStates(meta.incompleteProofs.map(p => ({ secret: p.secret })));
    return states.some(s => s.state === CheckStateEnum.SPENT);
  } catch { return null; }
}

export function mintErrorMessage(e: unknown): string {
  if (e instanceof TypeError) return 'Couldn’t reach the mint. Check your connection and try again.';
  return e instanceof Error && e.message ? `The mint said: ${e.message}` : 'Something went wrong talking to the mint.';
}

// ---------- Paying out to Lightning (NUT-05 melt) ----------

const sum = (proofs: Proof[]) => proofs.reduce((s, p) => s + p.amount.toNumber(), 0);

async function giftProofs(token: string) {
  const meta = getTokenMetadata(token);
  if (!findMint(meta.mint)) throw new Error('TEST_MODE');
  const wallet = await getWallet(meta.mint);
  const proofs = getDecodedToken(token, wallet.keyChain.getKeysets().map(k => k.id)).proofs;
  return { wallet, proofs, mint: meta.mint, available: sum(proofs), inputFee: wallet.getFeesForProofs(proofs).toNumber() };
}

/** A priced payment. The mint holds back `feeReserve` for routing and returns the unused part as change. */
export type PayQuote = { quote: MeltQuoteBolt11Response; amount: number; feeReserve: number; inputFee: number; available: number };
export const payTotal = (q: PayQuote) => q.amount + q.feeReserve + q.inputFee;

/** Ask the mint what paying this invoice from the gift would cost. */
export async function quoteInvoice(token: string, invoice: string): Promise<PayQuote> {
  const g = await giftProofs(token);
  const quote = await g.wallet.createMeltQuoteBolt11(invoice);
  return { quote, amount: quote.amount.toNumber(), feeReserve: quote.fee_reserve.toNumber(), inputFee: g.inputFee, available: g.available };
}

/**
 * For a Lightning address: find the largest payment that still fits after fees.
 * `invoiceFor(sats)` fetches an invoice from the address for that amount.
 */
export async function quoteMax(token: string, invoiceFor: (sats: number) => Promise<string>): Promise<PayQuote> {
  const g = await giftProofs(token);
  let sats = Math.floor((g.available - g.inputFee) / 1.02); // first guess: ~2% routing reserve
  for (let i = 0; i < 4; i++) {
    if (sats < 1) break;
    const q = await quoteInvoice(token, await invoiceFor(sats));
    const over = payTotal(q) - q.available;
    if (over <= 0) return q;
    sats -= over;
  }
  throw new Error('TOO_SMALL');
}

export type PayResult = { state: MeltQuoteState; sent: number; change: string | null; changeAmount: number };

/** Pay the quote with the whole gift. Unused fee reserve comes back as a small change token. */
export async function payQuote(token: string, q: PayQuote): Promise<PayResult> {
  const g = await giftProofs(token);
  try {
    const res = await g.wallet.meltProofsBolt11(q.quote, g.proofs);
    const changeAmount = sum(res.change);
    return {
      state: res.quote.state, sent: q.amount, changeAmount,
      change: changeAmount ? getEncodedToken({ mint: g.mint, proofs: res.change, unit: 'sat' }, { removeDleq: true }) : null,
    };
  } catch (e) {
    if (e instanceof Error && /already spent/i.test(e.message)) throw new Error('SPENT');
    throw e;
  }
}

/** For a payment still in flight. */
export async function paymentState(mintUrl: string, quoteId: string): Promise<MeltQuoteState> {
  const wallet = await getWallet(mintUrl);
  return (await wallet.checkMeltQuoteBolt11(quoteId)).state;
}
export { MeltQuoteState };
