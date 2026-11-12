import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  AbortError,
  AuthenticationError,
  BadRequestError,
  ConnectionError,
  DEFAULT_USER_AGENT,
  HttpError,
  HttpTransportError,
  InvalidArgumentError,
  OriginMismatchError,
  parseLinkHeader,
  PermissionDeniedError,
  PrivatePackagistClient,
  PrivatePackagistError,
  RateLimitError,
  ResourceNotFoundError,
  ServerError,
  TeamPermissions,
  TimeoutError,
  UnexpectedResponseError,
  type ClientOptions,
} from '../src/index.ts';
import { hang, json, mockFetch, text, type Reply } from './helpers.ts';

function setup(replies: Reply[] = [], options: ClientOptions = {}) {
  const mock = mockFetch(replies);
  const sleeps: number[] = [];
  const client = new PrivatePackagistClient({
    key: 'key',
    secret: 'secret',
    fetch: mock.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...options,
  });
  return { client, requests: mock.requests, sleeps };
}

describe('configuration', () => {
  test('sends the default User-Agent and extra headers', async () => {
    const { client, requests } = setup([], { headers: { 'X-Trace': 'abc' } });
    await client.teams.all();
    assert.equal(requests[0]!.headers.get('User-Agent'), DEFAULT_USER_AGENT);
    assert.equal(requests[0]!.headers.get('X-Trace'), 'abc');
  });

  test('takes a custom User-Agent and per-call headers', async () => {
    const { client, requests } = setup([], { userAgent: 'deploy-bot/2' });
    await client.teams.all({ headers: { 'X-Request-Id': '7' } });
    assert.equal(requests[0]!.headers.get('User-Agent'), 'deploy-bot/2');
    assert.equal(requests[0]!.headers.get('X-Request-Id'), '7');
  });

  test('per-call headers cannot replace Accept and Content-Type of JSON calls', async () => {
    const { client, requests } = setup();
    await client.teams.all({ headers: { Accept: 'text/html' } });
    assert.equal(requests[0]!.headers.get('Accept'), 'application/json');
  });

  test('sends unsigned requests when no key is set', async () => {
    const mock = mockFetch();
    const client = new PrivatePackagistClient({ fetch: mock.fetch });
    await client.teams.all();
    assert.equal(mock.requests[0]!.headers.get('Authorization'), null);
  });

  test('authenticate switches to a new key', async () => {
    const { client, requests } = setup();
    client.authenticate('other-key', 'other-secret');
    await client.teams.all();
    assert.match(requests[0]!.headers.get('Authorization')!, /Key=other-key,/);
  });

  test('uses only the origin of a self-hosted base URL', async () => {
    const { client, requests } = setup([], { baseUrl: 'https://packagist.example.com:8443/some/path' });
    await client.packages.show('acme/a');
    assert.equal(requests[0]!.url, 'https://packagist.example.com:8443/api/packages/acme%2Fa/');
  });

  test('refuses a missing fetch implementation', () => {
    assert.throws(() => new PrivatePackagistClient({ fetch: 1 as unknown as typeof fetch }), InvalidArgumentError);
  });

  test('exposes projects and subrepositories as the same deprecated object', () => {
    const { client } = setup();
    assert.equal(client.projects, client.subrepositories);
  });
});

