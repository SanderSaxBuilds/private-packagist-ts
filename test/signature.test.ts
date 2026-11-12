import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { authorizationHeader, canonicalQuery, InvalidArgumentError, RequestSigner, signRequest, stringToSign } from '../src/index.ts';
import { bytesOf, fixture } from './helpers.ts';

interface SignatureVector {
  key: string;
  secret: string;
  timestamp: number;
  nonce: string;
  method: string;
  url: string;
  host: string;
  path: string;
  query: string;
  canonicalQuery: string;
  body: string;
  bodyEncoding?: string;
  authorization: string;
}

const signatures = fixture<{ vectors: SignatureVector[] }>('php-signatures.json').vectors;
const queries = fixture<{ vectors: Array<{ query: string; canonical: string }> }>('php-queries.json').vectors;

describe('signatures match the PHP RequestSignature plugin', () => {
  signatures.forEach((vector, index) => {
    test(`#${index + 1} ${vector.method} ${vector.url}${vector.body ? ' with body' : ''}`, async () => {
      const body = bytesOf(vector.body, vector.bodyEncoding);
      const signed = await signRequest({
        method: vector.method,
        url: vector.url,
        body,
        key: vector.key,
        secret: vector.secret,
        timestamp: vector.timestamp,
        nonce: vector.nonce,
      });
      assert.equal(signed.authorization, vector.authorization);
      assert.equal(canonicalQuery(vector.query), vector.canonicalQuery);
    });
  });
});

describe('query normalization matches PHP parse_str and http_build_query', () => {
  queries.forEach((vector, index) => {
    test(`#${index + 1} ${JSON.stringify(vector.query)}`, () => {
      assert.equal(canonicalQuery(vector.query), vector.canonical);
    });
  });
});

describe('the signatures from the PHP client test suite', () => {
  test('GET with a query string', async () => {
    const signed = await signRequest({
      method: 'GET',
      url: 'https://localhost/api/packages/?limit=1&page=2',
      key: 'token',
      secret: 'secret',
      timestamp: 1518721253,
      nonce: '78b9869e96cf58b5902154e0228f8576f042e5ac',
    });
    assert.match(signed.authorization, /Signature=RLb\/mPCONIcfPp3\+Ink\+jtxNU6VKyeasf7Zdd7kNO\+A=$/);
  });

  test('POST with a body and no host', async () => {
    const signed = await signRequest({
      method: 'POST',
      url: '/packages/?foo=bar',
      body: '{"foo":"bar"}',
      key: 'token',
      secret: 'secret',
      timestamp: 1518721253,
      nonce: '78b9869e96cf58b5902154e0228f8576f042e5ac',
    });
    assert.equal(signed.signature, 'rzwvwGS17Qcmk8UqTefJCHCV188x1/e1iBWG2pB4z1M=');
  });
});

describe('stringToSign', () => {
  const base = { method: 'GET', host: 'packagist.com', path: '/api/packages/', query: '', key: 'k', timestamp: 1, nonce: 'n' };

  test('lists method, host, path, then the sorted parameters', () => {
    assert.equal(stringToSign(base), 'GET\npackagist.com\n/api/packages/\ncnonce=n&key=k&query=&timestamp=1&version=2');
  });

  test('puts the body first and rawurlencodes it', () => {
    assert.equal(
      stringToSign({ ...base, method: 'POST', body: '{"a":"b c"}' }),
      'POST\npackagist.com\n/api/packages/\nbody=%7B%22a%22%3A%22b%20c%22%7D&cnonce=n&key=k&query=&timestamp=1&version=2',
    );
  });

  test('leaves out an empty body and the body "0", as PHP truthiness does', () => {
    const without = stringToSign(base);
    assert.equal(stringToSign({ ...base, body: '' }), without);
    assert.equal(stringToSign({ ...base, body: '0' }), without);
    assert.notEqual(stringToSign({ ...base, body: '00' }), without);
  });

  test('encodes the canonical query once more inside the parameter list', () => {
    assert.match(stringToSign({ ...base, query: 'b=2&a=1' }), /&query=a%3D1%26b%3D2&/);
  });

  test('drops the fractional part of the timestamp', () => {
    assert.match(stringToSign({ ...base, timestamp: 1763020800.9 }), /timestamp=1763020800&/);
    assert.match(authorizationHeader('k', 1763020800.9, 'n', 's'), /Timestamp=1763020800,/);
  });

  test('signs binary bodies byte for byte', () => {
    const value = stringToSign({ ...base, method: 'POST', body: new Uint8Array([0x00, 0xff, 0x41]) });
    assert.match(value, /body=%00%FFA&/);
  });
});

describe('RequestSigner', () => {
  test('refuses an empty key or secret', () => {
    assert.throws(() => new RequestSigner('', 'secret'), InvalidArgumentError);
    assert.throws(() => new RequestSigner('key', ''), InvalidArgumentError);
  });

  test('uses the clock and nonce it is given', async () => {
    const signer = new RequestSigner('key', 'secret', { now: () => 1700000000, nonce: () => 'abc' });
    const signed = await signer.sign({ method: 'GET', url: 'https://packagist.com/api/teams/' });
    assert.equal(signed.timestamp, 1700000000);
    assert.equal(signed.nonce, 'abc');
    assert.match(signed.authorization, /^PACKAGIST-HMAC-SHA256 Key=key, Timestamp=1700000000, Cnonce=abc, Version=2, Signature=[A-Za-z0-9+/]{43}=$/);
  });

  test('makes a fresh 40 character hex nonce for every request by default', async () => {
    const signer = new RequestSigner('key', 'secret');
    const a = await signer.sign({ method: 'GET', url: 'https://packagist.com/api/teams/' });
    const b = await signer.sign({ method: 'GET', url: 'https://packagist.com/api/teams/' });
    assert.match(a.nonce, /^[0-9a-f]{40}$/);
    assert.notEqual(a.nonce, b.nonce);
    assert.ok(Math.abs(a.timestamp - Date.now() / 1000) < 5);
  });

  test('signs the host without the port, in lowercase', async () => {
    const signer = new RequestSigner('key', 'secret', { now: () => 1, nonce: () => 'n' });
    const signed = await signer.sign({ method: 'GET', url: 'https://Packagist.Example.com:8443/api/teams/' });
    assert.match(signed.stringToSign, /^GET\npackagist\.example\.com\n\/api\/teams\/\n/);
  });
});
