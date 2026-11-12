import { InvalidArgumentError } from './errors.ts';
import { rawurlencode } from './php.ts';

/** A value that can stand in for one `%s` of a request path: a name, URL name or numeric id. */
export type PathArgument = string | number;

function encodeArgument(argument: unknown): string {
  if (typeof argument !== 'string' && !(typeof argument === 'number' && Number.isInteger(argument))) {
    const type = argument === null ? 'NULL' : typeof argument === 'number' ? 'double' : Array.isArray(argument) ? 'array' : typeof argument;
    throw new InvalidArgumentError(`Path arguments must be a string or an integer, ${type} given.`);
  }
  const value = String(argument);
  if (value === '' || value === '.' || value === '..') {
    throw new InvalidArgumentError("Path arguments must not be empty, '.', or '..'.");
  }
  return rawurlencode(value);
}

/**
 * Fills each `%s` in `template` with a rawurlencoded argument, like the PHP client's
 * RequestPath::build. "acme/package" becomes "acme%2Fpackage", so a package name can never
 * change which endpoint is called.
 */
export function buildPath(template: string, ...args: PathArgument[]): string {
  let index = 0;
  const path = template.replace(/%s/g, () => {
    if (index >= args.length) throw new InvalidArgumentError(`Path template "${template}" needs more arguments than were given.`);
    return encodeArgument(args[index++]);
  });
  return path;
}
