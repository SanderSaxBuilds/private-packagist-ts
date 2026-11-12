// Pieces of the HTTP layer that do not need the client: URL handling, the Link header, the
// response body and Retry-After.

import { OriginMismatchError } from './errors.ts';

export const DEFAULT_BASE_URL = 'https://packagist.com';
export const API_PREFIX = '/api';

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/** Default port of a scheme, or null when it has none (the effectivePort of the PHP client). */
function effectivePort(url: URL): string {
  if (url.port !== '') return url.port;
  if (url.protocol === 'https:') return '443';
  if (url.protocol === 'http:') return '80';
  return '';
}

export function sameOrigin(a: URL, b: URL): boolean {
  return a.protocol === b.protocol && a.hostname === b.hostname && effectivePort(a) === effectivePort(b);
}

/** Parses the base URL. Only scheme, host and port are used, like the PHP AddHostPlugin. */
export function parseBaseUrl(baseUrl: string | URL | undefined): URL {
  const raw = baseUrl === undefined || baseUrl === '' ? DEFAULT_BASE_URL : baseUrl;
  const url = new URL(raw);
  return new URL(url.origin);
}

/**
 * Turns a request path, or a URL from a Link or Location header, into the URL that is sent.
 * Relative paths get the base host, and "/api" is put in front of any path that does not start
 * with it (PHP: PathPrepend). Absolute URLs must point at the base host.
 */
export function resolveRequestUrl(target: string, base: URL, kind: 'request' | 'pagination' | 'redirect' = 'request'): URL {
  let url: URL;
  if (target.startsWith('//')) {
    throw new OriginMismatchError(refusal(kind, target, base), target);
  }
  if (ABSOLUTE.test(target)) {
    try {
      url = new URL(target);
    } catch {
      throw new OriginMismatchError(`${label(kind)} "${target}" is not a valid URL.`, target);
    }
    if (!sameOrigin(url, base)) throw new OriginMismatchError(refusal(kind, target, base), target);
  } else {
    const path = target.startsWith('/') ? target : `/${target}`;
    url = new URL(path, base);
  }
  if (!url.pathname.startsWith(API_PREFIX)) url.pathname = API_PREFIX + url.pathname;
  url.hash = '';
  return url;
}

function label(kind: 'request' | 'pagination' | 'redirect'): string {
  return kind === 'pagination' ? 'Pagination link' : kind === 'redirect' ? 'Redirect target' : 'Request URL';
}

function refusal(kind: 'request' | 'pagination' | 'redirect', target: string, base: URL): string {
  const what = kind === 'pagination' ? 'follow the pagination link' : kind === 'redirect' ? 'follow the redirect to' : 'send a request to';
  return `Refusing to ${what} "${target}": it points outside the configured Private Packagist URL "${base.origin}".`;
}

/**
 * Finds the URL of one relation in a Link header, the way the PHP client does: split on ",",
 * then match `<url>; rel="type"`.
 */
export function parseLinkHeader(header: string | null | undefined, type: string): string | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = /<(.*)>; rel="(.*)"/i.exec(part.trim().replace(/^,+|,+$/g, ''));
    if (match && match[2] === type) return match[1] ?? null;
  }
  return null;
}

/**
 * Decodes a response body like the PHP ResponseMediator: JSON when the Content-Type starts with
 * application/json and the body parses, otherwise the text itself. An empty body gives undefined.
 */
export function decodeBody(contentType: string | null, text: string): unknown {
  if (text === '') return undefined;
  if ((contentType ?? '').toLowerCase().startsWith('application/json')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

/** Retry-After as milliseconds, from either delta seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, nowMs: number = Date.now()): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - nowMs);
}
