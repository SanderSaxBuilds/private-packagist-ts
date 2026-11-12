// Uploads a release zip as a new artifact version of a package, from GitHub Actions, with no stored secret.
//
//   permissions:
//     id-token: write
//     contents: read
//   steps:
//     - uses: actions/checkout@v4
//     - uses: actions/setup-node@v4
//       with:
//         node-version: 22
//     - run: zip -r build/package.zip . -x '.git/*'
//     - run: node --experimental-strip-types examples/github-actions-upload.ts acme-org acme/website build/package.zip
//
// Trusted publishing has to be set up for the package in Private Packagist first.
// In your own code, import from 'private-packagist-api'.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { PrivatePackagistClient } from '../src/index.ts';

const [organization, packageName, file] = process.argv.slice(2);
if (!organization || !packageName || !file) {
  console.error('usage: github-actions-upload.ts <organization> <vendor/package> <file.zip>');
  process.exit(2);
}

const client = new PrivatePackagistClient();
client.authenticateWithTrustedPublishing(organization, packageName);

const artifact = await client.packages.artifacts.add(packageName, await readFile(file), 'application/zip', basename(file));
console.log(`Uploaded ${basename(file)} as artifact ${artifact.id} of ${packageName}`);
