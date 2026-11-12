import type { PrivatePackagistClient, RequestOptions } from '../client.ts';
import type { VendorBundle, VendorBundlePackage } from '../schema.ts';
import type { Stability } from './customers.ts';
import type { PackageIdOrName } from './packages.ts';
import { assertEachHas, Resource } from './resource.ts';

export interface VendorBundleChanges {
  name?: string;
  minimumAccessibleStability?: Stability | null;
  versionConstraint?: string | null;
  assignAllPackages?: boolean;
  synchronizationIds?: number[];
  [key: string]: unknown;
}

export interface VendorBundlePackageGrant {
  name: string;
  versionConstraint?: string | null;
  minimumAccessibleStability?: Stability | null;
  [key: string]: unknown;
}

export class VendorBundlePackages extends Resource {
  listPackages(vendorBundleId: number, options?: RequestOptions): Promise<VendorBundlePackage[]> {
    return this.client.getCollection(this.client.buildPath('/vendor-bundles/%s/packages/', vendorBundleId), undefined, options);
  }

  addOrEditPackages(vendorBundleId: number, packages: readonly VendorBundlePackageGrant[], options?: RequestOptions): Promise<VendorBundlePackage[]> {
    assertEachHas(packages, ['name'], 'Parameter "name" is required.');
    return this.client.post(this.client.buildPath('/vendor-bundles/%s/packages/', vendorBundleId), packages, options);
  }

  async removePackage(vendorBundleId: number, packageIdOrName: PackageIdOrName, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.client.buildPath('/vendor-bundles/%s/packages/%s/', vendorBundleId, packageIdOrName), undefined, options);
  }
}

export class VendorBundles extends Resource {
  readonly packages: VendorBundlePackages;

  constructor(client: PrivatePackagistClient) {
    super(client);
    this.packages = new VendorBundlePackages(client);
  }

  all(options?: RequestOptions): Promise<VendorBundle[]> {
    return this.client.getCollection('/vendor-bundles/', undefined, options);
  }

  show(vendorBundleId: number, options?: RequestOptions): Promise<VendorBundle> {
    return this.client.get(this.client.buildPath('/vendor-bundles/%s/', vendorBundleId), undefined, options);
  }

  create(
    name: string,
    minimumAccessibleStability: Stability | null = null,
    versionConstraint: string | null = null,
    assignAllPackages = false,
    synchronizationIds: readonly number[] = [],
    options?: RequestOptions,
  ): Promise<VendorBundle> {
    return this.client.post('/vendor-bundles/', { name, minimumAccessibleStability, versionConstraint, assignAllPackages, synchronizationIds }, options);
  }

  edit(vendorBundleId: number, bundle: VendorBundleChanges, options?: RequestOptions): Promise<VendorBundle> {
    return this.client.put(this.client.buildPath('/vendor-bundles/%s/', vendorBundleId), bundle, options);
  }

  async remove(vendorBundleId: number, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.client.buildPath('/vendor-bundles/%s/', vendorBundleId), undefined, options);
  }
}
