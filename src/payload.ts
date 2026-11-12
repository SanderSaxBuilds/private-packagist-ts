// Request bodies for creating and editing packages, in the PHP Payload classes' key order.

import { phpJsonEncode } from './php.ts';

/** Who in a suborganization gets access to a new package by default. */
export type DefaultSuborganizationAccess = 'admin' | 'update' | 'read' | 'hidden' | (string & {});

export interface VcsPackageParameters {
  repoType: string;
  repoUrl: string;
  credentials: number | null;
  defaultSuborganizationAccess?: string;
}

export interface CustomPackageParameters {
  repoType: 'package';
  repoConfig: string;
  credentials: number | null;
  defaultSuborganizationAccess?: string;
}

export interface ArtifactPackageParameters {
  repoType: 'artifact';
  artifactIds: number[];
  defaultSuborganizationAccess?: string;
}

/** A package definition for createCustomPackage: a composer.json-style object or a JSON string. */
export type CustomPackageJson = string | Record<string, unknown>;

export function vcsPackageParameters(
  url: string,
  credentialId: number | null | undefined,
  type: string | null | undefined,
  defaultSuborganizationAccess: string | null | undefined,
): VcsPackageParameters {
  const data: VcsPackageParameters = { repoType: type ?? 'vcs', repoUrl: url, credentials: credentialId ?? null };
  if (defaultSuborganizationAccess) data.defaultSuborganizationAccess = defaultSuborganizationAccess;
  return data;
}

export function customPackageParameters(
  customJson: CustomPackageJson,
  credentialId: number | null | undefined,
  defaultSuborganizationAccess: string | null | undefined,
): CustomPackageParameters {
  const repoConfig = typeof customJson === 'string' ? customJson : phpJsonEncode(customJson);
  const data: CustomPackageParameters = { repoType: 'package', repoConfig, credentials: credentialId ?? null };
  if (defaultSuborganizationAccess) data.defaultSuborganizationAccess = defaultSuborganizationAccess;
  return data;
}

export function artifactPackageParameters(
  artifactIds: readonly number[],
  defaultSuborganizationAccess: string | null | undefined,
): ArtifactPackageParameters {
  const data: ArtifactPackageParameters = { repoType: 'artifact', artifactIds: [...artifactIds] };
  if (defaultSuborganizationAccess) data.defaultSuborganizationAccess = defaultSuborganizationAccess;
  return data;
}
