// Byte-exact ports of the PHP functions the Private Packagist request signature depends on:
// rawurlencode, urlencode, urldecode, parse_str, http_build_query and json_encode.
//
// Strings that come out of urldecode are kept as "byte strings": every char code is one byte
// (0-255). That keeps invalid UTF-8 such as "%FF" intact and makes strcmp a plain code unit
// comparison, the same as PHP.

const encoder = new TextEncoder();

/** A PHP array: ordered, with integer or string keys. */
export type PhpArray = Map<number | string, PhpValue>;
/** Values parse_str produces: strings (as byte strings) or nested arrays. */
export type PhpValue = string | PhpArray;

/** Encodes a JavaScript string as UTF-8 and returns it as a byte string. */
export function toByteString(value: string): string {
  let out = '';
  for (const byte of encoder.encode(value)) out += String.fromCharCode(byte);
  return out;
}

/** Turns a byte string back into bytes. */
export function byteStringToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

function isAsciiOnly(value: string): boolean {
  for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) > 0x7f) return false;
  return true;
}

const HEX = '0123456789ABCDEF';

function percentByte(byte: number): string {
  return `%${HEX[byte >> 4]}${HEX[byte & 15]}`;
}

function encodeBytes(bytes: Iterable<number>, rfc1738: boolean): string {
  let out = '';
  for (const byte of bytes) {
    if (
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      (byte >= 0x30 && byte <= 0x39) ||
      byte === 0x2d ||
      byte === 0x2e ||
      byte === 0x5f
    ) {
      out += String.fromCharCode(byte);
    } else if (byte === 0x7e && !rfc1738) {
      out += '~';
    } else if (byte === 0x20 && rfc1738) {
      out += '+';
    } else {
      out += percentByte(byte);
    }
  }
  return out;
}

function bytesOf(value: string | Uint8Array, byteString: boolean): Uint8Array {
  if (typeof value !== 'string') return value;
  return byteString ? byteStringToBytes(value) : encoder.encode(value);
}

/**
 * PHP rawurlencode (RFC 3986): everything except A-Z a-z 0-9 - _ . ~ is percent-encoded.
 * Strings are taken as UTF-8 text unless `byteString` is set.
 */
export function rawurlencode(value: string | Uint8Array, byteString = false): string {
  if (typeof value === 'string' && !byteString && isAsciiOnly(value)) {
    return encodeBytes(byteStringToBytes(value), false);
  }
  return encodeBytes(bytesOf(value, byteString), false);
}

/** PHP urlencode (RFC 1738 / form encoding): like rawurlencode, but space becomes "+" and "~" is encoded. */
export function urlencode(value: string | Uint8Array, byteString = false): string {
  return encodeBytes(bytesOf(value, byteString), true);
}

function hexValue(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x41 && code <= 0x46) return code - 0x37;
  if (code >= 0x61 && code <= 0x66) return code - 0x57;
  return -1;
}

/** PHP urldecode: "+" becomes a space, valid %XX sequences become bytes, anything else is kept. Returns a byte string. */
export function urldecode(value: string): string {
  const input = toByteString(value);
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code === 0x2b) {
      out += ' ';
    } else if (code === 0x25 && i + 2 < input.length) {
      const high = hexValue(input.charCodeAt(i + 1));
      const low = hexValue(input.charCodeAt(i + 2));
      if (high >= 0 && low >= 0) {
        out += String.fromCharCode(high * 16 + low);
        i += 2;
      } else {
        out += '%';
      }
    } else {
      out += input[i];
    }
  }
  return out;
}

const INTEGER_KEY = /^(?:0|-?[1-9][0-9]*)$/;

/** PHP turns integer-looking string keys ("5", "-3", but not "05" or "-0") into integer keys. */
export function normalizeArrayKey(key: string): number | string {
  if (!INTEGER_KEY.test(key)) return key;
  const number = Number(key);
  if (!Number.isSafeInteger(number)) return key;
  return number;
}

interface ArrayState {
  next: number | null;
}

const arrayState = new WeakMap<PhpArray, ArrayState>();

function newArray(): PhpArray {
  const array: PhpArray = new Map();
  arrayState.set(array, { next: null });
  return array;
}

function trackKey(array: PhpArray, key: number | string): void {
  if (typeof key !== 'number') return;
  const state = arrayState.get(array) ?? { next: null };
  if (state.next === null || key >= state.next) state.next = key + 1;
  arrayState.set(array, state);
}

function setKey(array: PhpArray, key: number | string, value: PhpValue): void {
  array.set(key, value);
  trackKey(array, key);
}

function append(array: PhpArray, value: PhpValue): void {
  const state = arrayState.get(array) ?? { next: null };
  const key = state.next ?? 0;
  setKey(array, key, value);
}

