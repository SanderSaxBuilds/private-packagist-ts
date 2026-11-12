import type { PrivatePackagistClient, RequestOptions } from '../client.ts';
import type { Package, Subrepository } from '../schema.ts';
import { ScopedContainer, ScopedMirroredRepositories, ScopedPackages, type ScopedTeamAccess } from './scoped.ts';
import type { SuborganizationTeam } from '../schema.ts';

/**
 * The older subrepositories endpoints, kept for code that still uses them.
 * @deprecated Use client.suborganizations.
 */
export class Subrepositories extends ScopedContainer<Subrepository> {
  readonly packages: ScopedPackages;
  readonly mirroredRepositories: ScopedMirroredRepositories;

  constructor(client: PrivatePackagistClient) {
    super(client, '/subrepositories');
    this.packages = new ScopedPackages(client, '/subrepositories');
    this.mirroredRepositories = new ScopedMirroredRepositories(client, '/subrepositories');
  }

  /** @deprecated Use addOrEditTeams. */
  addOrUpdateTeams(name: string, teams: readonly ScopedTeamAccess[], options?: RequestOptions): Promise<SuborganizationTeam[]> {
    return this.addOrEditTeams(name, teams, options);
  }

  /** @deprecated Use packages.all. */
  listPackages(name: string, options?: RequestOptions): Promise<Package[]> {
    return this.packages.all(name, {}, options);
  }
}
