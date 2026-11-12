import type { PrivatePackagistClient } from '../client.ts';
import { InvalidArgumentError } from '../errors.ts';
import type { QueryValue } from '../php.ts';
import type { PackageOriginType } from '../schema.ts';

export abstract class Resource {
  protected readonly client: PrivatePackagistClient;

  constructor(client: PrivatePackagistClient) {
    this.client = client;
  }
}

/** Accepts a known value of a string union and still allows values the API adds later. */
export type Open<T extends string> = T | (string & {});

export const ORIGIN_PUBLIC_MIRROR = 'public-mirror';
export const ORIGIN_PRIVATE_MIRROR = 'private-mirror';
export const ORIGIN_PRIVATE = 'private';
/** Values the origin filter accepts, including the old "proxy" names. */
export const AVAILABLE_ORIGINS: readonly PackageOriginType[] = ['public-mirror', 'private-mirror', 'private', 'public-proxy', 'private-proxy'];

export interface PackageFilters {
  origin?: PackageOriginType;
  'security-issue-state'?: Open<import('../schema.ts').SecurityIssueState>;
  /** Page size. The client asks for 500 per page unless set. */
  limit?: number;
  [filter: string]: QueryValue;
}

export function assertOriginFilter(filters: { origin?: unknown }): void {
  if (filters.origin !== undefined && filters.origin !== null && !(AVAILABLE_ORIGINS as readonly unknown[]).includes(filters.origin)) {
    throw new InvalidArgumentError(`Filter "origin" has to be one of: "${AVAILABLE_ORIGINS.join('", "')}".`);
  }
}

export interface RegenerateConfirmation {
  IConfirmOldTokenWillStopWorkingImmediately: boolean;
  [key: string]: unknown;
}

export function assertConfirmation(confirmation: { IConfirmOldTokenWillStopWorkingImmediately?: unknown } | null | undefined): void {
  if (confirmation?.IConfirmOldTokenWillStopWorkingImmediately === undefined || confirmation.IConfirmOldTokenWillStopWorkingImmediately === null) {
    throw new InvalidArgumentError('Confirmation is required to regenerate the Composer repository token.');
  }
}

/** PHP isset() on each listed key of every item. */
export function assertEachHas(items: readonly unknown[], keys: readonly string[], message: string): void {
  for (const item of items) {
    const record = item as Record<string, unknown> | null;
    for (const key of keys) {
      if (record === null || typeof record !== 'object' || record[key] === undefined || record[key] === null) {
        throw new InvalidArgumentError(message);
      }
    }
  }
}
