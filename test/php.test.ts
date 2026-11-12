import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildPath, httpBuildQuery, InvalidArgumentError, parseStr, phpJsonEncode, rawurlencode, urlencode, type QueryValue } from '../src/index.ts';
import { fixture } from './helpers.ts';

interface Primitives {
  httpBuildQuery: Array<{ input: QueryValue; rfc1738: string; rfc3986: string }>;
  jsonEncode: Array<{ input: unknown; output: string }>;
  rawurlencode: Array<{ input: string; output: string }>;
  requestPath: Array<{ template: string; args: Array<string | number>; output?: string; error?: string }>;
}

const primitives = fixture<Primitives>('php-primitives.json');

describe('http_build_query', () => {
  primitives.httpBuildQuery.forEach((vector, index) => {
    test(`#${index + 1} ${JSON.stringify(vector.input).slice(0, 60)}`, () => {
      assert.equal(httpBuildQuery(vector.input, 'RFC1738'), vector.rfc1738);
      assert.equal(httpBuildQuery(vector.input, 'RFC3986'), vector.rfc3986);
    });
  });

  test('skips null and undefined values and writes booleans as 1 and 0', () => {
    assert.equal(httpBuildQuery({ a: null, b: undefined, c: true, d: false }), 'c=1&d=0');
  });
});

test('json_encode output for every vector', () => {
  for (const vector of primitives.jsonEncode) assert.equal(phpJsonEncode(vector.input), vector.output);
});

test('rawurlencode output for every vector', () => {
  for (const vector of primitives.rawurlencode) assert.equal(rawurlencode(vector.input), vector.output);
});

test('urlencode turns spaces into plus and encodes the tilde', () => {
  assert.equal(urlencode('a b~c'), 'a+b%7Ec');
});

describe('RequestPath::build', () => {
  primitives.requestPath.forEach((vector, index) => {
    test(`#${index + 1} ${vector.template} ${JSON.stringify(vector.args)}`, () => {
      if (vector.error !== undefined) {
        assert.throws(() => buildPath(vector.template, ...vector.args), { name: 'InvalidArgumentError', message: vector.error });
      } else {
        assert.equal(buildPath(vector.template, ...vector.args), vector.output);
      }
    });
  });

  test('refuses anything but strings and integers', () => {
    assert.throws(() => buildPath('/packages/%s/', 1.5), { message: 'Path arguments must be a string or an integer, double given.' });
    assert.throws(() => buildPath('/packages/%s/', null as unknown as string), InvalidArgumentError);
    assert.throws(() => buildPath('/packages/%s/', true as unknown as string), { message: /boolean given/ });
  });

  test('refuses a template with more placeholders than arguments', () => {
    assert.throws(() => buildPath('/customers/%s/packages/%s/', 1), InvalidArgumentError);
  });
});

describe('parse_str', () => {
  test('builds nested arrays in insertion order', () => {
    const parsed = parseStr('a[b]=1&a[c][]=2&a[c][]=3');
    const a = parsed.get('a') as Map<string, unknown>;
    assert.deepEqual([...a.keys()], ['b', 'c']);
    assert.deepEqual([...(a.get('c') as Map<number, string>).entries()], [[0, '2'], [1, '3']]);
  });

  test('turns integer-like keys into integers', () => {
    const parsed = parseStr('5=a&05=b&-3=c');
    assert.deepEqual([...parsed.keys()], [5, '05', -3]);
  });
});
