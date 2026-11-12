// Endpoints that suborganizations and the older subrepositories share. They differ only in the
// path prefix.

import type { FileContent, PrivatePackagistClient, RequestOptions } from '../client.ts';
import {
  artifactPackageParameters,
  customPackageParameters,
  vcsPackageParameters,
  type CustomPackageJson,
  type DefaultSuborganizationAccess,
} from '../payload.ts';
import type {
  ComposerRepository,
  Job,
  Package,
  PackageArtifact,
  PackageWithVersions,
  SuborganizationMirroredThirdPartyRepository,
  SuborganizationTeam,
  TeamSuborganizationPermissionType,
} from '../schema.ts';
import type { MirroringBehavior } from './mirrored-repositories.ts';
import { artifactHeaders, type PackageIdOrName } from './packages.ts';
import { assertConfirmation, assertEachHas, assertOriginFilter, Resource, type Open, type PackageFilters, type RegenerateConfirmation } from './resource.ts';

export type Scope = '/suborganizations' | '/subrepositories';

export interface ScopedTeamAccess {
  id: number;
  /** "owner" or "view". */
  permission: Open<TeamSuborganizationPermissionType>;
  [key: string]: unknown;
}

export interface ScopedMirroredRepositoryAccess {
  id: number;
  mirroringBehavior: MirroringBehavior;
  [key: string]: unknown;
}

export interface ScopedTokenData {
  description: string;
  access: 'read' | 'update' | (string & {});
  expiresAt?: string | null;
  [key: string]: unknown;
}

abstract class ScopedResource extends Resource {
  protected readonly scope: Scope;

  constructor(client: PrivatePackagistClient, scope: Scope) {
    super(client);
    this.scope = scope;
  }

  protected path(template: string, ...args: Array<string | number>): string {
    return this.client.buildPath(this.scope + template, ...args);
  }
}

export class ScopedMirroredRepositories extends ScopedResource {
  all(name: string, options?: RequestOptions): Promise<SuborganizationMirroredThirdPartyRepository[]> {
    return this.client.getCollection(this.path('/%s/mirrored-repositories/', name), undefined, options);
  }

  /** Makes organization mirrors available in the suborganization. */
  add(name: string, mirroredRepositories: readonly ScopedMirroredRepositoryAccess[], options?: RequestOptions): Promise<SuborganizationMirroredThirdPartyRepository[]> {
    assertEachHas(mirroredRepositories, ['id', 'mirroringBehavior'], 'The "id" and the "mirroringBehavior" are required to add a mirrored repository to a project');
    return this.client.post(this.path('/%s/mirrored-repositories/', name), mirroredRepositories, options);
  }

  show(name: string, mirroredRepositoryId: number, options?: RequestOptions): Promise<SuborganizationMirroredThirdPartyRepository> {
    return this.client.get(this.path('/%s/mirrored-repositories/%s/', name, mirroredRepositoryId), undefined, options);
  }

  edit(name: string, mirroredRepositoryId: number, mirroringBehavior: MirroringBehavior, options?: RequestOptions): Promise<SuborganizationMirroredThirdPartyRepository> {
    return this.client.put(this.path('/%s/mirrored-repositories/%s/', name, mirroredRepositoryId), { mirroringBehavior }, options);
  }

  remove(name: string, mirroredRepositoryId: number, options?: RequestOptions): Promise<Job> {
    return this.client.delete(this.path('/%s/mirrored-repositories/%s/', name, mirroredRepositoryId), undefined, options);
  }

  listPackages(name: string, mirroredRepositoryId: number, options?: RequestOptions): Promise<Package[]> {
    return this.client.getCollection(this.path('/%s/mirrored-repositories/%s/packages/', name, mirroredRepositoryId), undefined, options);
  }

  addPackages(name: string, mirroredRepositoryId: number, packages: readonly string[], options?: RequestOptions): Promise<Job[]> {
    return this.client.post(this.path('/%s/mirrored-repositories/%s/packages/', name, mirroredRepositoryId), packages, options);
  }

  removePackages(name: string, mirroredRepositoryId: number, options?: RequestOptions): Promise<Job> {
    return this.client.delete(this.path('/%s/mirrored-repositories/%s/packages/', name, mirroredRepositoryId), undefined, options);
  }
}

export class ScopedPackages extends ScopedResource {
  all(name: string, filters: PackageFilters = {}, options?: RequestOptions): Promise<Package[]> {
    assertOriginFilter(filters);
    return this.client.getCollection(this.path('/%s/packages/', name), filters, options);
  }

  show(name: string, packageIdOrName: PackageIdOrName, options?: RequestOptions): Promise<PackageWithVersions> {
    return this.client.get(this.path('/%s/packages/%s/', name, packageIdOrName), undefined, options);
  }

  createVcsPackage(
    name: string,
    url: string,
    credentialId: number | null = null,
    type = 'vcs',
    defaultSuborganizationAccess: DefaultSuborganizationAccess | null = null,
    options?: RequestOptions,
  ): Promise<Job> {
    return this.client.post(this.path('/%s/packages/', name), vcsPackageParameters(url, credentialId, type, defaultSuborganizationAccess), options);
  }

  createCustomPackage(
    name: string,
    customJson: CustomPackageJson,
    credentialId: number | null = null,
    defaultSuborganizationAccess: DefaultSuborganizationAccess | null = null,
    options?: RequestOptions,
  ): Promise<Job> {
    return this.client.post(this.path('/%s/packages/', name), customPackageParameters(customJson, credentialId, defaultSuborganizationAccess), options);
  }

