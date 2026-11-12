import { Credentials } from './api/credentials.ts';
import { Customers } from './api/customers.ts';
import { Jobs } from './api/jobs.ts';
import { MirroredRepositories } from './api/mirrored-repositories.ts';
import { Organization } from './api/organization.ts';
import { Packages } from './api/packages.ts';
import { SecurityIssues } from './api/security-issues.ts';
import { Suborganizations } from './api/suborganizations.ts';
import { Subrepositories } from './api/subrepositories.ts';
import { Synchronizations } from './api/synchronizations.ts';
import { Teams } from './api/teams.ts';
import { Tokens } from './api/tokens.ts';
import { VendorBundles } from './api/vendor-bundles.ts';
import { toBytes, type BinaryLike } from './crypto.ts';
import {
  AbortError,
  ConnectionError,
  errorFromResponse,
  InvalidArgumentError,
  PrivatePackagistError,
  TimeoutError,
  TrustedPublishingError,
  UnexpectedResponseError,
} from './errors.ts';
import { decodeBody, parseBaseUrl, parseLinkHeader, parseRetryAfter, resolveRequestUrl } from './http.ts';
import { buildPath } from './path.ts';
import { httpBuildQuery, phpJsonEncode, type QueryValue } from './php.ts';
import { RequestSigner } from './signature.ts';
import { githubActionsTokenProvider, type Environment, type OidcTokenProvider } from './trusted-publishing.ts';
import { VERSION } from './version.ts';

export const DEFAULT_USER_AGENT = `private-packagist-api-ts/${VERSION} (+https://github.com/SanderSaxBuilds/private-packagist-ts)`;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_LIMIT = 500;

export interface RetryOptions {
  /** Retries after the first attempt. Default 2. Set 0 to turn retries off. */
  maxRetries?: number;
  /** First backoff delay when the server sends no Retry-After. Doubles on each retry. Default 500. */
  baseDelayMs?: number;
  /** Longest wait the client accepts, from backoff or Retry-After. A longer Retry-After ends retrying. Default 30000. */
  maxDelayMs?: number;
}

export interface ClientOptions {
  /** Private Packagist URL. Default https://packagist.com. Self-hosted installs pass their own URL. Only scheme, host and port are used. */
  baseUrl?: string | URL;
  /** API key. Same as calling authenticate(key, secret). */
  key?: string;
  /** API secret. */
  secret?: string;
  /** fetch implementation. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Time limit for one attempt of one request, including reading the body. Default 30000. 0 turns it off. */
  timeoutMs?: number;
  /** Retries for 429, 503, and for 500, 502, 504 and network errors on GET, PUT and DELETE. false turns them off. */
  retry?: RetryOptions | false;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
  /** User-Agent header. */
  userAgent?: string;
  /** Clock in Unix seconds for request signatures. For tests. */
  now?: () => number;
  /** Cnonce generator for request signatures. For tests. */
  nonce?: () => string;
  /** How the client waits between retries and job polls. For tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Per-call options. Every API method takes them as its last argument. */
export interface RequestOptions {
  /** Cancels the request. The call rejects with AbortError. */
  signal?: AbortSignal;
  /** Overrides the client's timeoutMs for this call. */
  timeoutMs?: number;
  /** Extra headers for this call. */
  headers?: Record<string, string>;
}

export interface TrustedPublishingOptions {
  /** Where the OIDC token comes from. Defaults to GitHub Actions. */
  tokenProvider?: OidcTokenProvider;
  /** Environment for the default GitHub Actions provider. Defaults to process.env. */
  env?: Environment;
}

type Authorization = 'sign' | 'none' | { bearer: string };

export interface RawRequest {
  method: string;
  /** A path such as "/packages/" ("/api" is added) or an absolute URL on the configured host. */
  path: string;
  /** Query parameters, encoded like PHP http_build_query. */
  query?: Record<string, QueryValue> | undefined;
  /** Request body, sent and signed byte for byte. */
  body?: BinaryLike | null | undefined;
  headers?: Record<string, string> | undefined;
  /** "sign" (default) signs with the API key, "none" sends no Authorization header. */
  auth?: Authorization;
}

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  /** The URL the response came from, after redirects. */
  url: string;
  /** Decoded body: JSON when the response is JSON, otherwise the text. Undefined when empty. */
  data: T;
}

