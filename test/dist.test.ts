// The built packages: ESM through import, CommonJS through require, both signing a PHP vector.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import { fixture } from './helpers.ts';

const require = createRequire(import.meta.url);
const [vector] = fixture<{ vectors: Array<{ key: string; secret: string; timestamp: number; nonce: string; method: string; url: string; authorization: string }> }>(
  'php-signatures.json',
).vectors;

type Dist = typeof import('../src/index.ts');

async function check(dist: Dist): Promise<void> {
  assert.equal(typeof dist.PrivatePackagistClient, 'function');
  const signed = await dist.signRequest({ ...vector!, url: vector!.url });
  assert.equal(signed.authorization, vector!.authorization);
  const client = new dist.PrivatePackagistClient({ fetch: async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } }) });
  assert.deepEqual(await client.teams.all(), []);
}

// The package imports itself by name, so this goes through the "exports" map like a real install.
const name: string = 'private-packagist-api';

describe('built package', () => {
  test('ESM build works through the package exports', async () => {
    assert.match(import.meta.resolve(name), /\/dist\/esm\/index\.js$/);
    await check((await import(name)) as Dist);
  });

  test('CommonJS build works through require', async () => {
    assert.match(require.resolve(name).replace(/\\/g, '/'), /\/dist\/cjs\/index\.js$/);
    await check(require(name) as Dist);
  });
});
