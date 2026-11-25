// Secret-code lock: the claimable parts of a gift (token + message) are encrypted with a key
// derived from a code the sender passes on separately. The link alone opens nothing.
// AES-256-GCM (WebCrypto) with an scrypt-derived key, so every guess at the code is slow.
import { scryptAsync } from '@noble/hashes/scrypt.js';

export type LockKind = 'code' | 'answer';
export type Sealed = { kind: LockKind; question: string; salt: string; iv: string; data: string };

// Crockford base32: no I, L, O or U, so codes survive being read aloud or handwritten.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 8; // 8 × 5 bits = 40 bits ≈ 1.1 trillion codes
// 64 MiB of memory per guess: about half a second on a phone, and expensive to run in bulk.
const SCRYPT = { N: 2 ** 16, r: 8, p: 1, dkLen: 32 };

export const MIN_ANSWER_LENGTH = 3;

/** A fresh random code, shown as XXXX-XXXX. */
export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  const chars = Array.from(bytes, b => ALPHABET[b & 31]); // 256 is a multiple of 32, so no bias
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/** Ignore case, spaces and dashes, and accept the letters people confuse with digits. */
export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');
}

/** Ignore case and extra spaces, so "Simba " and "simba" match. */
export function normaliseAnswer(input: string): string {
  return input.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export const normaliseSecret = (kind: LockKind, input: string) => kind === 'code' ? normaliseCode(input) : normaliseAnswer(input);

/** Is this a complete code or a long-enough answer? */
export function secretReady(kind: LockKind, input: string): boolean {
  const s = normaliseSecret(kind, input);
  return kind === 'code' ? s.length === CODE_LENGTH && [...s].every(c => ALPHABET.includes(c)) : s.length >= MIN_ANSWER_LENGTH;
}

function b64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(text: string) {
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

async function deriveKey(kind: LockKind, secret: string, salt: Uint8Array) {
  const raw = await scryptAsync(new TextEncoder().encode(normaliseSecret(kind, secret)), salt, SCRYPT);
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(plaintext: string, kind: LockKind, secret: string, question = ''): Promise<Sealed> {
  if (!secretReady(kind, secret)) throw new Error(kind === 'code' ? 'That code isn’t complete.' : 'The answer is too short.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(kind, secret, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
  return { kind, question: kind === 'answer' ? question : '', salt: b64(salt), iv: b64(iv), data: b64(data) };
}

export class WrongSecret extends Error {}

/** Decrypt, or throw WrongSecret if the code is wrong (or the link was altered). */
export async function unseal(sealed: Sealed, secret: string): Promise<string> {
  if (!secretReady(sealed.kind, secret)) throw new WrongSecret(sealed.kind === 'code' ? 'That code isn’t complete.' : 'That answer is too short.');
  try {
    const key = await deriveKey(sealed.kind, secret, unb64(sealed.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, key, unb64(sealed.data));
    return new TextDecoder().decode(plain);
  } catch { throw new WrongSecret('That’s not quite it.'); }
}
