import { getTokenMetadata } from '@cashu/cashu-ts';

export function readGiftToken(raw: string) {
  const token = raw.trim().replace(/^web\+cashu:\/\//i, '').replace(/^cashu:\/\//i, '').replace(/^cashu:/i, '');
  if (!/^cashu[AB]/.test(token)) throw new Error('Paste a complete cashuA or cashuB token.');
  const decoded = getTokenMetadata(token);
  if (decoded.unit !== 'sat') throw new Error('Please use a token denominated in sats.');
  const amount = decoded.amount.toNumber();
  if (!decoded.mint || !decoded.incompleteProofs.length || amount <= 0 || decoded.incompleteProofs.some(p => p.amount.toNumber() <= 0 || typeof p.secret !== 'string' || !p.secret || typeof p.C !== 'string' || !/^(02|03)[a-f0-9]{64}$/i.test(p.C))) throw new Error('This token is missing valid proofs.');
  const url = new URL(decoded.mint);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('The mint address is invalid.');
  return { token, amount, mint: decoded.mint };
}
