import type { PrivatePackagistClient } from '../client.ts';
import type { Suborganization } from '../schema.ts';
import { ScopedContainer, ScopedMirroredRepositories, SuborganizationPackages } from './scoped.ts';

/** Suborganizations: separate Composer repositories inside the organization, each with its own packages, teams and tokens. */
export class Suborganizations extends ScopedContainer<Suborganization> {
  readonly packages: SuborganizationPackages;
  readonly mirroredRepositories: ScopedMirroredRepositories;

  constructor(client: PrivatePackagistClient) {
    super(client, '/suborganizations');
    this.packages = new SuborganizationPackages(client);
    this.mirroredRepositories = new ScopedMirroredRepositories(client, '/suborganizations');
  }
}