  editVcsPackage(
    name: string,
    packageIdOrName: PackageIdOrName,
    url: string,
    credentialId: number | null = null,
    type = 'vcs',
    defaultSuborganizationAccess: DefaultSuborganizationAccess | null = null,
    options?: RequestOptions,
  ): Promise<Job> {
    return this.client.put(this.path('/%s/packages/%s/', name, packageIdOrName), vcsPackageParameters(url, credentialId, type, defaultSuborganizationAccess), options);
  }

  editCustomPackage(
    name: string,
    packageIdOrName: PackageIdOrName,
    customJson: CustomPackageJson,
    credentialId: number | null = null,
    defaultSuborganizationAccess: DefaultSuborganizationAccess | null = null,
    options?: RequestOptions,
  ): Promise<Job> {
    return this.client.put(this.path('/%s/packages/%s/', name, packageIdOrName), customPackageParameters(customJson, credentialId, defaultSuborganizationAccess), options);
  }

  async remove(name: string, packageIdOrName: PackageIdOrName, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.path('/%s/packages/%s/', name, packageIdOrName), undefined, options);
  }

  listDependents(name: string, packageIdOrName: PackageIdOrName, options?: RequestOptions): Promise<Package[]> {
    return this.client.getCollection(this.path('/%s/packages/%s/dependents/', name, packageIdOrName), undefined, options);
  }
}

export class SuborganizationPackageArtifacts extends Resource {
  create(suborganizationName: string, file: FileContent, contentType: string, fileName: string, options?: RequestOptions): Promise<PackageArtifact> {
    return this.client.postFile(this.client.buildPath('/suborganizations/%s/packages/artifacts/', suborganizationName), file, artifactHeaders(contentType, fileName), options);
  }

  add(
    suborganizationName: string,
    packageIdOrName: PackageIdOrName,
    file: FileContent,
    contentType: string,
    fileName: string,
    options?: RequestOptions,
  ): Promise<PackageArtifact> {
    return this.client.postFile(
      this.client.buildPath('/suborganizations/%s/packages/%s/artifacts/', suborganizationName, packageIdOrName),
      file,
      artifactHeaders(contentType, fileName),
      options,
    );
  }

  show(suborganizationName: string, artifactId: number, options?: RequestOptions): Promise<PackageArtifact> {
    return this.client.get(this.client.buildPath('/suborganizations/%s/packages/artifacts/%s/', suborganizationName, artifactId), undefined, options);
  }

  showPackageArtifacts(suborganizationName: string, packageIdOrName: PackageIdOrName, options?: RequestOptions): Promise<PackageArtifact[]> {
    return this.client.getCollection(this.client.buildPath('/suborganizations/%s/packages/%s/artifacts/', suborganizationName, packageIdOrName), undefined, options);
  }
}

export class SuborganizationPackages extends ScopedPackages {
  readonly artifacts: SuborganizationPackageArtifacts;

  constructor(client: PrivatePackagistClient) {
    super(client, '/suborganizations');
    this.artifacts = new SuborganizationPackageArtifacts(client);
  }

  createArtifactPackage(suborganizationName: string, artifactPackageFileIds: readonly number[], options?: RequestOptions): Promise<Job> {
    return this.client.post(this.path('/%s/packages/', suborganizationName), artifactPackageParameters(artifactPackageFileIds, null), options);
  }

  editArtifactPackage(suborganizationName: string, packageIdOrName: PackageIdOrName, artifactPackageFileIds: readonly number[], options?: RequestOptions): Promise<Job> {
    return this.client.put(this.path('/%s/packages/%s/', suborganizationName, packageIdOrName), artifactPackageParameters(artifactPackageFileIds, null), options);
  }
}

/** Shared top-level endpoints: the suborganization itself, its teams and its tokens. */
export abstract class ScopedContainer<T> extends ScopedResource {
  all(options?: RequestOptions): Promise<T[]> {
    return this.client.getCollection(`${this.scope}/`, undefined, options);
  }

  show(name: string, options?: RequestOptions): Promise<T> {
    return this.client.get(this.path('/%s/', name), undefined, options);
  }

  create(name: string, options?: RequestOptions): Promise<T> {
    return this.client.post(`${this.scope}/`, { name }, options);
  }

  async remove(name: string, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.path('/%s/', name), undefined, options);
  }

  listTeams(name: string, options?: RequestOptions): Promise<SuborganizationTeam[]> {
    return this.client.getCollection(this.path('/%s/teams/', name), undefined, options);
  }

  /** Gives teams access, or changes their permission. Each entry needs an id and a permission. */
  addOrEditTeams(name: string, teams: readonly ScopedTeamAccess[], options?: RequestOptions): Promise<SuborganizationTeam[]> {
    for (const team of teams) {
      assertEachHas([team], ['id'], 'Parameter "id" is required.');
      assertEachHas([team], ['permission'], 'Parameter "permission" is required.');
    }
    return this.client.post(this.path('/%s/teams/', name), teams, options);
  }

  async removeTeam(name: string, teamId: number, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.path('/%s/teams/%s/', name, teamId), undefined, options);
  }

  listTokens(name: string, options?: RequestOptions): Promise<ComposerRepository[]> {
    return this.client.getCollection(this.path('/%s/tokens/', name), undefined, options);
  }

  createToken(name: string, tokenData: ScopedTokenData, options?: RequestOptions): Promise<ComposerRepository> {
    return this.client.post(this.path('/%s/tokens/', name), tokenData, options);
  }

  async removeToken(name: string, tokenId: number, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.path('/%s/tokens/%s/', name, tokenId), undefined, options);
  }

  regenerateToken(name: string, tokenId: number, confirmation: RegenerateConfirmation, options?: RequestOptions): Promise<ComposerRepository> {
    assertConfirmation(confirmation);
    return this.client.post(this.path('/%s/tokens/%s/regenerate', name, tokenId), confirmation, options);
  }
}
