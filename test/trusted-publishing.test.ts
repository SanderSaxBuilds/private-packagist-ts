import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { githubActionsTokenProvider, PrivatePackagistClient, staticTokenProvider, TrustedPublishingError } from '../src/index.ts';
import { fixture, json, mockFetch, ZIP } from './helpers.ts';

interface Exchange {
  oidcToken: string;
  vectors: Array<{ method: string; url: string; authorization: string }>;
}

const exchange = fixture<Exchange>('php-trusted-publishing.json');
const env = {
  GITHUB_ACTIONS: 'true',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'gh-request-token',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.example/idtoken?api-version=2.0',
};

function exchangeReplies() {
  return [
    json({ audience: 'https://packagist.com/oidc/acme-org' }),
    json({ value: exchange.oidcToken }),
    json({ key: 'packagist_ack_exchanged', secret: 'packagist_acs_exchanged' }),
    json({ id: 99 }),
  ];
}

describe('trusted publishing', () => {
  test('runs the same four requests as the PHP client, with the same signature', async () => {
    const last = exchange.vectors[3]!.authorization;
    const timestamp = Number(/Timestamp=(\d+)/.exec(last)![1]);
    const nonce = /Cnonce=([0-9a-f]+)/.exec(last)![1]!;
    const mock = mockFetch(exchangeReplies());
    const client = new PrivatePackagistClient({ fetch: mock.fetch, now: () => timestamp, nonce: () => nonce });
    client.authenticateWithTrustedPublishing('acme-org', 'acme/package', { env });

    assert.deepEqual(await client.packages.artifacts.add('acme/package', ZIP, 'application/zip', 'package1.zip'), { id: 99 });

    assert.equal(mock.requests.length, 4);
    exchange.vectors.forEach((expected, i) => {
      const actual = mock.requests[i]!;
      assert.equal(actual.method, expected.method, `method of request ${i}`);
      assert.equal(actual.url, expected.url, `URL of request ${i}`);
      assert.equal(actual.headers.get('Authorization') ?? '', expected.authorization, `Authorization of request ${i}`);
    });
  });

  test('exchanges the token once and reuses the credentials', async () => {
    const mock = mockFetch(exchangeReplies().slice(0, 3));
    const client = new PrivatePackagistClient({ fetch: mock.fetch });
    client.authenticateWithTrustedPublishing('acme-org', 'acme/package', { env });
    await Promise.all([client.packages.show('acme/package'), client.packages.show('acme/package'), client.teams.all()]);
    await client.packages.show('acme/package');
    assert.equal(mock.requests.filter((r) => r.url.startsWith('https://packagist.com/api/oidc/')).length, 2);
    assert.equal(mock.requests.length, 3 + 4);
    for (const request of mock.requests.slice(3)) assert.match(request.headers.get('Authorization')!, /Key=packagist_ack_exchanged,/);
  });

  test('accepts a token from any provider', async () => {
    const mock = mockFetch([json({ audience: 'aud' }), json({ key: 'k', secret: 's' })]);
    const client = new PrivatePackagistClient({ fetch: mock.fetch });
    client.authenticateWithTrustedPublishing('org', 'acme/package', { tokenProvider: staticTokenProvider('my-oidc') });
    await client.teams.all();
    assert.equal(mock.requests[1]!.headers.get('Authorization'), 'Bearer my-oidc');
    assert.match(mock.requests[2]!.headers.get('Authorization')!, /Key=k,/);
  });

  test('fails with a clear error outside GitHub Actions', async () => {
    const mock = mockFetch([json({ audience: 'aud' })]);
    const client = new PrivatePackagistClient({ fetch: mock.fetch });
    client.authenticateWithTrustedPublishing('org', 'acme/package', { env: {} });
    await assert.rejects(client.teams.all(), { name: 'TrustedPublishingError', message: 'Unable to generate OIDC token' });
  });

  test('names the missing permission variable', async () => {
    const mock = mockFetch([json({ audience: 'aud' })]);
    const client = new PrivatePackagistClient({ fetch: mock.fetch });
    client.authenticateWithTrustedPublishing('org', 'acme/package', { env: { GITHUB_ACTIONS: 'true' } });
    await assert.rejects(client.teams.all(), /'ACTIONS_ID_TOKEN_REQUEST_TOKEN' environment variable was not found/);
  });

  test('reports a missing audience and a failed exchange', async () => {
    const noAudience = new PrivatePackagistClient({ fetch: mockFetch([json({})]).fetch });
    noAudience.authenticateWithTrustedPublishing('org', 'pkg', { tokenProvider: () => 't' });
    await assert.rejects(noAudience.teams.all(), { name: 'TrustedPublishingError', message: 'Unable to get audience' });

    const noKey = new PrivatePackagistClient({ fetch: mockFetch([json({ audience: 'a' }), json({ key: 'k' })]).fetch });
    noKey.authenticateWithTrustedPublishing('org', 'pkg', { tokenProvider: () => 't' });
    await assert.rejects(noKey.teams.all(), { name: 'TrustedPublishingError', message: 'Unable to exchange token' });
  });

  test('a rejected exchange surfaces as the HTTP error and is tried again on the next call', async () => {
    const mock = mockFetch([json({ audience: 'a' }), json({ message: 'Package not configured for trusted publishing' }, 403)]);
    const client = new PrivatePackagistClient({ fetch: mock.fetch, retry: false });
    client.authenticateWithTrustedPublishing('org', 'pkg', { tokenProvider: () => 't' });
    await assert.rejects(client.teams.all(), { name: 'PermissionDeniedError', message: 'Package not configured for trusted publishing' });
    mock.queue.push(json({ audience: 'a' }), json({ key: 'k', secret: 's' }), json([]));
    await client.teams.all();
    assert.match(mock.requests.at(-1)!.headers.get('Authorization')!, /Key=k,/);
  });

  test('the GitHub provider reports a failed token request', async () => {
    const provider = githubActionsTokenProvider({ env });
    const fetchImpl = mockFetch([new Response('nope', { status: 401 })]).fetch;
    await assert.rejects(Promise.resolve(provider('aud', { fetch: fetchImpl })), (error: unknown) => {
      assert.ok(error instanceof TrustedPublishingError);
      assert.equal(error.message, 'GitHub Actions: OIDC token request failed with status code 401 and body nope');
      return true;
    });
  });

  test('the GitHub provider refuses a response without a token', async () => {
    const provider = githubActionsTokenProvider({ env });
    const fetchImpl = mockFetch([json({ other: 1 })]).fetch;
    await assert.rejects(Promise.resolve(provider('aud', { fetch: fetchImpl })), { message: 'GitHub Actions: OIDC token is invalid' });
  });
});