/** A file for artifact uploads. */
export type FileContent = BinaryLike | Blob;

const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' } as const;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 10;
const IDEMPOTENT = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError('The operation was aborted', { cause: signal.reason }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new AbortError('The operation was aborted', { cause: signal?.reason }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** PHP createJsonBody: no body for an empty parameter array, json_encode otherwise. */
export function jsonBody(parameters: unknown): string | null {
  if (parameters === undefined || parameters === null) return null;
  if (Array.isArray(parameters) && parameters.length === 0) return null;
  if (isRecord(parameters) && Object.keys(parameters).length === 0) return null;
  return phpJsonEncode(parameters);
}

/**
 * Client for the Private Packagist API.
 *
 * ```ts
 * const client = new PrivatePackagistClient({ key: process.env.PACKAGIST_API_KEY, secret: process.env.PACKAGIST_API_SECRET });
 * const packages = await client.packages.all();
 * ```
 */
export class PrivatePackagistClient {
  readonly baseUrl: URL;
  readonly credentials: Credentials;
  readonly customers: Customers;
  readonly jobs: Jobs;
  readonly mirroredRepositories: MirroredRepositories;
  readonly organization: Organization;
  readonly packages: Packages;
  readonly securityIssues: SecurityIssues;
  readonly suborganizations: Suborganizations;
  /** @deprecated Subrepositories are called suborganizations now. Use client.suborganizations. */
  readonly subrepositories: Subrepositories;
  /** @deprecated Projects are called suborganizations now. Use client.suborganizations. */
  readonly projects: Subrepositories;
  readonly synchronizations: Synchronizations;
  readonly teams: Teams;
  readonly tokens: Tokens;
  readonly vendorBundles: VendorBundles;

  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #retry: Required<RetryOptions>;
  readonly #headers: Record<string, string>;
  readonly #now: (() => number) | undefined;
  readonly #nonce: (() => string) | undefined;
  readonly #sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  #signer: RequestSigner | null = null;
  #trusted: { organization: string; packageName: string; provider: OidcTokenProvider } | null = null;
  #exchange: Promise<RequestSigner> | null = null;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = parseBaseUrl(options.baseUrl);
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new InvalidArgumentError('No fetch implementation found. Pass one as options.fetch.');
    }
    this.#fetch = fetchImpl;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retry = options.retry === false ? { maxRetries: 0 } : (options.retry ?? {});
    this.#retry = { maxRetries: retry.maxRetries ?? 2, baseDelayMs: retry.baseDelayMs ?? 500, maxDelayMs: retry.maxDelayMs ?? 30_000 };
    this.#headers = { 'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT, ...options.headers };
    this.#now = options.now;
    this.#nonce = options.nonce;
    this.#sleep = options.sleep ?? defaultSleep;
    if (options.key !== undefined || options.secret !== undefined) {
      this.authenticate(options.key ?? '', options.secret ?? '');
    }

    this.credentials = new Credentials(this);
    this.customers = new Customers(this);
    this.jobs = new Jobs(this);
    this.mirroredRepositories = new MirroredRepositories(this);
    this.organization = new Organization(this);
    this.packages = new Packages(this);
    this.securityIssues = new SecurityIssues(this);
    this.suborganizations = new Suborganizations(this);
    this.subrepositories = new Subrepositories(this);
    this.projects = this.subrepositories;
    this.synchronizations = new Synchronizations(this);
    this.teams = new Teams(this);
    this.tokens = new Tokens(this);
    this.vendorBundles = new VendorBundles(this);
  }

  /** Signs every following request with this API key and secret. */
  authenticate(key: string, secret: string): this {
    this.#signer = new RequestSigner(key, secret, { ...(this.#now ? { now: this.#now } : {}), ...(this.#nonce ? { nonce: this.#nonce } : {}) });
    this.#trusted = null;
    this.#exchange = null;
    return this;
  }

  /**
   * Gets API credentials through trusted publishing instead of a stored secret. Before the first
   * request the client fetches the OIDC audience for the organization, asks the token provider
   * (GitHub Actions by default) for a token and exchanges it for a key and secret that are only
   * valid for this package.
   */
  authenticateWithTrustedPublishing(organizationUrlName: string, packageName: string, options: TrustedPublishingOptions = {}): this {
    const provider = options.tokenProvider ?? githubActionsTokenProvider(options.env ? { env: options.env } : {});
    this.#signer = null;
    this.#exchange = null;
    this.#trusted = { organization: organizationUrlName, packageName, provider };
    return this;
  }

  /** Builds a request path from a template, rawurlencoding each argument. */
  buildPath(template: string, ...args: Array<string | number>): string {
    return buildPath(template, ...args);
  }

  /** GET a single resource. */
  async get<T = unknown>(path: string, query?: Record<string, QueryValue>, options?: RequestOptions): Promise<T> {
    const response = await this.request<T>({ method: 'GET', path, query, headers: JSON_HEADERS }, options);
    return response.data;
  }

  /** GET a list, following Link rel="next" until the last page, and return all items. */
  async getCollection<T = unknown>(path: string, query?: Record<string, QueryValue>, options?: RequestOptions): Promise<T[]> {
    const items: T[] = [];
    for await (const page of this.pages<T>(path, query, options)) {
      if (page.status !== 200) return page.data as unknown as T[];
      items.push(...page.data);
    }
    return items;
  }

  /** Like getCollection, but yields the items one by one and only fetches the next page when it is needed. */
  async *paginate<T = unknown>(path: string, query?: Record<string, QueryValue>, options?: RequestOptions): AsyncGenerator<T, void, undefined> {
    for await (const page of this.pages<T>(path, query, options)) {
      if (page.status !== 200) return;
      yield* page.data;
    }
  }

  /** The raw pages of a list endpoint, with status and headers. */
  async *pages<T = unknown>(path: string, query?: Record<string, QueryValue>, options?: RequestOptions): AsyncGenerator<ApiResponse<T[]>, void, undefined> {
    const parameters: Record<string, QueryValue> = { limit: DEFAULT_LIMIT, ...query };
    let next: string | null = `${path}?${httpBuildQuery(parameters)}`;
    let first = true;
    const seen = new Set<string>();
    while (next !== null) {
      const response: ApiResponse<unknown> = await this.request({ method: 'GET', path: next, headers: JSON_HEADERS }, options, first ? 'request' : 'pagination');
      first = false;
      if (response.status === 200 && !Array.isArray(response.data)) {
        throw new UnexpectedResponseError(`Expected a JSON array from ${response.url}, got ${typeof response.data}`);
      }
      yield response as ApiResponse<T[]>;
      if (response.status !== 200) return;
      seen.add(response.url);
      next = parseLinkHeader(response.headers.get('link'), 'next');
      if (next !== null) {
        const resolved = resolveRequestUrl(next, this.baseUrl, 'pagination').href;
        if (seen.has(resolved)) throw new UnexpectedResponseError(`Pagination link "${next}" points back to a page that was already read.`);
      }
    }
  }

  /** POST with a JSON body. */
  async post<T = unknown>(path: string, parameters?: unknown, options?: RequestOptions): Promise<T> {
    return (await this.request<T>({ method: 'POST', path, body: jsonBody(parameters), headers: JSON_HEADERS }, options)).data;
  }

  /** PUT with a JSON body. */
  async put<T = unknown>(path: string, parameters?: unknown, options?: RequestOptions): Promise<T> {
    return (await this.request<T>({ method: 'PUT', path, body: jsonBody(parameters), headers: JSON_HEADERS }, options)).data;
  }

  /** DELETE, with a JSON body when parameters are given. */
  async delete<T = unknown>(path: string, parameters?: unknown, options?: RequestOptions): Promise<T> {
    return (await this.request<T>({ method: 'DELETE', path, body: jsonBody(parameters), headers: JSON_HEADERS }, options)).data;
  }

  /** POST a raw file body, as artifact uploads do. */
  async postFile<T = unknown>(path: string, file: FileContent, headers: Record<string, string>, options?: RequestOptions): Promise<T> {
    const body = typeof Blob !== 'undefined' && file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : (file as BinaryLike);
    return (await this.request<T>({ method: 'POST', path, body, headers: { ...headers, Accept: 'application/json' } }, options)).data;
  }

  /**
   * Sends one request through the whole pipeline: base URL and "/api" prefix, signature,
   * timeout, retries, same-origin redirects and error mapping. Returns status, headers and the
   * decoded body.
   */
  async request<T = unknown>(raw: RawRequest, options: RequestOptions = {}, kind: 'request' | 'pagination' = 'request'): Promise<ApiResponse<T>> {
    let target = raw.path;
    if (raw.query && Object.keys(raw.query).length > 0) {
      target += (target.includes('?') ? '&' : '?') + httpBuildQuery(raw.query);
    }
    let url = resolveRequestUrl(target, this.baseUrl, kind);
    let method = raw.method.toUpperCase();
    let body: Uint8Array | null = raw.body === null || raw.body === undefined ? null : toBytes(raw.body);
    if (body !== null && body.length === 0) body = null;
    const auth = raw.auth ?? 'sign';
    let attempt = 0;
    let redirects = 0;

    for (;;) {
      const headers: Record<string, string> = { ...this.#headers, ...options.headers, ...raw.headers };
      const authorization = await this.#authorization(auth, method, url, body, options);
      if (authorization !== null) headers.Authorization = authorization;

      let result: { status: number; headers: Headers; text: string; type: string };
      try {
        result = await this.#attempt(method, url, headers, body, options);
      } catch (error) {
        if (error instanceof ConnectionError && IDEMPOTENT.has(method) && attempt < this.#retry.maxRetries) {
          await this.#sleep(this.#backoff(attempt), options.signal);
          attempt++;
          continue;
        }
        throw error;
      }

      if (result.type === 'opaqueredirect') {
        throw new ConnectionError(`The response from ${url.href} was a redirect that this fetch implementation does not expose.`);
      }

      const location = result.headers.get('location');
      if (REDIRECTS.has(result.status) && location) {
        if (++redirects > MAX_REDIRECTS) throw new ConnectionError(`Stopped after ${MAX_REDIRECTS} redirects at ${url.href}`);
        url = resolveRequestUrl(new URL(location, url).href, this.baseUrl, 'redirect');
        if (result.status !== 307 && result.status !== 308 && method !== 'GET' && method !== 'HEAD') {
          method = 'GET';
          body = null;
        }
        continue;
      }

      const data = decodeBody(result.headers.get('content-type'), result.text);
      if (result.status >= 400 && result.status <= 600) {
        const retryAfterMs = parseRetryAfter(result.headers.get('retry-after'));
        if (this.#shouldRetry(result.status, method, attempt, retryAfterMs)) {
          await this.#sleep(retryAfterMs ?? this.#backoff(attempt), options.signal);
          attempt++;
          continue;
        }
        throw errorFromResponse({ status: result.status, method, requestUri: url.href, body: data, headers: result.headers, retryAfterMs });
      }
      return { status: result.status, headers: result.headers, url: url.href, data: data as T };
    }
  }

  #backoff(attempt: number): number {
    return Math.min(this.#retry.maxDelayMs, this.#retry.baseDelayMs * 2 ** attempt);
  }

  #shouldRetry(status: number, method: string, attempt: number, retryAfterMs: number | undefined): boolean {
    if (attempt >= this.#retry.maxRetries) return false;
    if (retryAfterMs !== undefined && retryAfterMs > this.#retry.maxDelayMs) return false;
    if (status === 429 || status === 503) return true;
    return (status === 500 || status === 502 || status === 504) && IDEMPOTENT.has(method);
  }

  async #authorization(auth: Authorization, method: string, url: URL, body: Uint8Array | null, options: RequestOptions): Promise<string | null> {
    if (auth === 'none') return null;
    if (typeof auth === 'object') return `Bearer ${auth.bearer}`;
    const signer = this.#signer ?? (this.#trusted ? await this.#trustedSigner(options) : null);
    if (signer === null) return null;
    return signer.authorize({ method, url, body });
  }

  #trustedSigner(options: RequestOptions): Promise<RequestSigner> {
    if (this.#exchange === null) {
      const trusted = this.#trusted!;
      const exchange = this.#exchangeToken(trusted, options);
      this.#exchange = exchange;
      exchange.then(
        (signer) => {
          if (this.#exchange === exchange) {
            this.#signer = signer;
            this.#trusted = null;
            this.#exchange = null;
          }
        },
        () => {
          if (this.#exchange === exchange) this.#exchange = null;
        },
      );
    }
    return this.#exchange;
  }

  async #exchangeToken(
    trusted: { organization: string; packageName: string; provider: OidcTokenProvider },
    options: RequestOptions,
  ): Promise<RequestSigner> {
    const signal = options.signal;
    const audience = await this.request({ method: 'GET', path: buildPath('/oidc/audience/%s', trusted.organization), auth: 'none' }, { ...(signal ? { signal } : {}) });
    const audienceValue = isRecord(audience.data) ? audience.data.audience : undefined;
    if (typeof audienceValue !== 'string' || audienceValue === '') throw new TrustedPublishingError('Unable to get audience');

    let token: string | null | undefined;
    try {
      token = await trusted.provider(audienceValue, { fetch: this.#fetch, signal });
    } catch (error) {
      if (error instanceof PrivatePackagistError) throw error;
      throw new TrustedPublishingError(`Unable to generate OIDC token: ${String((error as Error)?.message ?? error)}`, { cause: error });
    }
    if (!token) throw new TrustedPublishingError('Unable to generate OIDC token');

    const exchanged = await this.request(
      { method: 'POST', path: buildPath('/oidc/token-exchange/%s/%s', trusted.organization, trusted.packageName), auth: { bearer: token } },
      { ...(signal ? { signal } : {}) },
    );
    const data = isRecord(exchanged.data) ? exchanged.data : {};
    if (typeof data.key !== 'string' || typeof data.secret !== 'string' || data.key === '' || data.secret === '') {
      throw new TrustedPublishingError('Unable to exchange token');
    }
    return new RequestSigner(data.key, data.secret, { ...(this.#now ? { now: this.#now } : {}), ...(this.#nonce ? { nonce: this.#nonce } : {}) });
  }

  async #attempt(
    method: string,
    url: URL,
    headers: Record<string, string>,
    body: Uint8Array | null,
    options: RequestOptions,
  ): Promise<{ status: number; headers: Headers; text: string; type: string }> {
    const outer = options.signal;
    if (outer?.aborted) throw new AbortError('The request was aborted', { cause: outer.reason });
    const timeoutMs = options.timeoutMs ?? this.#timeoutMs;
    const controller = new AbortController();
    let timedOut = false;
    const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : undefined;
    const onAbort = (): void => controller.abort(outer?.reason);
    outer?.addEventListener('abort', onAbort, { once: true });
    try {
      const init: RequestInit = { method, headers, redirect: 'manual', signal: controller.signal };
      if (body !== null) {
        const copy = new Uint8Array(body.length);
        copy.set(body);
        init.body = copy;
      }
      const response = await this.#fetch(url.href, init);
      const text = await response.text();
      return { status: response.status, headers: response.headers, text, type: response.type };
    } catch (error) {
      if (timedOut) throw new TimeoutError(timeoutMs, url.href);
      if (outer?.aborted) throw new AbortError('The request was aborted', { cause: outer.reason });
      if (error instanceof PrivatePackagistError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ConnectionError(`${method} ${url.href} failed: ${message}`, { cause: error });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    }
  }

  /** Waits for `ms`, honouring the signal. Used by retries and by jobs.waitForJob. */
  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return this.#sleep(ms, signal);
  }
}
