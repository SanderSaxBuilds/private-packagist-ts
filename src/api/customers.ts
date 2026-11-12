import type { PrivatePackagistClient, RequestOptions } from '../client.ts';
import type {
  ComposerRepository,
  Customer,
  CustomerMinimumAccessibleStability,
  CustomerPackage,
  CustomerPackageWithVersions,
  CustomerVendorBundle,
  MagentoLegacyKey,
} from '../schema.ts';
import type { PackageIdOrName } from './packages.ts';
import { assertConfirmation, assertEachHas, Resource, type RegenerateConfirmation } from './resource.ts';

export type CustomerIdOrUrlName = string | number;
export type Stability = NonNullable<CustomerMinimumAccessibleStability> | (string & {});

export interface CustomerChanges {
  name?: string;
  urlName?: string;
  accessToVersionControlSource?: boolean;
  minimumAccessibleStability?: Stability | null;
  assignAllPackages?: boolean;
  [key: string]: unknown;
}

export interface CustomerPackageGrant {
  /** Package name. */
  name: string;
  /** Composer constraint for the versions the customer can install, for example "^1.0 | ^2.0". */
  versionConstraint?: string | null;
  /** ISO 8601 date after which new versions are no longer available to the customer. */
  expirationDate?: string | null;
  minimumAccessibleStability?: Stability | null;
  [key: string]: unknown;
}

export class CustomerVendorBundles extends Resource {
  listVendorBundles(customerIdOrUrlName: CustomerIdOrUrlName, options?: RequestOptions): Promise<CustomerVendorBundle[]> {
    return this.client.getCollection(this.client.buildPath('/customers/%s/vendor-bundles/', customerIdOrUrlName), undefined, options);
  }

  /** Gives the customer a vendor bundle, or changes its expiration date. */
  addOrEditVendorBundle(
    customerIdOrUrlName: CustomerIdOrUrlName,
    vendorBundleId: number,
    expirationDate: string | null = null,
    options?: RequestOptions,
  ): Promise<CustomerVendorBundle> {
    return this.client.post(this.client.buildPath('/customers/%s/vendor-bundles/', customerIdOrUrlName), { vendorBundleId, expirationDate }, options);
  }

  async removeVendorBundle(customerIdOrUrlName: CustomerIdOrUrlName, vendorBundleId: number, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.client.buildPath('/customers/%s/vendor-bundles/%s/', customerIdOrUrlName, vendorBundleId), undefined, options);
  }
}

export class MagentoLegacyKeys extends Resource {
  all(customerIdOrUrlName: CustomerIdOrUrlName, options?: RequestOptions): Promise<MagentoLegacyKey[]> {
    return this.client.getCollection(this.client.buildPath('/api/customers/%s/magento-legacy-keys/', customerIdOrUrlName), undefined, options);
  }

  create(customerIdOrUrlName: CustomerIdOrUrlName, publicKey: string, privateKey: string, options?: RequestOptions): Promise<MagentoLegacyKey> {
    return this.client.post(this.client.buildPath('/api/customers/%s/magento-legacy-keys/', customerIdOrUrlName), { publicKey, privateKey }, options);
  }

  async remove(customerIdOrUrlName: CustomerIdOrUrlName, publicKey: string, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.client.buildPath('/api/customers/%s/magento-legacy-keys/%s/', customerIdOrUrlName, publicKey), undefined, options);
  }
}

export class Customers extends Resource {
  readonly vendorBundles: CustomerVendorBundles;
  readonly magentoLegacyKeys: MagentoLegacyKeys;

  constructor(client: PrivatePackagistClient) {
    super(client);
    this.vendorBundles = new CustomerVendorBundles(client);
    this.magentoLegacyKeys = new MagentoLegacyKeys(client);
  }

  all(options?: RequestOptions): Promise<Customer[]> {
    return this.client.getCollection('/customers/', undefined, options);
  }

  show(customerIdOrUrlName: CustomerIdOrUrlName, options?: RequestOptions): Promise<Customer> {
    return this.client.get(this.client.buildPath('/customers/%s/', customerIdOrUrlName), undefined, options);
  }

