import type { FileContent, PrivatePackagistClient, RequestOptions } from '../client.ts';
import {
  artifactPackageParameters,
  customPackageParameters,
  vcsPackageParameters,
  type CustomPackageJson,
  type DefaultSuborganizationAccess,
} from '../payload.ts';
import type { Customer, Job, MonitoredPackage, Package, PackageArtifact, PackageWithVersions, SecurityIssue } from '../schema.ts';
import type { SecurityIssueFilters } from './security-issues.ts';
import {
  assertOriginFilter,
  ORIGIN_PRIVATE,
  ORIGIN_PRIVATE_MIRROR,
  ORIGIN_PUBLIC_MIRROR,
  AVAILABLE_ORIGINS,
  Resource,
  type PackageFilters,
} from './resource.ts';

export type PackageIdOrName = string | number;

/** Headers for an artifact upload, without the ones left empty (PHP array_filter). */
export function artifactHeaders(contentType: string | null | undefined, fileName: string | null | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (contentType) headers['Content-Type'] = contentType;
  if (fileName) headers['X-FILENAME'] = fileName;
  return headers;
}

export interface SecurityMonitoringConfig {
  monitorAllBranches?: boolean;
  monitoredBranches?: string[];
  [key: string]: unknown;
}

export class PackageArtifacts extends Resource {
  /** Uploads an archive (zip or tar) that a new artifact package can be created from. */
  create(file: FileContent, contentType: string, fileName: string, options?: RequestOptions): Promise<PackageArtifact> {
    return this.client.postFile('/packages/artifacts/', file, artifactHeaders(contentType, fileName), options);
  }

  /** Uploads a new archive to an existing artifact package. */
  add(packageIdOrName: PackageIdOrName, file: FileContent, contentType: string, fileName: string, options?: RequestOptions): Promise<PackageArtifact> {
    return this.client.postFile(this.client.buildPath('/packages/%s/artifacts/', packageIdOrName), file, artifactHeaders(contentType, fileName), options);
  }

  show(artifactId: number, options?: RequestOptions): Promise<PackageArtifact> {
    return this.client.get(this.client.buildPath('/packages/artifacts/%s/', artifactId), undefined, options);
  }

  showPackageArtifacts(packageIdOrName: PackageIdOrName, options?: RequestOptions): Promise<PackageArtifact[]> {
    return this.client.getCollection(this.client.buildPath('/packages/%s/artifacts/', packageIdOrName), undefined, options);
  }
}

export class Packages extends Resource {
  static readonly ORIGIN_PUBLIC_MIRROR = ORIGIN_PUBLIC_MIRROR;
  static readonly ORIGIN_PRIVATE_MIRROR = ORIGIN_PRIVATE_MIRROR;
  static readonly ORIGIN_PRIVATE = ORIGIN_PRIVATE;
  /** @deprecated Use ORIGIN_PUBLIC_MIRROR. */
  static readonly ORIGIN_PUBLIC_PROXY = ORIGIN_PUBLIC_MIRROR;
  /** @deprecated Use ORIGIN_PRIVATE_MIRROR. */
  static readonly ORIGIN_PRIVATE_PROXY = ORIGIN_PRIVATE_MIRROR;
  static readonly AVAILABLE_ORIGINS = AVAILABLE_ORIGINS;

  readonly artifacts: PackageArtifacts;

  constructor(client: PrivatePackagistClient) {
    super(client);
    this.artifacts = new PackageArtifacts(client);
  }

  /** All packages of the organization. Filters: origin, security-issue-state. */
  all(filters: PackageFilters = {}, options?: RequestOptions): Promise<Package[]> {
    assertOriginFilter(filters);
    return this.client.getCollection('/packages/', filters, options);
  }

  /** Same as all(), one package at a time, fetching pages as they are needed. */
  iterate(filters: PackageFilters = {}, options?: RequestOptions): AsyncGenerator<Package, void, undefined> {
    assertOriginFilter(filters);
    return this.client.paginate('/packages/', filters, options);
  }

  show(packageIdOrName: PackageIdOrName, options?: RequestOptions): Promise<PackageWithVersions> {
    return this.client.get(this.client.buildPath('/packages/%s/', packageIdOrName), undefined, options);
  }

  /** Adds a package from a Git, Mercurial or Subversion URL. Returns the job that imports it. */
  createVcsPackage(
    url: string,
    credentialId: number | null = null,
    type = 'vcs',
    defaultSuborganizationAccess: DefaultSuborganizationAccess | null = null,
    options?: RequestOptions,
  ): Promise<Job> {
    return this.client.post('/packages/', vcsPackageParameters(url, credentialId, type, defaultSuborganizationAccess), options);
  }

