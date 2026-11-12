// Small helpers on top of the Web Crypto API, which Node 20+, Deno, Bun, Cloudflare Workers and
// browsers all provide as globalThis.crypto.

const encoder = new TextEncoder();

function subtle(): SubtleCrypto {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) {
    throw new Error('Web Crypto (globalThis.crypto.subtle) is not available in this runtime');
  }
  return crypto.subtle;
}

export type BinaryLike = string | Uint8Array | ArrayBuffer;

export function toBytes(value: BinaryLike): Uint8Array {
  if (typeof value === 'string') return encoder.encode(value);
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}

/** HMAC with an empty key is defined (the key is zero-padded), but Web Crypto refuses it. A single zero byte pads to the same block. */
function keyBytes(secret: BinaryLike): Uint8Array<ArrayBuffer> {
  const bytes = toBytes(secret);
  const copy = new Uint8Array(bytes.length === 0 ? 1 : bytes.length);
  copy.set(bytes);
  return copy;
}

function buffer(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
}

export type HmacAlgorithm = 'SHA-256' | 'SHA-1';

export async function importHmacKey(secret: BinaryLike, hash: HmacAlgorithm): Promise<CryptoKey> {
  return subtle().importKey('raw', keyBytes(secret), { name: 'HMAC', hash }, false, ['sign']);
}

export async function hmac(key: CryptoKey, data: BinaryLike): Promise<Uint8Array> {
  return new Uint8Array(await subtle().sign('HMAC', key, buffer(toBytes(data))));
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += BASE64[(n >> 18) & 63]! + BASE64[(n >> 12) & 63]! + BASE64[(n >> 6) & 63]! + BASE64[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += BASE64[(n >> 18) & 63]! + BASE64[(n >> 12) & 63]! + '==';
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += BASE64[(n >> 18) & 63]! + BASE64[(n >> 12) & 63]! + BASE64[(n >> 6) & 63]! + '=';
  }
  return out;
}

export function hex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** 20 random bytes as 40 hex characters, the same shape as the PHP client's bin2hex(random_bytes(20)). */
export function randomNonce(): string {
  const bytes = new Uint8Array(20);
  globalThis.crypto.getRandomValues(bytes);
  return hex(bytes);
}

/** Compares two strings without returning early on the first difference. */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
