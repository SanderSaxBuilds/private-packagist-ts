// Replays every request the PHP client made in scripts/php-vectors.php through this client and
// compares method, URL, headers, body bytes and the Authorization header.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PrivatePackagistClient } from '../src/index.ts';
import { bytesOf, fixture, json, mockFetch, noSleep, ZIP, type Reply } from './helpers.ts';

interface RecordedVector {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  bodyEncoding?: string;
  authorization: string;
}

interface ApiVector {
  name: string;
  args: unknown[];
  baseUrl: string;
  result: unknown;
  requests: RecordedVector[];
}

const data = fixture<{ meta: { key: string; secret: string; timestamp: number; nonce: string }; vectors: ApiVector[] }>('php-requests.json');
const { key, secret, timestamp, nonce } = data.meta;

function page(items: unknown[], next?: string): Response {
  return json(items, 200, next ? { Link: `<${next}>; rel="next", <https://packagist.com/api/x?page=1>; rel="first"` } : {});
}

/** The responses the PHP generator queued for the vectors that need more than an empty JSON array. */
const replies: Record<string, () => Reply[]> = {
  'pagination.absoluteNext': () => [
    page([{ id: 1, name: 'acme/a' }], 'https://packagist.com/api/packages/?page=2&limit=500'),
    page([{ id: 2, name: 'acme/b' }], 'https://packagist.com/api/packages/?page=3&limit=500'),
    page([{ id: 3, name: 'acme/c' }]),
  ],
  'pagination.relativeNext': () => [page([{ id: 1 }], '/api/customers/?page=2&limit=500'), page([{ id: 2 }])],
  'pagination.filtersKeptOnNext': () => [
    page([{ id: 10 }], 'https://packagist.com/api/security-issues/?security-issue-state=open&page=2&limit=500'),
    page([{ id: 11 }]),
  ],
  'pagination.selfHosted': () => [page([{ id: 1 }], 'https://packagist.example.com:8443/api/teams/?page=2&limit=500'), page([{ id: 2 }])],
  'jobs.waitForJob': () => [
    json({ id: '46bf13150a86fece079ca979cb8ef57c78773faa', status: 'queued' }),
    json({ id: '46bf13150a86fece079ca979cb8ef57c78773faa', status: 'running' }),
    json({ id: '46bf13150a86fece079ca979cb8ef57c78773faa', status: 'success', message: 'done' }),
  ],
};

type Method = (...args: unknown[]) => Promise<unknown>;

function resolve(client: PrivatePackagistClient, name: string): Method {
  const aliases: Record<string, string> = {
    'pagination.absoluteNext': 'packages.all',
    'pagination.relativeNext': 'customers.all',
    'pagination.filtersKeptOnNext': 'securityIssues.all',
    'pagination.selfHosted': 'teams.all',
    'selfHosted.show': 'packages.show',
  };
  const path = (aliases[name] ?? name).split('.');
  let target: Record<string, unknown> = client as unknown as Record<string, unknown>;
  for (const part of path.slice(0, -1)) target = target[part] as Record<string, unknown>;
  const method = target[path[path.length - 1]!];
  assert.equal(typeof method, 'function', `${name} is not a method`);
  return (method as Method).bind(target);
}

function argsFor(vector: ApiVector): unknown[] {
  if (vector.name === 'jobs.waitForJob') return [vector.args[0], { maxWaitSeconds: 30, waitInterval: 0 }];
  // The generator records the artifact body as the placeholder "zip".
  if (vector.name.includes('.artifacts.create') || vector.name.includes('.artifacts.add')) {
    return vector.args.map((arg) => (arg === 'zip' ? ZIP : arg));
  }
  return vector.args;
}

const counts = new Map<string, number>();

describe('requests match the PHP client', () => {
  for (const vector of data.vectors) {
    const n = (counts.get(vector.name) ?? 0) + 1;
    counts.set(vector.name, n);
    const label = n === 1 ? vector.name : `${vector.name} #${n}`;

    test(label, async () => {
      const mock = mockFetch(replies[vector.name]?.() ?? []);
      const client = new PrivatePackagistClient({
        baseUrl: vector.baseUrl,
        key,
        secret,
        fetch: mock.fetch,
        now: () => timestamp,
        nonce: () => nonce,
        sleep: noSleep,
      });
      const result = await resolve(client, vector.name)(...argsFor(vector));

      assert.equal(mock.requests.length, vector.requests.length, 'number of requests');
      vector.requests.forEach((expected, i) => {
        const actual = mock.requests[i]!;
        assert.equal(actual.method, expected.method, `method of request ${i}`);
        assert.equal(actual.url, expected.url, `URL of request ${i}`);
        for (const header of ['Accept', 'Content-Type', 'X-FILENAME']) {
          assert.equal(actual.headers.get(header), expected.headers[header] ?? null, `${header} of request ${i}`);
        }
        assert.deepEqual(actual.body ?? new Uint8Array(0), bytesOf(expected.body, expected.bodyEncoding), `body of request ${i}`);
        assert.equal(actual.headers.get('Authorization'), expected.authorization, `Authorization of request ${i}`);
      });

      if (result !== undefined) assert.deepEqual(result, vector.result);
    });
  }
});