function registerVariable(target: PhpArray, rawName: string, value: string): void {
  // The variable name is handled as a C string, so it ends at the first NUL byte.
  let name = rawName;
  const nul = name.indexOf('\0');
  if (nul >= 0) name = name.slice(0, nul);

  // Leading spaces are dropped.
  let start = 0;
  while (name[start] === ' ') start++;
  name = name.slice(start);

  // Spaces and dots before the first "[" become underscores.
  let base = '';
  let bracket = -1;
  for (let i = 0; i < name.length; i++) {
    const char = name[i];
    if (char === '[') {
      bracket = i;
      break;
    }
    base += char === ' ' || char === '.' ? '_' : char;
  }
  if (base.length === 0) return;

  if (bracket < 0) {
    setKey(target, normalizeArrayKey(base), value);
    return;
  }

  let symtable = target;
  let index: string | null = base;
  let position = bracket;
  for (;;) {
    position++;
    let segment: string | null;
    const close = name.indexOf(']', position);
    if (name[position] === ']') {
      segment = null;
    } else if (close < 0) {
      if (index === base && symtable === target) {
        // Not an index: the "[" and any later " ", "." or "[" become underscores.
        let rest = '';
        for (const char of name.slice(position)) rest += char === ' ' || char === '.' || char === '[' ? '_' : char;
        index = `${base}_${rest}`;
      }
      break;
    } else {
      segment = name.slice(position, close);
    }

    let child: PhpValue | undefined;
    if (index === null) {
      child = newArray();
      append(symtable, child);
    } else {
      const key = normalizeArrayKey(index);
      child = symtable.get(key);
      if (!(child instanceof Map)) {
        child = newArray();
        setKey(symtable, key, child);
      }
    }
    symtable = child;
    index = segment;

    position = segment === null ? position + 1 : close + 1;
    if (name[position] !== '[') break;
  }

  if (index === null) {
    append(symtable, value);
  } else {
    setKey(symtable, normalizeArrayKey(index), value);
  }
}

/**
 * PHP parse_str: splits on "&", url-decodes names and values, folds "a[b][]" names into nested
 * arrays and repeats PHP's renaming of spaces, dots and unmatched brackets.
 */
export function parseStr(query: string): PhpArray {
  const result = newArray();
  for (const part of query.split('&')) {
    if (part === '') continue;
    const eq = part.indexOf('=');
    const name = eq < 0 ? part : part.slice(0, eq);
    const value = eq < 0 ? '' : part.slice(eq + 1);
    registerVariable(result, urldecode(name), urldecode(value));
  }
  return result;
}

/** PHP uksort($array, 'strcmp') on the top-level keys. */
export function sortKeysStrcmp(array: PhpArray): PhpArray {
  const entries = [...array.entries()].sort(([a], [b]) => {
    const left = String(a);
    const right = String(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const sorted = newArray();
  for (const [key, value] of entries) setKey(sorted, key, value);
  return sorted;
}

/** Anything http_build_query accepts: scalars, arrays, plain objects and PHP-style maps. */
export type QueryValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Date
  | readonly QueryValue[]
  | { readonly [key: string]: QueryValue }
  | ReadonlyMap<string | number, QueryValue>;

export type QueryEncoding = 'RFC1738' | 'RFC3986';

function scalarToString(value: number | bigint | boolean): string {
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

function entriesOf(value: QueryValue): Array<[string | number, QueryValue]> | null {
  if (value instanceof Map) return [...value.entries()];
  if (Array.isArray(value)) return value.map((item, index) => [index, item]);
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value as Record<string, QueryValue>);
  }
  return null;
}

/**
 * PHP http_build_query($data, '', '&', $encoding). Byte strings (from parseStr) are encoded byte
 * for byte when `byteStrings` is set, plain JavaScript strings are encoded as UTF-8.
 */
export function httpBuildQuery(data: QueryValue, encoding: QueryEncoding = 'RFC1738', byteStrings = false): string {
  const encode = (value: string): string =>
    encoding === 'RFC3986' ? rawurlencode(value, byteStrings) : urlencode(value, byteStrings);
  const parts: string[] = [];
  const walk = (value: QueryValue, prefix: string | null): void => {
    const entries = entriesOf(value);
    if (entries === null) return;
    for (const [key, item] of entries) {
      if (item === null || item === undefined) continue;
      const encodedKey = typeof key === 'number' ? String(key) : encode(key);
      const name = prefix === null ? encodedKey : `${prefix}%5B${encodedKey}%5D`;
      if (item instanceof Date) {
        parts.push(`${name}=${encode(item.toISOString())}`);
      } else if (typeof item === 'object') {
        walk(item, name);
      } else if (typeof item === 'string') {
        parts.push(`${name}=${encode(item)}`);
      } else {
        parts.push(`${name}=${encode(scalarToString(item))}`);
      }
    }
  };
  walk(data, null);
  return parts.join('&');
}

/**
 * PHP json_encode with default flags: "/" is escaped as "\/" and every non-ASCII character as a
 * lowercase \uXXXX escape (UTF-16 code units, so emoji become surrogate pairs).
 */
export function phpJsonEncode(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) return 'null';
  let out = '';
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    if (code === 0x2f) {
      out += '\\/';
    } else if (code > 0x7f) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
    } else {
      out += json[i];
    }
  }
  return out;
}
