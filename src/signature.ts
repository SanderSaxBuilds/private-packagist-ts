// PACKAGIST-HMAC-SHA256 request signatures, version 2, as built by the PHP client's
// RequestSignature plugin:
//
//   METHOD \n host \n path \n http_build_query(ksort({body?, cnonce, key, query, timestamp, version}), RFC 3986)
//
// where `query` is the request's query string after parse_str, uksort(strcmp) and
// http_build_query(RFC 3986), and `body` is only present when the body is not empty (or "0").

import { base64, hmac, importHmacKey, randomNonce, toBytes, type BinaryLike } from './crypto.ts';
import { InvalidArgumentError } from './errors.ts';
import { httpBuildQuery, parseStr, rawurlencode, sortKeysStrcmp } from './php.ts';

export const SIGNATURE_VERSION = '2';
export const AUTHORIZATION_SCHEME = 'PACKAGIST-HMAC-SHA256';

/** Canonical form of a query string, as the PHP client signs it. */
export function canonicalQuery(query: string): string {
  const raw = query.startsWith('?') ? query.slice(1) : query;
  if (raw === '') return '';
  return httpBuildQuery(sortKeysStrcmp(parseStr(raw)), 'RFC3986', true);
}

/** PHP's `if ($content)`: an empty body and the one-byte body "0" are both left out of the signature. */
function signsBody(body: Uint8Array): boolean {
  return body.length > 0 && !(body.length === 1 && body[0] === 0x30);
}

export interface SignatureParts {
  method: string;
  /** Host name only, lowercase, without the port. Empty for a request without a host. */
  host: string;
  /** The path exactly as sent, still percent-encoded. */
  path: string;
  /** The raw query string without the leading "?". */
  query: string;
  body?: BinaryLike | null | undefined;
  key: string;
  timestamp: number;
  nonce: string;
}

/** Builds the string the HMAC is computed over. */
export function stringToSign(parts: SignatureParts): string {
  const params: Array<[string, string]> = [];
  const body = parts.body === null || parts.body === undefined ? new Uint8Array(0) : toBytes(parts.body);
  let encodedBody: string | null = null;
  if (signsBody(body)) encodedBody = rawurlencode(body);
  params.push(['cnonce', rawurlencode(parts.nonce)]);
  params.push(['key', rawurlencode(parts.key)]);
  params.push(['query', rawurlencode(canonicalQuery(parts.query))]);
  params.push(['timestamp', rawurlencode(String(Math.trunc(parts.timestamp)))]);
  params.push(['version', SIGNATURE_VERSION]);
  const normalized = (encodedBody === null ? '' : `body=${encodedBody}&`) + params.map(([k, v]) => `${k}=${v}`).join('&');
  return `${parts.method}\n${parts.host}\n${parts.path}\n${normalized}`;
}

export function authorizationHeader(key: string, timestamp: number, nonce: string, signature: string): string {
  return `${AUTHORIZATION_SCHEME} Key=${key}, Timestamp=${Math.trunc(timestamp)}, Cnonce=${nonce}, Version=${SIGNATURE_VERSION}, Signature=${signature}`;
}

/** The parts of a URL that go into the signature. Absolute URLs go through the WHATWG URL parser, the same one fetch uses. */
export function urlParts(url: string | URL): { host: string; path: string; query: string } {
  if (url instanceof URL || /^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    const parsed = url instanceof URL ? url : new URL(url);
    return { host: parsed.hostname, path: parsed.pathname, query: parsed.search.replace(/^\?/, '') };
  }
  const hash = url.indexOf('#');
  const withoutHash = hash < 0 ? url : url.slice(0, hash);
  const q = withoutHash.indexOf('?');
  return { host: '', path: q < 0 ? withoutHash : withoutHash.slice(0, q), query: q < 0 ? '' : withoutHash.slice(q + 1) };
}

export interface SignerOptions {
  /** Unix time in seconds. Defaults to the system clock. */
  now?: () => number;
  /** Cnonce generator. Defaults to 20 random bytes as hex. */
  nonce?: () => string;
}

export interface SignInput {
  method: string;
  url: string | URL;
  body?: BinaryLike | null | undefined;
}

export interface SignedRequest {
  authorization: string;
  signature: string;
  timestamp: number;
  nonce: string;
  stringToSign: string;
}

/** Signs requests with one API key and secret. The HMAC key is imported once and reused. */
export class RequestSigner {
  readonly key: string;
  readonly #secret: string;
  readonly #now: () => number;
  readonly #nonce: () => string;
  #cryptoKey: Promise<CryptoKey> | null = null;

  constructor(key: string, secret: string, options: SignerOptions = {}) {
    if (!key || !secret) throw new InvalidArgumentError('key and secret must be set');
    this.key = key;
    this.#secret = secret;
    this.#now = options.now ?? (() => Math.floor(Date.now() / 1000));
    this.#nonce = options.nonce ?? randomNonce;
  }

  async sign(input: SignInput): Promise<SignedRequest> {
    const { host, path, query } = urlParts(input.url);
    const timestamp = Math.trunc(this.#now());
    const nonce = this.#nonce();
    const data = stringToSign({ method: input.method, host, path, query, body: input.body, key: this.key, timestamp, nonce });
    this.#cryptoKey ??= importHmacKey(this.#secret, 'SHA-256');
    const signature = base64(await hmac(await this.#cryptoKey, data));
    return { authorization: authorizationHeader(this.key, timestamp, nonce, signature), signature, timestamp, nonce, stringToSign: data };
  }

  /** Returns only the Authorization header value. */
  async authorize(input: SignInput): Promise<string> {
    return (await this.sign(input)).authorization;
  }
}

/** One-off signature with a fixed timestamp and nonce, handy for tests and for checking a server implementation. */
export async function signRequest(
  input: SignInput & { key: string; secret: string; timestamp: number; nonce: string },
): Promise<SignedRequest> {
  const signer = new RequestSigner(input.key, input.secret, { now: () => input.timestamp, nonce: () => input.nonce });
  return signer.sign(input);
}