describe('errors', () => {
  const cases: Array<[number, new (...args: never[]) => HttpError]> = [
    [400, BadRequestError],
    [401, AuthenticationError],
    [403, PermissionDeniedError],
    [404, ResourceNotFoundError],
    [429, RateLimitError],
    [500, ServerError],
    [418, HttpError],
  ];
  for (const [status, type] of cases) {
    test(`${status} becomes ${type.name}`, async () => {
      const { client } = setup([json({ message: `status ${status}` }, status)], { retry: false });
      await assert.rejects(client.packages.show('acme/a'), (error: unknown) => {
        assert.ok(error instanceof type);
        assert.ok(error instanceof HttpTransportError);
        assert.ok(error instanceof PrivatePackagistError);
        assert.equal(error.status, status);
        assert.equal(error.code, status);
        assert.equal(error.message, `status ${status}`);
        assert.equal(error.method, 'GET');
        assert.equal(error.requestUri, 'https://packagist.com/api/packages/acme%2Fa/');
        return true;
      });
    });
  }

  test('uses the raw text when the error body is not JSON', async () => {
    const { client } = setup([text('Bad Gateway from proxy', 502)], { retry: false });
    await assert.rejects(client.teams.show(1), { name: 'ServerError', message: 'Bad Gateway from proxy' });
  });

  test('uses the JSON body when it has no message, like json_encode in PHP', async () => {
    const { client } = setup([json({ errors: ['x'] }, 422)]);
    await assert.rejects(client.teams.show(1), { name: 'HttpError', message: '{"errors":["x"]}' });
  });

  test('keeps the decoded body and the documentation link', async () => {
    const body = { message: 'Invalid signature', documentationUrl: 'https://packagist.com/docs/api' };
    const { client } = setup([json(body, 400)]);
    await assert.rejects(client.teams.all(), (error: unknown) => {
      assert.ok(error instanceof BadRequestError);
      assert.deepEqual(error.body, body);
      assert.equal(error.documentationUrl, 'https://packagist.com/docs/api');
      return true;
    });
  });

  test('a 3xx without Location is returned, not thrown, as PHP does for statuses below 400', async () => {
    const { client } = setup([new Response(null, { status: 304 })]);
    assert.equal(await client.teams.show(1), undefined);
  });

  test('wraps network failures in ConnectionError with the cause', async () => {
    const boom = new TypeError('fetch failed');
    const { client } = setup([() => Promise.reject(boom)], { retry: false });
    await assert.rejects(client.organization.sync(), (error: unknown) => {
      assert.ok(error instanceof ConnectionError);
      assert.equal(error.cause, boom);
      return true;
    });
  });

  test('reports a non-array page as UnexpectedResponseError', async () => {
    const { client } = setup([json({ not: 'a list' })]);
    await assert.rejects(client.packages.all(), UnexpectedResponseError);
  });
});

describe('retries', () => {
  test('retries a 429 after the Retry-After delay and re-signs the request', async () => {
    let nonce = 0;
    const { client, requests, sleeps } = setup([json({ message: 'slow down' }, 429, { 'Retry-After': '2' }), json([{ id: 1 }])], { nonce: () => `n${++nonce}` });
    assert.deepEqual(await client.teams.all(), [{ id: 1 }]);
    assert.equal(requests.length, 2);
    assert.deepEqual(sleeps, [2000]);
    assert.notEqual(requests[0]!.headers.get('Authorization'), requests[1]!.headers.get('Authorization'));
  });

  test('backs off exponentially without Retry-After', async () => {
    const { client, sleeps } = setup([json({}, 503), json({}, 503), json([])]);
    await client.teams.all();
    assert.deepEqual(sleeps, [500, 1000]);
  });

  test('gives up after maxRetries and throws the last error', async () => {
    const { client, requests } = setup([json({}, 503), json({}, 503), json({ message: 'down' }, 503)], { retry: { maxRetries: 2 } });
    await assert.rejects(client.teams.all(), { name: 'ServerError', message: 'down' });
    assert.equal(requests.length, 3);
  });

  test('does not retry a 500 on POST, which may have been applied', async () => {
    const { client, requests } = setup([json({ message: 'oops' }, 500)]);
    await assert.rejects(client.customers.create('Acme'), ServerError);
    assert.equal(requests.length, 1);
  });

  test('retries a 500 on GET', async () => {
    const { client, requests } = setup([json({}, 500), json({ id: 1 })]);
    assert.deepEqual(await client.teams.show(1), { id: 1 });
    assert.equal(requests.length, 2);
  });

  test('does not wait longer than maxDelayMs for Retry-After', async () => {
    const { client, requests } = setup([json({ message: 'later' }, 429, { 'Retry-After': '3600' })]);
    await assert.rejects(client.teams.all(), (error: unknown) => {
      assert.ok(error instanceof RateLimitError);
      assert.equal(error.retryAfterMs, 3_600_000);
      return true;
    });
    assert.equal(requests.length, 1);
  });

  test('retries network errors on GET only', async () => {
    const fail = (): Promise<Response> => Promise.reject(new TypeError('socket hang up'));
    const get = setup([fail, json([])]);
    await get.client.teams.all();
    assert.equal(get.requests.length, 2);
    const post = setup([fail, json([])]);
    await assert.rejects(post.client.organization.sync(), ConnectionError);
    assert.equal(post.requests.length, 1);
  });

  test('retry: false turns retries off', async () => {
    const { client, requests } = setup([json({}, 429), json([])], { retry: false });
    await assert.rejects(client.teams.all(), RateLimitError);
    assert.equal(requests.length, 1);
  });
});

