# private-packagist-api

A TypeScript client for the [Private Packagist API](https://packagist.com/docs/api). It is a port of the official PHP client, [private-packagist/api-client](https://github.com/packagist/private-packagist-api-client), with the same resources, the same method names and the same request signatures.

- Requests are signed with `PACKAGIST-HMAC-SHA256`, byte for byte the way the PHP client signs them. The test suite checks this against 126 signatures and 169 full requests produced by the PHP client itself.
- Every endpoint of the PHP client is covered: teams, tokens, customers, vendor bundles, packages and artifacts, credentials, mirrored repositories, suborganizations, synchronizations, security issues, jobs and organization sync.
- Response types are generated from the published OpenAPI document, so `client.packages.show()` returns a `PackageWithVersions` and `client.customers.all()` a `Customer[]`.
- List endpoints follow `Link: rel="next"` across pages, and refuse links that point away from your Private Packagist host.
- Trusted publishing from GitHub Actions, without a stored API secret.
- Typed errors, timeouts, `AbortSignal` support, and retries for rate limits and server errors.
- No runtime dependencies. It uses `fetch` and Web Crypto, so it runs on Node.js 20+, Deno, Bun and Cloudflare Workers. ESM and CommonJS builds are included.

## Install

```bash
npm install github:SanderSaxBuilds/private-packagist-ts
```

The package name is `private-packagist-api`. Installing from GitHub builds it on the spot, which needs nothing beyond npm.

## Quick start

Create an API key in Private Packagist under Settings, API Access. Keep the secret on the server side, the client signs every request with it.

```ts
import { PrivatePackagistClient } from 'private-packagist-api';

const client = new PrivatePackagistClient({
  key: process.env.PACKAGIST_API_KEY,
  secret: process.env.PACKAGIST_API_SECRET,
});

for (const pkg of await client.packages.all({ origin: 'private' })) {
  console.log(pkg.name, pkg.origin);
}

const job = await client.packages.createVcsPackage('https://github.com/acme/website');
const done = await client.jobs.waitForJob(job.id);
console.log(done.status); // "success"
```

CommonJS works the same way:

```js
const { PrivatePackagistClient } = require('private-packagist-api');
```

The client takes these options:

```ts
const client = new PrivatePackagistClient({
  key: '...',
  secret: '...',
  baseUrl: 'https://packagist.com',  // a self-hosted install passes its own URL
  timeoutMs: 30_000,                 // per attempt, 0 turns it off
  retry: { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 30_000 },  // or false
  headers: { 'X-Team': 'platform' },
  userAgent: 'deploy-bot/1.0',
  fetch: globalThis.fetch,           // bring your own fetch, for a proxy or a test
});
```

`client.authenticate(key, secret)` switches keys later, as in PHP.

### Coming from the PHP client

Sub-resources are properties instead of methods, everything else reads the same.

| PHP | TypeScript |
| --- | --- |
| `$client->packages()->all()` | `await client.packages.all()` |
| `$client->customers()->vendorBundles()->listVendorBundles(42)` | `await client.customers.vendorBundles.listVendorBundles(42)` |
| `$client->packages()->artifacts()->create($zip, 'application/zip', 'a.zip')` | `await client.packages.artifacts.create(zip, 'application/zip', 'a.zip')` |
| `TeamPermissions::fromFlags(3)` | `TeamPermissions.fromFlags(3)` |
| `(new JobHelper($client))->waitForJob($id, 180, 5)` | `await new JobHelper(client).waitForJob(id, 180, 5)` |
| `new WebhookSignature($secret)` | `new WebhookSignature(secret)` |

Optional arguments keep their PHP order and defaults. Every method also takes per-call options as its last argument:

```ts
await client.packages.show('acme/website', { signal: AbortSignal.timeout(5_000) });
await client.customers.all({ headers: { 'X-Request-Id': requestId } });
```

## Resources

Names and ids that go into a URL are encoded, so `acme/website` is sent as `acme%2Fwebsite`, and `''`, `.` and `..` are refused before anything is sent.

### Organization and synchronizations

```ts
await client.organization.sync();          // Job[]
await client.organization.sshAccessKey();  // { key }
await client.organization.accessReport();  // CSV text
await client.synchronizations.all();
```

`sshAccessKey` and `accessReport` are in the OpenAPI document but not in the PHP client.

### Teams

```ts
import { TeamPermissions } from 'private-packagist-api';

await client.teams.all();
await client.teams.create('Developers', TeamPermissions.fromFlags(
  TeamPermissions.PERMISSION_CAN_EDIT_TEAM_PACKAGES | TeamPermissions.PERMISSION_CAN_ADD_PACKAGES,
));
await client.teams.edit(1, 'Owners', { canAddPackages: true, canManageVendorCustomers: true });
await client.teams.show(1);
await client.teams.remove(1);

await client.teams.grantAccessToAllPackages(1);
await client.teams.revokeAccessToAllPackages(1);
await client.teams.addMember(1, 12);
await client.teams.removeMember(1, 12);

await client.teams.packages(1);
await client.teams.addPackages(1, ['acme/website', 'acme/api']);
await client.teams.removePackage(1, 'acme/website');
```

Permissions can be a `TeamPermissions` object, a flag mask or a plain object. `TeamPermissions.fromTeamResponse(team)` reads them back from a team.

### Authentication tokens

```ts
await client.tokens.all();
await client.tokens.create({ description: 'CI', access: 'read', accessToAllPackages: true });
await client.tokens.create({ description: 'Team', access: 'update', teamId: 1, expiresAt: '2027-01-01T00:00:00+00:00' });
await client.tokens.regenerate(33, { IConfirmOldTokenWillStopWorkingImmediately: true });
await client.tokens.remove(33);
```

### Customers

```ts
await client.customers.all();
await client.customers.show(42);  // id or URL name
await client.customers.create('Acme Corp', false, 'acme-corp', 'stable', false);
await client.customers.edit(42, { name: 'Acme Corporation', minimumAccessibleStability: 'beta' });
await client.customers.enable(42);
await client.customers.disable(42);
await client.customers.remove(42);

await client.customers.listPackages(42);
await client.customers.showPackage(42, 'acme/website');
await client.customers.addOrEditPackages(42, [
  { name: 'acme/website', versionConstraint: '^1.0 | ^2.0', expirationDate: '2027-11-13T00:00:00+00:00' },
]);
await client.customers.removePackage(42, 'acme/website');
await client.customers.regenerateToken(42, { IConfirmOldTokenWillStopWorkingImmediately: true });

await client.customers.vendorBundles.listVendorBundles(42);
await client.customers.vendorBundles.addOrEditVendorBundle(42, 7, '2027-11-13T00:00:00+00:00');
await client.customers.vendorBundles.removeVendorBundle(42, 7);

await client.customers.magentoLegacyKeys.all(42);
await client.customers.magentoLegacyKeys.create(42, 'public-key', 'private-key');
await client.customers.magentoLegacyKeys.remove(42, 'public-key');
```

### Vendor bundles

```ts
await client.vendorBundles.all();
await client.vendorBundles.show(7);
await client.vendorBundles.create('Enterprise', 'stable', '^2.0', false, [123]);
await client.vendorBundles.edit(7, { name: 'Enterprise plus', assignAllPackages: true });
await client.vendorBundles.remove(7);

await client.vendorBundles.packages.listPackages(7);
await client.vendorBundles.packages.addOrEditPackages(7, [{ name: 'acme/website', versionConstraint: '^2.0' }]);
await client.vendorBundles.packages.removePackage(7, 'acme/website');
```

### Packages

```ts
await client.packages.all();
await client.packages.all({ origin: 'private', 'security-issue-state': 'open' });
await client.packages.show('acme/website');

await client.packages.createVcsPackage('https://github.com/acme/website');
await client.packages.createVcsPackage('https://gitlab.com/acme/api.git', 7, 'git', 'read');
await client.packages.createCustomPackage({ name: 'acme/custom', version: '1.0.0', dist: { url: 'https://example.com/custom.zip', type: 'zip' } });
await client.packages.editVcsPackage('acme/website', 'https://github.com/acme/website-v2');
await client.packages.editCustomPackage('acme/custom', '{"name":"acme/custom","version":"1.0.1"}');
await client.packages.remove('acme/website');

await client.packages.listCustomers('acme/website');
await client.packages.listDependents('acme/website');
await client.packages.listSecurityIssues('acme/website', { 'security-issue-state': 'open' });
await client.packages.showSecurityMonitoringConfig('acme/website');
await client.packages.editSecurityMonitoringConfig('acme/website', { monitorAllBranches: false, monitoredBranches: ['dev-main'] });
```

Creating and editing packages returns the job that imports them. `client.jobs.waitForJob(job.id)` waits for it.

### Artifacts

```ts
import { readFile } from 'node:fs/promises';

const zip = await readFile('build/acme-website-1.2.0.zip');
const artifact = await client.packages.artifacts.create(zip, 'application/zip', 'acme-website-1.2.0.zip');
await client.packages.createArtifactPackage([artifact.id]);

await client.packages.artifacts.add('acme/website', zip, 'application/zip', 'acme-website-1.2.1.zip');
await client.packages.editArtifactPackage('acme/website', [41, 42]);
await client.packages.artifacts.show(41);
await client.packages.artifacts.showPackageArtifacts('acme/website');
```

The file can be a `Uint8Array`, a Node.js `Buffer`, an `ArrayBuffer`, a `Blob` or a string. It is sent and signed byte for byte.

### Credentials

```ts
import { Credentials } from 'private-packagist-api';

await client.credentials.all();
await client.credentials.show(42);
await client.credentials.create('ACME http auth', Credentials.TYPE_HTTP_BASIC, 'acme.example', 'user', 'password');
await client.credentials.edit(42, Credentials.TYPE_HTTP_BASIC, 'user', 'new password');
await client.credentials.remove(42);
```

### Mirrored repositories

```ts
await client.mirroredRepositories.all();
await client.mirroredRepositories.create('Packagist', 'https://repo.packagist.org', 'add_on_use');
await client.mirroredRepositories.show(42);
await client.mirroredRepositories.edit(42, 'Packagist', 'https://repo.packagist.org', 'manual', 543);
await client.mirroredRepositories.remove(42);

await client.mirroredRepositories.listPackages(42);
await client.mirroredRepositories.addPackages(42, ['monolog/monolog', 'symfony/console']);
await client.mirroredRepositories.removePackages(42);
```

### Suborganizations

```ts
await client.suborganizations.all();
await client.suborganizations.create('Agency client');
await client.suborganizations.show('agency-client');
await client.suborganizations.remove('agency-client');

await client.suborganizations.listTeams('agency-client');
await client.suborganizations.addOrEditTeams('agency-client', [{ id: 12, permission: 'owner' }]);
await client.suborganizations.removeTeam('agency-client', 12);

await client.suborganizations.listTokens('agency-client');
await client.suborganizations.createToken('agency-client', { description: 'Deploy', access: 'read' });
await client.suborganizations.regenerateToken('agency-client', 33, { IConfirmOldTokenWillStopWorkingImmediately: true });
await client.suborganizations.removeToken('agency-client', 33);

await client.suborganizations.packages.all('agency-client', { origin: 'private' });
await client.suborganizations.packages.createVcsPackage('agency-client', 'https://github.com/acme/site');
await client.suborganizations.packages.artifacts.create('agency-client', zip, 'application/zip', 'site.zip');
await client.suborganizations.packages.createArtifactPackage('agency-client', [41]);

await client.suborganizations.mirroredRepositories.add('agency-client', [{ id: 12, mirroringBehavior: 'add_on_use' }]);
await client.suborganizations.mirroredRepositories.addPackages('agency-client', 12, ['acme/cool-lib']);
```

`client.subrepositories` and `client.projects` are still there for the older endpoints, marked deprecated, as in PHP.

### Security issues

```ts
import { SecurityIssues } from 'private-packagist-api';

await client.securityIssues.all({ 'security-issue-state': SecurityIssues.STATE_OPEN });
await client.securityIssues.show(42);
await client.securityIssues.open(42);
await client.securityIssues.close(42, SecurityIssues.STATE_NOT_AFFECTED);
```

### Jobs

```ts
await client.jobs.show('46bf13150a86fece079ca979cb8ef57c78773faa');
await client.jobs.waitForJob(job.id, { maxWaitSeconds: 300, waitInterval: 5, signal });
```

`waitForJob` returns the job when it succeeds, throws `JobFailedError` (with `.job`) when it ends in error and `JobTimeoutError` when time runs out.

## Pagination

List methods fetch every page and return one array, asking for 500 items per page unless you pass `limit`. To stop early or keep memory flat, iterate instead:

```ts
for await (const pkg of client.packages.iterate({ origin: 'private' })) {
  if (pkg.name === 'acme/website') break;  // later pages are never fetched
}

for await (const customer of client.paginate('/customers/')) {
  console.log(customer);
}
```

A `Link` header that points to another host, scheme or port is refused with `OriginMismatchError` before the next request is signed, the same check the PHP client makes.

## Errors

Every error extends `PrivatePackagistError`.

| Error | When |
| --- | --- |
| `BadRequestError` | 400, for example a bad parameter or `Invalid signature` |
| `AuthenticationError` | 401 |
| `PermissionDeniedError` | 403 |
| `ResourceNotFoundError` | 404 |
| `ConflictError` | 409 |
| `PayloadTooLargeError` | 413 |
| `RateLimitError` | 429 after retries, with `retryAfterMs` |
| `ServerError` | 5xx after retries |
| `HttpError` | any other status from 400 to 600, and the parent of the classes above (`HttpTransportError` is the same class) |
| `TimeoutError` | an attempt took longer than `timeoutMs` |
| `AbortError` | your `AbortSignal` fired, `cause` is its reason |
| `ConnectionError` | the request could not be sent, `cause` is the fetch error |
| `OriginMismatchError` | a pagination link or redirect pointed off your Private Packagist host |
| `InvalidArgumentError` | an argument the PHP client would also refuse, caught before sending |
| `JobFailedError`, `JobTimeoutError` | from `jobs.waitForJob` |
| `TrustedPublishingError` | the OIDC token or the exchange failed |

HTTP errors carry `status`, `message` (the API's own message), `body`, `headers`, `method` and `requestUri`.

```ts
import { ResourceNotFoundError } from 'private-packagist-api';

try {
  await client.packages.show('acme/gone');
} catch (error) {
  if (error instanceof ResourceNotFoundError) return null;
  throw error;
}
```

## Retries and timeouts

`429` and `503` are retried for every method. `500`, `502`, `504` and network errors are retried only for `GET`, `PUT` and `DELETE`, because a `POST` that failed halfway may already have created something. The client waits for `Retry-After` when the server sends it and backs off exponentially when it does not. A retry gets a new timestamp, nonce and signature.

`timeoutMs` limits each attempt, reading the body included. Pass `signal` to cancel a call from outside.

## Trusted publishing

In GitHub Actions, the client can get short-lived credentials for one package from an OIDC token instead of a stored secret. Set up trusted publishing for the package in Private Packagist, give the workflow `id-token: write`, then:

```ts
const client = new PrivatePackagistClient();
client.authenticateWithTrustedPublishing('acme-org', 'acme/website');

await client.packages.artifacts.add('acme/website', zip, 'application/zip', 'acme-website-1.2.1.zip');
```

Before the first request the client fetches the audience for the organization, requests an OIDC token from GitHub, exchanges it for an API key and secret, and signs from then on with those. Calls made at the same moment share one exchange. For another CI system, pass your own token:

```ts
client.authenticateWithTrustedPublishing('acme-org', 'acme/website', {
  tokenProvider: async (audience) => getOidcTokenFromMyCi(audience),
});
```

[examples/github-actions-upload.ts](examples/github-actions-upload.ts) is a complete workflow step.

## Webhooks

Private Packagist signs webhook payloads with the webhook secret and sends the result in the `Packagist-Signature` header. Check it against the raw body, before parsing:

```ts
import { WebhookSignature } from 'private-packagist-api';

const webhooks = new WebhookSignature(process.env.PACKAGIST_WEBHOOK_SECRET!);

app.post('/packagist', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!(await webhooks.validate(req.get('Packagist-Signature'), req.body))) return res.sendStatus(401);
  const event = JSON.parse(req.body.toString('utf8'));
  res.sendStatus(204);
});
```

## Request signatures

The signer is exported for proxies, server-side checks or other HTTP clients:

```ts
import { RequestSigner, signRequest } from 'private-packagist-api';

const signer = new RequestSigner(key, secret);
const authorization = await signer.authorize({ method: 'GET', url: 'https://packagist.com/api/packages/?limit=500' });

// Fixed timestamp and nonce, for checking another implementation
const signed = await signRequest({ method: 'POST', url, body, key, secret, timestamp: 1763020800, nonce: 'c5e1...' });
console.log(signed.stringToSign);
```

The string to sign is the method, host and path on separate lines, followed by `body`, `cnonce`, `key`, `query`, `timestamp` and `version=2` in that order. The query is normalized as PHP's `parse_str` and `http_build_query` would, sorted keys and RFC 3986 encoding, with PHP's quirks for brackets, dots and spaces in names. An empty body and the body `"0"` are left out. `src/php.ts` holds the ports of those PHP functions.

## Low-level requests

```ts
const response = await client.request({ method: 'GET', path: '/packages/', query: { limit: 10 } });
response.status;   // 200
response.headers;  // Headers
response.data;     // decoded JSON, or text
```

`client.get`, `getCollection`, `paginate`, `post`, `put`, `delete` and `postFile` are the helpers the resource classes use. Paths without `/api` get it added, as the PHP client does.

## Examples

[examples/](examples) has three small scripts: uploading an artifact from GitHub Actions, giving a customer access to a package, and a webhook receiver on `node:http`. They import from `../src` so they run straight from a checkout with `node --experimental-strip-types`.

## Development

```bash
npm install
npm test          # tsc --strict, the ESM and CommonJS builds, then node --test
```

The tests run against fixtures, with no network and no Private Packagist account. Most of them come from the official PHP client:

- `scripts/php-vectors.php` drives the PHP client through a mock HTTP client and records every request it sends, with a fixed timestamp and nonce. `test/requests.test.ts` replays all 169 recorded calls through this client and compares method, URL, headers, body bytes and the full `Authorization` header.
- `test/fixtures/php-signatures.json` holds 126 signatures from the PHP `RequestSignature` plugin, across GET, POST, PUT and DELETE, binary bodies, unicode, and query strings with nested arrays, repeated keys and odd encodings.
- `php-queries.json` and `php-primitives.json` cover PHP `parse_str`, `http_build_query`, `json_encode`, `rawurlencode`, `RequestPath::build`, webhook signatures and team permission flags.

To regenerate the vectors you need PHP 8.1+ and a checkout of the PHP client with its Composer dependencies:

```bash
git clone https://github.com/packagist/private-packagist-api-client ../private-packagist-api-client
(cd ../private-packagist-api-client && composer install)
php scripts/php-vectors.php ../private-packagist-api-client test/fixtures
```

`npm run types` regenerates `src/schema.ts` from `openapi.json` (download it from https://packagist.com/openapi.json first).

## License

MIT
