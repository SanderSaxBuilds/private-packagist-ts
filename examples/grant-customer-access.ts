// Gives a customer access to a package, creating the customer if it does not exist yet, and prints
// the Composer repository URL to send them.
//
//   PACKAGIST_API_KEY=... PACKAGIST_API_SECRET=... node examples/grant-customer-access.ts acme-corp "Acme Corp" acme/website "^2.0"
//
// In your own code, import from 'private-packagist-api'.

import { PrivatePackagistClient, ResourceNotFoundError, type Customer } from '../src/index.ts';

const [urlName, name, packageName, constraint = '*'] = process.argv.slice(2);
if (!urlName || !name || !packageName) {
  console.error('usage: grant-customer-access.ts <url-name> <name> <vendor/package> [version constraint]');
  process.exit(2);
}

const client = new PrivatePackagistClient({
  key: process.env.PACKAGIST_API_KEY,
  secret: process.env.PACKAGIST_API_SECRET,
});

async function findOrCreate(): Promise<Customer> {
  try {
    return await client.customers.show(urlName!);
  } catch (error) {
    if (!(error instanceof ResourceNotFoundError)) throw error;
    return client.customers.create(name!, false, urlName!);
  }
}

const customer = await findOrCreate();
await client.customers.addOrEditPackages(customer.id, [{ name: packageName, versionConstraint: constraint }]);

const { composerRepository } = await client.customers.show(customer.id);
console.log(`${customer.name} can now install ${packageName} ${constraint}`);
console.log(`Repository: ${composerRepository.url}`);
console.log(`User: ${composerRepository.user}`);