describe('timeouts and cancellation', () => {
  test('throws TimeoutError when the server does not answer in time', async () => {
    const { client } = setup([hang], { timeoutMs: 20, retry: false });
    await assert.rejects(client.teams.all(), (error: unknown) => {
      assert.ok(error instanceof TimeoutError);
      assert.equal(error.timeoutMs, 20);
      return true;
    });
  });

  test('a per-call timeout overrides the client one', async () => {
    const { client } = setup([hang], { timeoutMs: 60_000, retry: false });
    await assert.rejects(client.teams.all({ timeoutMs: 10 }), TimeoutError);
  });

  test('throws AbortError with the reason when the caller aborts', async () => {
    const { client } = setup([hang]);
    const controller = new AbortController();
    const reason = new Error('user left');
    setTimeout(() => controller.abort(reason), 5);
    await assert.rejects(client.teams.all({ signal: controller.signal }), (error: unknown) => {
      assert.ok(error instanceof AbortError);
      assert.equal(error.cause, reason);
      return true;
    });
  });

  test('does not send anything when the signal is already aborted', async () => {
    const { client, requests } = setup();
    await assert.rejects(client.teams.all({ signal: AbortSignal.abort() }), AbortError);
    assert.equal(requests.length, 0);
  });

  test('passes an abort signal to fetch', async () => {
    const { client, requests } = setup();
    await client.teams.all();
    assert.ok(requests[0]!.signal instanceof AbortSignal);
  });
});

describe('redirects', () => {
  test('follows a same-origin redirect and signs the new URL', async () => {
    const { client, requests } = setup([new Response(null, { status: 301, headers: { Location: '/api/packages/acme%2Fnew/' } }), json({ name: 'acme/new' })]);
    assert.deepEqual(await client.packages.show('acme/old'), { name: 'acme/new' });
    assert.equal(requests[1]!.url, 'https://packagist.com/api/packages/acme%2Fnew/');
    assert.notEqual(requests[0]!.headers.get('Authorization'), requests[1]!.headers.get('Authorization'));
  });

  test('switches POST to GET on 303 and keeps the method on 307', async () => {
    const see = setup([new Response(null, { status: 303, headers: { Location: '/api/jobs/1' } }), json({})]);
    await see.client.organization.sync();
    assert.equal(see.requests[1]!.method, 'GET');
    assert.equal(see.requests[1]!.body, null);
    const temp = setup([new Response(null, { status: 307, headers: { Location: '/api/customers/' } }), json({})]);
    await temp.client.customers.create('Acme');
    assert.equal(temp.requests[1]!.method, 'POST');
    assert.ok(temp.requests[1]!.body);
  });

  test('refuses a redirect to another host', async () => {
    const { client, requests } = setup([new Response(null, { status: 302, headers: { Location: 'https://evil.example/api/teams/' } })]);
    await assert.rejects(client.teams.all(), OriginMismatchError);
    assert.equal(requests.length, 1);
  });

  test('stops a redirect loop', async () => {
    const loop = (): Response => new Response(null, { status: 302, headers: { Location: '/api/teams/' } });
    const { client } = setup(Array.from({ length: 12 }, () => loop));
    await assert.rejects(client.teams.all(), /redirects/);
  });
});

