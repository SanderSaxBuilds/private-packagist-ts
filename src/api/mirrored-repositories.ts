import type { RequestOptions } from '../client.ts';
import type { Job, MirroredThirdPartyRepository, MirroredThirdPartyRepositoryMirroringBehavior, Package } from '../schema.ts';
import { Resource, type Open } from './resource.ts';

export type MirroringBehavior = Open<MirroredThirdPartyRepositoryMirroringBehavior>;

export class MirroredRepositories extends Resource {
  all(options?: RequestOptions): Promise<MirroredThirdPartyRepository[]> {
    return this.client.getCollection('/mirrored-repositories/', undefined, options);
  }

  create(name: string, url: string, mirroringBehavior: MirroringBehavior, credentials: number | null = null, options?: RequestOptions): Promise<MirroredThirdPartyRepository> {
    return this.client.post('/mirrored-repositories/', { name, url, mirroringBehavior, credentials }, options);
  }

  show(mirroredRepositoryId: number, options?: RequestOptions): Promise<MirroredThirdPartyRepository> {
    return this.client.get(this.client.buildPath('/mirrored-repositories/%s/', mirroredRepositoryId), undefined, options);
  }

  edit(
    mirroredRepositoryId: number,
    name: string,
    url: string,
    mirroringBehavior: MirroringBehavior,
    credentials: number | null = null,
    options?: RequestOptions,
  ): Promise<MirroredThirdPartyRepository> {
    return this.client.put(this.client.buildPath('/mirrored-repositories/%s/', mirroredRepositoryId), { name, url, mirroringBehavior, credentials }, options);
  }

  /** Removes the mirror. The API answers with the job that cleans it up. */
  remove(mirroredRepositoryId: number, options?: RequestOptions): Promise<Job> {
    return this.client.delete(this.client.buildPath('/mirrored-repositories/%s/', mirroredRepositoryId), undefined, options);
  }

  listPackages(mirroredRepositoryId: number, options?: RequestOptions): Promise<Package[]> {
    return this.client.getCollection(this.client.buildPath('/mirrored-repositories/%s/packages/', mirroredRepositoryId), undefined, options);
  }

  addPackages(mirroredRepositoryId: number, packages: readonly string[], options?: RequestOptions): Promise<Job[]> {
    return this.client.post(this.client.buildPath('/mirrored-repositories/%s/packages/', mirroredRepositoryId), packages, options);
  }

  removePackages(mirroredRepositoryId: number, options?: RequestOptions): Promise<Job> {
    return this.client.delete(this.client.buildPath('/mirrored-repositories/%s/packages/', mirroredRepositoryId), undefined, options);
  }
}
