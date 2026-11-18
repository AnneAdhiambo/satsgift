// Everything that talks to a Cashu mint lives here.
import { Wallet, getEncodedToken, getTokenMetadata, MintQuoteState, CheckStateEnum } from '@cashu/cashu-ts';

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