describe('pagination', () => {
  const link = (url: string): Record<string, string> => ({ Link: `<${url}>; rel="next"` });

  test('refuses a next link on another host, like the PHP client', async () => {
    const { client, requests } = setup([json([{ id: 1 }], 200, link('https://evil.example/api/packages/?page=2'))]);
    await assert.rejects(client.packages.all(), {
      name: 'OriginMismatchError',
      message: 'Refusing to follow the pagination link "https://evil.example/api/packages/?page=2": it points outside the configured Private Packagist URL "https://packagist.com".',
    });
    assert.equal(requests.length, 1);
  });

  test('refuses a different scheme or port and protocol-relative links', async () => {
    for (const next of ['http://packagist.com/api/packages/?page=2', 'https://packagist.com:444/api/packages/?page=2', '//evil.example/api/packages/']) {
      const { client } = setup([json([], 200, link(next))]);
      await assert.rejects(client.packages.all(), OriginMismatchError, next);
    }
  });

  test('accepts the explicit default port and a differently cased host', async () => {
    const { client, requests } = setup([json([{ id: 1 }], 200, link('https://PACKAGIST.com:443/api/packages/?page=2')), json([{ id: 2 }])]);
    assert.deepEqual(await client.packages.all(), [{ id: 1 }, { id: 2 }]);
    assert.equal(requests[1]!.url, 'https://packagist.com/api/packages/?page=2');
  });

  test('stops when a next link points back to a page already read', async () => {
    const { client } = setup([json([{ id: 1 }], 200, link('https://packagist.com/api/packages/?limit=500'))]);
    await assert.rejects(client.packages.all(), UnexpectedResponseError);
  });

  test('a custom limit replaces the default 500', async () => {
    const { client, requests } = setup();
    await client.packages.all({ limit: 25, origin: 'private' });
    assert.equal(requests[0]!.url, 'https://packagist.com/api/packages/?limit=25&origin=private');
  });

  test('iterate fetches pages lazily', async () => {
    const { client, requests } = setup([json([{ id: 1 }, { id: 2 }], 200, link('/api/packages/?page=2')), json([{ id: 3 }])]);
    const seen: number[] = [];
    for await (const item of client.packages.iterate()) {
      seen.push(Number(item.id));
      if (item.id === 2) break;
    }
    assert.deepEqual(seen, [1, 2]);
    assert.equal(requests.length, 1);
  });

  test('paginate walks every page', async () => {
    const { client } = setup([json([{ id: 1 }], 200, link('/api/teams/?page=2')), json([{ id: 2 }])]);
    const ids: unknown[] = [];
    for await (const team of client.paginate<{ id: number }>('/teams/')) ids.push(team.id);
    assert.deepEqual(ids, [1, 2]);
  });

  test('getCollection returns the content of a page that is not 200, as PHP does', async () => {
    const { client } = setup([json([{ id: 9 }], 203)]);
    assert.deepEqual(await client.teams.all(), [{ id: 9 }]);
  });

  test('parseLinkHeader picks the requested relation', () => {
    const header = '<https://packagist.com/api/x?page=1>; rel="first", <https://packagist.com/api/x?page=3>; rel="next"';
    assert.equal(parseLinkHeader(header, 'next'), 'https://packagist.com/api/x?page=3');
    assert.equal(parseLinkHeader(header, 'first'), 'https://packagist.com/api/x?page=1');
    assert.equal(parseLinkHeader(header, 'prev'), null);
    assert.equal(parseLinkHeader(null, 'next'), null);
  });
});

