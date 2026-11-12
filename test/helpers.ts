import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function fixture<T = unknown>(name: string): T {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Headers;
  body: Uint8Array | null;
  signal: AbortSignal | null;
}

export type Reply = Response | ((request: RecordedRequest) => Response | Promise<Response>);

/** A fetch that records every request and answers from a queue, then with the fallback. */
export function mockFetch(replies: Reply[] = [], fallback: Reply = () => json([])) {
  const requests: RecordedRequest[] = [];
  const queue = [...replies];
  const fetchImpl = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    let body: Uint8Array | null = null;
    if (typeof init.body === 'string') body = new TextEncoder().encode(init.body);
    else if (init.body instanceof Uint8Array) body = new Uint8Array(init.body);
    else if (init.body instanceof ArrayBuffer) body = new Uint8Array(init.body);
    const request: RecordedRequest = {
      method: init.method ?? 'GET',
      url: String(input instanceof Request ? input.url : input),
      headers: new Headers(init.headers),
      body,
      signal: init.signal ?? null,
    };
    requests.push(request);
    const reply = queue.shift() ?? fallback;
    return typeof reply === 'function' ? reply(request) : reply;
  };
  return { fetch: fetchImpl as typeof fetch, requests, queue };
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  if (status === 204) return new Response(null, { status, headers });
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

export function text(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain', ...headers } });
}

/** A reply that never answers until the request is aborted. */
export function hang(request: RecordedRequest): Promise<Response> {
  return new Promise((_, reject) => {
    const signal = request.signal;
    if (!signal) return;
    const fail = (): void => reject(signal.reason ?? new DOMException('This operation was aborted', 'AbortError'));
    if (signal.aborted) fail();
    signal.addEventListener('abort', fail, { once: true });
  });
}

/** The artifact bytes the PHP vector generator uploads: "PK\x03\x04" then every byte value. */
export const ZIP = (() => {
  const bytes = new Uint8Array(4 + 256);
  bytes.set([0x50, 0x4b, 0x03, 0x04]);
  for (let i = 0; i < 256; i++) bytes[4 + i] = i;
  return bytes;
})();

export function bytesOf(body: string, encoding?: string): Uint8Array {
  return encoding === 'base64' ? new Uint8Array(Buffer.from(body, 'base64')) : new TextEncoder().encode(body);
}

export const noSleep = async (): Promise<void> => {};
