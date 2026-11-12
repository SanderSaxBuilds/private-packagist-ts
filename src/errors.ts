// Error classes. Every error the client throws extends PrivatePackagistError, so one
// `instanceof PrivatePackagistError` check catches all of them.

import type { Job } from './schema.ts';

export class PrivatePackagistError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** A parameter failed a check before any request was sent (PHP: InvalidArgumentException). */
export class InvalidArgumentError extends PrivatePackagistError {}

export interface HttpErrorInit {
  status: number;
  method: string;
  requestUri: string;
  body: unknown;
  headers: Headers;
}

/**
 * The API answered with a 4xx or 5xx status (PHP: HttpTransportException).
 * `message` is the API's own error message when it sent one.
 */
export class HttpError extends PrivatePackagistError {
  readonly status: number;
  readonly method: string;
  readonly requestUri: string;
  /** The decoded response body, JSON when the API sent JSON, otherwise the raw text. */
  readonly body: unknown;
  readonly headers: Headers;
  /** Link to the API documentation, when the error body carries one. */
  readonly documentationUrl: string | undefined;

  constructor(message: string, init: HttpErrorInit) {
    super(message);
    this.status = init.status;
    this.method = init.method;
    this.requestUri = init.requestUri;
    this.body = init.body;
    this.headers = init.headers;
    const body = init.body as { documentationUrl?: unknown } | null;
    this.documentationUrl = typeof body?.documentationUrl === 'string' ? body.documentationUrl : undefined;
  }

  /** Same as `status`, under the name the PHP exceptions use. */
  get code(): number {
    return this.status;
  }
}

/** PHP's name for HttpError. */
export const HttpTransportError = HttpError;

/** 400. A bad parameter, or a signature the API rejected ("Invalid signature", "Timestamp is beyond..."). */
export class BadRequestError extends HttpError {}
/** 401. The API key is missing, wrong or revoked. */
export class AuthenticationError extends HttpError {}
/** 403. The credential is valid but may not do this. */
export class PermissionDeniedError extends HttpError {}
/** 404 (PHP: ResourceNotFoundException). */
export class ResourceNotFoundError extends HttpError {}
/** 409. */
export class ConflictError extends HttpError {}
/** 413. An artifact upload was larger than the API accepts. */
export class PayloadTooLargeError extends HttpError {}
/** 429, after any retries ran out. */
export class RateLimitError extends HttpError {
  /** Milliseconds the server asked to wait, from Retry-After. */
  readonly retryAfterMs: number | undefined;

  constructor(message: string, init: HttpErrorInit & { retryAfterMs?: number | undefined }) {
    super(message, init);
    this.retryAfterMs = init.retryAfterMs;
  }
}
/** 5xx. */
export class ServerError extends HttpError {}

/** The request could not be sent or the connection broke. `cause` holds the fetch error. */
export class ConnectionError extends PrivatePackagistError {}

/** The request took longer than `timeoutMs`. */
export class TimeoutError extends PrivatePackagistError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, url: string) {
    super(`Request to ${url} timed out after ${timeoutMs} ms`);
    this.timeoutMs = timeoutMs;
  }
}

/** The caller's AbortSignal fired. `cause` holds the signal's reason. */
export class AbortError extends PrivatePackagistError {}

/**
 * A pagination link or redirect pointed away from the configured Private Packagist URL. The
 * client refuses to send a signed request there (the PHP client throws a RuntimeException).
 */
export class OriginMismatchError extends PrivatePackagistError {
  readonly url: string;

  constructor(message: string, url: string) {
    super(message);
    this.url = url;
  }
}

/** The response could not be used, for example a list endpoint that did not return a JSON array. */
export class UnexpectedResponseError extends PrivatePackagistError {}

/** A job ended with status "error" while waiting for it (PHP: JobErrorException). */
export class JobFailedError extends PrivatePackagistError {
  readonly job: Job;

  constructor(job: Job) {
    super(job.message ?? `Job ${job.id} failed`);
    this.job = job;
  }
}

/** A job did not finish in the time allowed (PHP: JobTimeoutException). */
export class JobTimeoutError extends PrivatePackagistError {
  readonly jobId: string;
  readonly maxWaitSeconds: number;

  constructor(jobId: string, maxWaitSeconds: number) {
    super(`Job ${jobId} has not finished after ${maxWaitSeconds} seconds`);
    this.jobId = jobId;
    this.maxWaitSeconds = maxWaitSeconds;
  }
}

/** Trusted publishing could not get an OIDC token or exchange it for API credentials. */
export class TrustedPublishingError extends PrivatePackagistError {}

function messageFromBody(body: unknown): string {
  if (body !== null && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    return typeof message === 'string' ? message : JSON.stringify(message);
  }
  if (typeof body === 'string') return body;
  return JSON.stringify(body) ?? '';
}

/** Picks the error class for a status and builds it with the message the PHP client would use. */
export function errorFromResponse(init: HttpErrorInit & { retryAfterMs?: number | undefined }): HttpError {
  const message = messageFromBody(init.body) || `HTTP ${init.status}`;
  switch (init.status) {
    case 400:
      return new BadRequestError(message, init);
    case 401:
      return new AuthenticationError(message, init);
    case 403:
      return new PermissionDeniedError(message, init);
    case 404:
      return new ResourceNotFoundError(message, init);
    case 409:
      return new ConflictError(message, init);
    case 413:
      return new PayloadTooLargeError(message, init);
    case 429:
      return new RateLimitError(message, init);
    default:
      return init.status >= 500 ? new ServerError(message, init) : new HttpError(message, init);
  }
}