describe('responses', () => {
  test('returns text when the response is not JSON', async () => {
    const { client } = setup([text('plain words')]);
    assert.equal(await client.get('/helloworld'), 'plain words');
  });

  test('returns the text of a JSON response that does not parse', async () => {
    const { client } = setup([new Response('{broken', { headers: { 'Content-Type': 'application/json; charset=utf-8' } })]);
    assert.equal(await client.get('/helloworld'), '{broken');
  });

  test('deletes resolve to undefined', async () => {
    const { client } = setup([json(null, 204)]);
    assert.equal(await client.teams.remove(1), undefined);
  });

  test('organization.sshAccessKey and accessReport cover the endpoints the PHP client lacks', async () => {
    const { client, requests } = setup([json({ key: 'ssh-ed25519 AAAA' }), new Response('user,package\nalice,acme/a\n', { headers: { 'Content-Type': 'text/csv' } })]);
    assert.deepEqual(await client.organization.sshAccessKey(), { key: 'ssh-ed25519 AAAA' });
    assert.equal(await client.organization.accessReport(), 'user,package\nalice,acme/a\n');
    assert.equal(requests[0]!.url, 'https://packagist.com/api/organization/ssh-access-key');
    assert.equal(requests[1]!.headers.get('Accept'), 'text/csv');
  });

  test('request gives status, headers and URL', async () => {
    const { client } = setup([json({ ok: true }, 201, { 'X-Thing': 'y' })]);
    const response = await client.request({ method: 'POST', path: '/teams/', body: '{"name":"x"}', headers: { 'Content-Type': 'application/json' } });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-thing'), 'y');
    assert.equal(response.url, 'https://packagist.com/api/teams/');
    assert.deepEqual(response.data, { ok: true });
  });

  test('artifacts accept a Blob', async () => {
    const { client, requests } = setup([json({ id: 41 })]);
    await client.packages.artifacts.create(new Blob([new Uint8Array([1, 2, 3])]), 'application/zip', 'a.zip');
    assert.deepEqual(requests[0]!.body, new Uint8Array([1, 2, 3]));
    assert.equal(requests[0]!.headers.get('X-FILENAME'), 'a.zip');
  });
});

describe('argument checks from the PHP client', () => {
  test('packages.all refuses an unknown origin', async () => {
    const { client } = setup();
    assert.throws(() => client.packages.all({ origin: 'somewhere' as 'private' }), {
      name: 'InvalidArgumentError',
      message: 'Filter "origin" has to be one of: "public-mirror", "private-mirror", "private", "public-proxy", "private-proxy".',
    });
    assert.throws(() => client.suborganizations.packages.all('sub', { origin: 'x' as 'private' }), InvalidArgumentError);
  });

  test('regenerating a token needs the confirmation flag', () => {
    const { client } = setup();
    const message = 'Confirmation is required to regenerate the Composer repository token.';
    assert.throws(() => client.tokens.regenerate(1, {} as never), { message });
    assert.throws(() => client.customers.regenerateToken(1, {} as never), { message });
    assert.throws(() => client.suborganizations.regenerateToken('sub', 1, {} as never), { message });
  });

  test('tokens.create refuses teamId together with accessToAllPackages', () => {
    const { client } = setup();
    assert.throws(() => client.tokens.create({ description: 'x', access: 'read', teamId: 1, accessToAllPackages: true }), {
      message: 'Only set either "accessToAllPackages" or "teamId"',
    });
  });

  test('package grants need a name and team grants an id and permission', () => {
    const { client } = setup();
    assert.throws(() => client.customers.addOrEditPackages(1, [{} as never]), { message: 'Parameter "name" is required.' });
    assert.throws(() => client.vendorBundles.packages.addOrEditPackages(1, [{} as never]), { message: 'Parameter "name" is required.' });
    assert.throws(() => client.suborganizations.addOrEditTeams('sub', [{ permission: 'view' } as never]), { message: 'Parameter "id" is required.' });
    assert.throws(() => client.suborganizations.addOrEditTeams('sub', [{ id: 1 } as never]), { message: 'Parameter "permission" is required.' });
    assert.throws(() => client.suborganizations.mirroredRepositories.add('sub', [{ id: 1 } as never]), /"id" and the "mirroringBehavior" are required/);
  });

  test('path arguments are encoded so a name cannot change the endpoint', async () => {
    const { client, requests } = setup();
    await client.packages.show('../../teams');
    assert.equal(requests[0]!.url, 'https://packagist.com/api/packages/..%2F..%2Fteams/');
    assert.throws(() => client.packages.show('..'), InvalidArgumentError);
  });

  test('teams accept TeamPermissions, flags or a plain object', async () => {
    const { client, requests } = setup();
    await client.teams.create('A', TeamPermissions.fromFlags(TeamPermissions.PERMISSION_CAN_ADD_PACKAGES));
    await client.teams.create('B', TeamPermissions.PERMISSION_CAN_ADD_PACKAGES);
    await client.teams.create('C', { canAddPackages: true });
    const bodies = requests.map((r) => JSON.parse(new TextDecoder().decode(r.body!)).permissions);
    assert.deepEqual(bodies[0], bodies[1]);
    assert.deepEqual(bodies[1], bodies[2]);
  });
});