  /** Adds a package from a JSON definition, given as a string or an object. */
  createCustomPackage(
    customJson: CustomPackageJson,
    credentialId: number | null = null,
    defaultSuborganizationAccess: DefaultSuborganizationAccess | null = null,
    options?: RequestOptions,
  ): Promise<Job> {
    return this.client.post('/packages/', customPackageParameters(customJson, credentialId, defaultSuborganizationAccess), options);
  }

  /** Creates a package from artifacts uploaded with packages.artifacts.create. */
  createArtifactPackage(
    artifactPackageFileIds: readonly number[],
    defaultSuborganizationAccess: DefaultSuborganizationAccess | null = null,
    options?: RequestOptions,
  ): Promise<Job> {
    return this.client.post('/packages/', artifactPackageParameters(artifactPackageFileIds, defaultSuborganizationAccess), options);
  }

  editVcsPackage(
    packageIdOrName: PackageIdOrName,
    url: string,
    credentialId: number | null = null,
    type = 'vcs',
    defaultSuborganizationAccess: DefaultSuborganizationAccess | null = null,
    options?: RequestOptions,
  ): Promise<Job> {
    return this.client.put(this.client.buildPath('/packages/%s/', packageIdOrName), vcsPackageParameters(url, credentialId, type, defaultSuborganizationAccess), options);
  }

  /** @deprecated Use editVcsPackage. */
  updateVcsPackage(packageName: PackageIdOrName, url: string, credentialId: number | null = null, options?: RequestOptions): Promise<Job> {
    return this.editVcsPackage(packageName, url, credentialId, 'vcs', null, options);
  }

  editArtifactPackage(
    packageIdOrName: PackageIdOrName,
    artifactPackageFileIds: readonly number[],
    defaultSuborganizationAccess: DefaultSuborganizationAccess | null = null,
    options?: RequestOptions,
  ): Promise<Job> {
    return this.client.put(this.client.buildPath('/packages/%s/', packageIdOrName), artifactPackageParameters(artifactPackageFileIds, defaultSuborganizationAccess), options);
  }

  editCustomPackage(
    packageIdOrName: PackageIdOrName,
    customJson: CustomPackageJson,
    credentialId: number | null = null,
    defaultSuborganizationAccess: DefaultSuborganizationAccess | null = null,
    options?: RequestOptions,
  ): Promise<Job> {
    return this.client.put(this.client.buildPath('/packages/%s/', packageIdOrName), customPackageParameters(customJson, credentialId, defaultSuborganizationAccess), options);
  }

  /** @deprecated Use editCustomPackage. */
  updateCustomPackage(packageName: PackageIdOrName, customJson: CustomPackageJson, credentialId: number | null = null, options?: RequestOptions): Promise<Job> {
    return this.editCustomPackage(packageName, customJson, credentialId, null, options);
  }

  async remove(packageIdOrName: PackageIdOrName, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.client.buildPath('/packages/%s/', packageIdOrName), undefined, options);
  }

  /** The customers that have access to a package. */
  listCustomers(packageIdOrName: PackageIdOrName, options?: RequestOptions): Promise<Array<{ customer: Customer; package: Package }>> {
    return this.client.getCollection(this.client.buildPath('/packages/%s/customers/', packageIdOrName), undefined, options);
  }

  /** Packages that require this package. */
  listDependents(packageName: PackageIdOrName, options?: RequestOptions): Promise<Package[]> {
    return this.client.getCollection(this.client.buildPath('/packages/%s/dependents/', packageName), undefined, options);
  }

  listSecurityIssues(packageIdOrName: PackageIdOrName, filters: SecurityIssueFilters = {}, options?: RequestOptions): Promise<SecurityIssue[]> {
    return this.client.getCollection(this.client.buildPath('/packages/%s/security-issues/', packageIdOrName), filters, options);
  }

  showSecurityMonitoringConfig(packageIdOrName: PackageIdOrName, options?: RequestOptions): Promise<MonitoredPackage> {
    return this.client.get(this.client.buildPath('/packages/%s/security-monitoring/', packageIdOrName), undefined, options);
  }

  editSecurityMonitoringConfig(packageIdOrName: PackageIdOrName, config: SecurityMonitoringConfig, options?: RequestOptions): Promise<MonitoredPackage> {
    return this.client.put(this.client.buildPath('/packages/%s/security-monitoring/', packageIdOrName), config, options);
  }
}
