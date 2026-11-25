// Group-card encryption, all in the browser. The server only ever sees the outputs of these.
//
//   msgKey     → in the invite, organiser and recipient links. Encrypts the card header and messages.
//   org secret → only in the organiser link. Gives (a) the token that proves "I'm the organiser"
//                and (b) a secp256k1 key that contributors' sats are encrypted to.
//   giftKey    → only in the recipient link. Encrypts the finished gift.
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64(text: string) {
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const unhex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], h => parseInt(h, 16));

/** 32 random bytes, base64url: a fresh msgKey, giftKey or organiser secret. */
export const randomKey = () => b64(crypto.getRandomValues(new Uint8Array(32)));

async function aesKey(raw: Uint8Array) {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Encrypt text with a base64url key → "iv.ciphertext". */
export async function seal(key: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(unb64(key)), enc.encode(text));
  return `${b64(iv)}.${b64(new Uint8Array(data))}`;
}
export async function open(key: string, sealed: string): Promise<string> {
  const [iv, data] = sealed.split('.');
  if (!iv || !data) throw new Error('bad ciphertext');
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(unb64(key)), unb64(data)));
}

/** Everything the organiser secret unlocks. `authHash` is what the server stores. */
export async function organiserKeys(secret: string) {
  const raw = unb64(secret);
  const auth = hex(sha256(new Uint8Array([...enc.encode('satsgift-card-auth:'), ...raw])));
  const priv = secp256k1.utils.randomSecretKey(sha512(new Uint8Array([...enc.encode('satsgift-card-key:'), ...raw])).slice(0, 48));
  return { auth, authHash: hex(sha256(enc.encode(auth))), priv, pub: hex(secp256k1.getPublicKey(priv, true)) };
}

/** Encrypt to the organiser's public key (ephemeral ECDH + AES-GCM) → "ephemeralPub.iv.ciphertext". */
export async function sealTo(pubHex: string, text: string): Promise<string> {
  const eph = secp256k1.utils.randomSecretKey();
  const shared = secp256k1.getSharedSecret(eph, unhex(pubHex), true);
  return `${b64(secp256k1.getPublicKey(eph, true))}.${await seal(b64(sha256(shared.slice(1))), text)}`;
}
export async function openWith(priv: Uint8Array, sealed: string): Promise<string> {
  const dot = sealed.indexOf('.');
  const shared = secp256k1.getSharedSecret(priv, unb64(sealed.slice(0, dot)), true);
  return open(b64(sha256(shared.slice(1))), sealed.slice(dot + 1));
}

// ---------- links ----------
export const CARD_HASH = { join: '#join=', org: '#org=', card: '#card=' } as const;
export type CardLink =
  | { kind: 'join'; id: string; msgKey: string }
  | { kind: 'org'; id: string; msgKey: string; secret: string }
  | { kind: 'card'; id: string; msgKey: string; giftKey: string };

const KEY = /^[A-Za-z0-9_-]{43}$/;
const ID = /^[A-Za-z0-9]{12}$/;

export function parseCardHash(hash: string): CardLink | null {
  for (const kind of ['join', 'org', 'card'] as const) {
    if (!hash.startsWith(CARD_HASH[kind])) continue;
    const [id, msgKey, extra, ...rest] = hash.slice(CARD_HASH[kind].length).split('.');
    if (!ID.test(id ?? '') || !KEY.test(msgKey ?? '') || rest.length) return null;
    if (kind === 'join') return extra === undefined ? { kind, id, msgKey } : null;
    if (!KEY.test(extra ?? '')) return null;
    return kind === 'org' ? { kind, id, msgKey, secret: extra } : { kind, id, msgKey, giftKey: extra };
  }
  return null;
}

export function cardUrl(link: CardLink, base = `${location.origin}${location.pathname}`) {
  const parts = link.kind === 'join' ? [link.id, link.msgKey] : link.kind === 'org' ? [link.id, link.msgKey, link.secret] : [link.id, link.msgKey, link.giftKey];
  return `${base}${CARD_HASH[link.kind]}${parts.join('.')}`;
}