  create(
    name: string,
    accessToVersionControlSource = false,
    urlName: string | null = null,
    minimumAccessibleStability: Stability | null = null,
    assignAllPackages = false,
    options?: RequestOptions,
  ): Promise<Customer> {
    const parameters: Record<string, unknown> = { name, accessToVersionControlSource, minimumAccessibleStability, assignAllPackages };
    if (urlName) parameters.urlName = urlName;
    return this.client.post('/customers/', parameters, options);
  }

  edit(customerIdOrUrlName: CustomerIdOrUrlName, customer: CustomerChanges, options?: RequestOptions): Promise<Customer> {
    return this.client.put(this.client.buildPath('/customers/%s/', customerIdOrUrlName), customer, options);
  }

  /** @deprecated Use edit. */
  update(customerIdOrUrlName: CustomerIdOrUrlName, customer: CustomerChanges, options?: RequestOptions): Promise<Customer> {
    return this.edit(customerIdOrUrlName, customer, options);
  }

  async remove(customerIdOrUrlName: CustomerIdOrUrlName, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.client.buildPath('/customers/%s/', customerIdOrUrlName), undefined, options);
  }

  enable(customerIdOrUrlName: CustomerIdOrUrlName, options?: RequestOptions): Promise<Customer> {
    return this.client.put(this.client.buildPath('/customers/%s/enable', customerIdOrUrlName), undefined, options);
  }

  disable(customerIdOrUrlName: CustomerIdOrUrlName, options?: RequestOptions): Promise<Customer> {
    return this.client.put(this.client.buildPath('/customers/%s/disable', customerIdOrUrlName), undefined, options);
  }

  listPackages(customerIdOrUrlName: CustomerIdOrUrlName, options?: RequestOptions): Promise<CustomerPackage[]> {
    return this.client.getCollection(this.client.buildPath('/customers/%s/packages/', customerIdOrUrlName), undefined, options);
  }

  showPackage(customerIdOrUrlName: CustomerIdOrUrlName, packageIdOrName: PackageIdOrName, options?: RequestOptions): Promise<CustomerPackageWithVersions> {
    return this.client.get(this.client.buildPath('/customers/%s/packages/%s/', customerIdOrUrlName, packageIdOrName), undefined, options);
  }

  /** Grants packages to the customer, or changes the constraints of packages it already has. */
  addOrEditPackages(customerIdOrUrlName: CustomerIdOrUrlName, packages: readonly CustomerPackageGrant[], options?: RequestOptions): Promise<CustomerPackage[]> {
    assertEachHas(packages, ['name'], 'Parameter "name" is required.');
    return this.client.post(this.client.buildPath('/customers/%s/packages/', customerIdOrUrlName), packages, options);
  }

  /** @deprecated Use addOrEditPackages. */
  addOrUpdatePackages(customerIdOrUrlName: CustomerIdOrUrlName, packages: readonly CustomerPackageGrant[], options?: RequestOptions): Promise<CustomerPackage[]> {
    return this.addOrEditPackages(customerIdOrUrlName, packages, options);
  }

  /** @deprecated Use addOrEditPackages. */
  addPackages(customerIdOrUrlName: CustomerIdOrUrlName, packages: readonly CustomerPackageGrant[], options?: RequestOptions): Promise<CustomerPackage[]> {
    return this.addOrEditPackages(customerIdOrUrlName, packages, options);
  }

  async removePackage(customerIdOrUrlName: CustomerIdOrUrlName, packageIdOrName: PackageIdOrName, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.client.buildPath('/customers/%s/packages/%s/', customerIdOrUrlName, packageIdOrName), undefined, options);
  }

  /** Issues a new Composer repository token for the customer. The old one stops working right away. */
  regenerateToken(customerIdOrUrlName: CustomerIdOrUrlName, confirmation: RegenerateConfirmation, options?: RequestOptions): Promise<ComposerRepository> {
    assertConfirmation(confirmation);
    return this.client.post(this.client.buildPath('/customers/%s/token/regenerate', customerIdOrUrlName), confirmation, options);
  }
}
