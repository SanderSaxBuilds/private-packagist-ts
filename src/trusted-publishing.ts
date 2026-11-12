// OIDC tokens for trusted publishing. The client asks Private Packagist for the audience, gets an
// OIDC token for it from the CI provider, and exchanges that token for a short-lived API key and
// secret, all before the first signed request.

import { TrustedPublishingError } from './errors.ts';

export interface OidcTokenContext {
  /** The fetch the client uses, so a provider can reuse a mocked or proxied fetch. */
  fetch: typeof fetch;
  signal?: AbortSignal | undefined;
}

/** Returns an OIDC token for the audience, or null when this environment cannot issue one. */
export type OidcTokenProvider = (audience: string, context: OidcTokenContext) => Promise<string | null | undefined> | string | null | undefined;

export type Environment = Record<string, string | undefined>;

function processEnv(): Environment {
  const proc = (globalThis as { process?: { env?: Environment } }).process;
  return proc?.env ?? {};
}

export interface GitHubActionsTokenProviderOptions {
  /** Environment variables to read. Defaults to process.env. */
  env?: Environment;
}

/**
 * Gets the OIDC token from GitHub Actions, the same way the PHP client's oidc-identities package
 * does. The workflow needs `permissions: id-token: write`. Outside GitHub Actions it returns null.
 */
export function githubActionsTokenProvider(options: GitHubActionsTokenProviderOptions = {}): OidcTokenProvider {
  return async (audience, context) => {
    const env = options.env ?? processEnv();
    if (!env.GITHUB_ACTIONS) return null;
    const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (!requestToken) throw missingVariable('ACTIONS_ID_TOKEN_REQUEST_TOKEN');
    const requestUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL;
    if (!requestUrl) throw missingVariable('ACTIONS_ID_TOKEN_REQUEST_URL');

    let response: Response;
    try {
      response = await context.fetch(`${requestUrl}&audience=${audience}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${requestToken}` },
        ...(context.signal ? { signal: context.signal } : {}),
      });
    } catch (cause) {
      throw new TrustedPublishingError(`GitHub Actions: OIDC token request failed: ${String((cause as Error)?.message ?? cause)}`, { cause });
    }
    const body = await response.text();
    if (response.status !== 200) {
      throw new TrustedPublishingError(`GitHub Actions: OIDC token request failed with status code ${response.status} and body ${body}`);
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(body);
    } catch {
      throw new TrustedPublishingError('GitHub Actions: invalid JSON received');
    }
    const value = (decoded as { value?: unknown } | null)?.value;
    if (typeof value !== 'string' || value === '') throw new TrustedPublishingError('GitHub Actions: OIDC token is invalid');
    return value;
  };
}

function missingVariable(name: string): TrustedPublishingError {
  return new TrustedPublishingError(
    `GitHub Actions: missing or insufficient OIDC token permissions, the '${name}' environment variable was not found`,
  );
}

/** Uses a token you already have, for example from another CI provider. */
export function staticTokenProvider(token: string): OidcTokenProvider {
  return () => token;
}
