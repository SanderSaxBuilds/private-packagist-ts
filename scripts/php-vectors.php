<?php

/*
 * Generates the test vectors in test/fixtures/ by running the official PHP client
 * (packagist/private-packagist-api-client) with its own RequestSignature plugin.
 *
 * Usage:
 *   git clone https://github.com/packagist/private-packagist-api-client
 *   cd private-packagist-api-client && composer install
 *   php scripts/php-vectors.php /path/to/private-packagist-api-client test/fixtures
 *
 * Nothing here talks to the network: every request goes into php-http/mock-client.
 */

if ($argc < 3) {
    fwrite(STDERR, "usage: php php-vectors.php <php-client-checkout> <output-dir>\n");
    exit(1);
}

$checkout = rtrim($argv[1], '/\\');
$outDir = rtrim($argv[2], '/\\');
require $checkout . '/vendor/autoload.php';

use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
use Http\Mock\Client as MockClient;
use PrivatePackagist\ApiClient\Client;
use PrivatePackagist\ApiClient\HttpClient\HttpPluginClientBuilder;
use PrivatePackagist\ApiClient\HttpClient\Plugin\RequestSignature;
use PrivatePackagist\ApiClient\HttpClient\Plugin\RequestSignatureMock;
use PrivatePackagist\ApiClient\HttpClient\RequestPath;
use PrivatePackagist\ApiClient\JobHelper;
use PrivatePackagist\ApiClient\TeamPermissions;
use PrivatePackagist\ApiClient\WebhookSignature;

final class VectorClient extends Client
{
    public function useFixedSignature(string $key, string $secret, int $timestamp, string $nonce): void
    {
        $plugin = new RequestSignatureMock($key, $secret);
        $plugin->init($timestamp, $nonce);
        $this->getHttpClientBuilder()->removePlugin(RequestSignature::class);
        $this->getHttpClientBuilder()->addPlugin($plugin);
    }
}

function encodeBody(string $body): array
{
    if ($body === '' || preg_match('//u', $body) === 1 && !preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $body)) {
        return ['body' => $body];
    }

    return ['body' => base64_encode($body), 'bodyEncoding' => 'base64'];
}

function callPrivate(object $object, string $method, ...$args)
{
    $reflection = new ReflectionMethod($object, $method);
    $reflection->setAccessible(true);

    return $reflection->invoke($object, ...$args);
}

function writeJson(string $path, $data): void
{
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    file_put_contents($path, $json . "\n");
    fwrite(STDERR, sprintf("wrote %s (%d entries)\n", $path, count($data['vectors'] ?? $data)));
}

$meta = [
    'generator' => 'scripts/php-vectors.php',
    'phpVersion' => PHP_VERSION,
    'phpClientVersion' => \Composer\InstalledVersions::getRootPackage()['reference'] ?? 'unknown',
];

// ---------------------------------------------------------------------------
// 1. Raw request signatures, produced by the PHP client's RequestSignature plugin
// ---------------------------------------------------------------------------

$identities = [
    ['key' => 'token', 'secret' => 'secret', 'timestamp' => 1518721253, 'nonce' => '78b9869e96cf58b5902154e0228f8576f042e5ac'],
    ['key' => 'packagist_ack_ffce048835c6cdea47bcc4b73c79', 'secret' => 'packagist_acs_0b6c3f0a4e2d8c41b7a95e13d06f7a2c9b1e5d44', 'timestamp' => 1522925488, 'nonce' => 'b1946ac92492d2347c6235b4d2611184aa0e3c5f'],
    ['key' => 'k', 'secret' => "s\u{00e9}cr\u{00e8}t with spaces & symbols=%+/", 'timestamp' => 2000000000, 'nonce' => '0000000000000000000000000000000000000000'],
];

$binary = '';
for ($i = 0; $i < 256; $i++) {
    $binary .= chr($i);
}

$requests = [
    ['GET', 'https://packagist.com/api/packages/', ''],
    ['GET', 'https://packagist.com/api/packages/?limit=500', ''],
    ['GET', 'https://packagist.com/api/packages/?page=2&limit=500', ''],
    ['GET', 'https://packagist.com/api/packages/?limit=500&page=2', ''],
    ['GET', 'https://packagist.com/api/packages/?limit=500&origin=private&security-issue-state=open', ''],
    ['GET', 'https://localhost/api/packages/?limit=1&page=2', ''],
    ['GET', '/packages/?foo=bar', ''],
    ['POST', '/packages/?foo=bar', '{"foo":"bar"}'],
    ['GET', 'https://packagist.com/api/packages/?', ''],
    ['GET', 'https://packagist.com/api/packages/?foo', ''],
    ['GET', 'https://packagist.com/api/packages/?foo=', ''],
    ['GET', 'https://packagist.com/api/packages/?foo=hello+world', ''],
    ['GET', 'https://packagist.com/api/packages/?foo=hello%20world', ''],
    ['GET', 'https://packagist.com/api/packages/?q=%E2%9C%93&name=caf%C3%A9', ''],
    ['GET', 'https://packagist.com/api/packages/?key=evil&version=1&timestamp=5&cnonce=x&body=y&query=z', ''],
    ['GET', 'https://packagist.com/api/packages/?Z=1&a=2&_=3&-=4&0=5&B=6', ''],
    ['GET', 'https://packagist.com/api/packages/?a[]=1&a[]=2', ''],
    ['GET', 'https://packagist.com/api/packages/?a%5B%5D=1&a%5B%5D=2', ''],
    ['GET', 'https://packagist.com/api/packages/?a[y]=1&a[x]=2', ''],
    ['GET', 'https://packagist.com/api/packages/?a.b=1&c+d=2&e%20f=3', ''],
    ['GET', 'https://packagist.com/api/packages/?a=1&a=2', ''],
    ['GET', 'https://packagist.com/api/packages/?redirect=https%3A%2F%2Fexample.com%2F%3Fx%3D1%26y%3D2', ''],
    ['GET', "https://packagist.com/api/packages/?q=!*'()~", ''],
    ['GET', 'https://packagist.com/api/packages/acme%2Fpackage/', ''],
    ['GET', 'https://packagist.com/api/customers/42/packages/acme%2Fwebsite/', ''],
    ['GET', 'https://PACKAGIST.example.COM:8443/api/packages/', ''],
    ['GET', 'http://127.0.0.1:8080/api/packages/', ''],
    ['GET', 'https://packagist.com/api/jobs/46bf13150a86fece079ca979cb8ef57c78773faa', ''],
    ['POST', 'https://packagist.com/api/customers/', '{"name":"Acme","accessToVersionControlSource":false,"minimumAccessibleStability":null,"assignAllPackages":false}'],
    ['POST', 'https://packagist.com/api/packages/', '{"repoType":"vcs","repoUrl":"https:\/\/github.com\/acme\/website","credentials":null}'],
    ['POST', 'https://packagist.com/api/organization/sync', ''],
    ['PUT', 'https://packagist.com/api/customers/42/', '{"name":"Caf\u00e9 \u2713","urlName":"cafe"}'],
    ['PUT', 'https://packagist.com/api/customers/42/enable', ''],
    ['DELETE', 'https://packagist.com/api/customers/42/', ''],
    ['DELETE', 'https://packagist.com/api/teams/1/packages/acme%2Fpackage/', ''],
    ['POST', 'https://packagist.com/api/packages/?x=1', '0'],
    ['POST', 'https://packagist.com/api/packages/', '00'],
    ['POST', 'https://packagist.com/api/packages/', ' '],
    ['POST', 'https://packagist.com/api/packages/', "line one\nline two\ttab & equals=plus+percent%"],
    ['POST', 'https://packagist.com/api/packages/', "raw utf-8 caf\u{00e9} \u{2713} \u{1F600}"],
    ['POST', 'https://packagist.com/api/packages/artifacts/', $binary],
    ['POST', 'https://packagist.com/api/packages/artifacts/', str_repeat('{"k":"value"}', 400)],
];

$signatures = [];
foreach ($identities as $identity) {
    foreach ($requests as [$method, $url, $body]) {
        $plugin = new RequestSignatureMock($identity['key'], $identity['secret']);
        $plugin->init($identity['timestamp'], $identity['nonce']);
        $request = new Request($method, $url, [], $body === '' ? null : $body);
        $signed = $plugin->handleRequest($request, function ($request) {
            return new \Http\Promise\FulfilledPromise($request);
        }, function () {
        })->wait(true);
        $uri = $signed->getUri();
        $signatures[] = array_merge([
            'key' => $identity['key'],
            'secret' => $identity['secret'],
            'timestamp' => $identity['timestamp'],
            'nonce' => $identity['nonce'],
            'method' => $method,
            'url' => $url,
            'host' => $uri->getHost(),
            'path' => $uri->getPath(),
            'query' => $uri->getQuery(),
            'canonicalQuery' => callPrivate($plugin, 'normalizeQueryString', $uri->getQuery()),
        ], encodeBody($body), [
            'authorization' => $signed->getHeaderLine('Authorization'),
        ]);
    }
}
writeJson($outDir . '/php-signatures.json', ['meta' => $meta, 'vectors' => $signatures]);

// ---------------------------------------------------------------------------
// 2. Query canonicalisation (parse_str, uksort strcmp, http_build_query RFC 3986)
// ---------------------------------------------------------------------------

$queries = [
    '', 'a=1', 'b=2&a=1', 'a', 'a=', 'a=&b', '&&a=1&&', '=1', '=', 'a=1&=2',
    'a+b=1', 'a%20b=1', 'a.b=1', 'a..b=1', ' a=1', '  a=1', 'a =1', '.a=1', 'a%2Eb=1',
    'a=hello+world', 'a=hello%20world', 'a=%2B', 'a=+', 'a=%7E', 'a=~', 'a=%41', "a=!*'()", 'a=%21%2A%27%28%29',
    'a=%E2%9C%93', 'a=%C3%A9', 'a=%F0%9F%98%80', 'a=%ZZ', 'a=%2', 'a=%', 'a=100%', 'a=%e2%9c%93', 'a=%3d%3D',
    'a=1&a=2', 'a=1&A=2', 'B=1&a=2&A=3&b=4', '_=1&-=2&.=3&~=4', '0=a&1=b&10=c&9=d', '01=a&1=b', '-1=a&1=b',
    'a[]=1', 'a[]=1&a[]=2&a[]=3', 'a[x]=1&a[y]=2', 'a[y]=1&a[x]=2', 'a[x][y]=1', 'a[x][]=1&a[x][]=2',
    'a[5]=x&a[]=y', 'a[01]=x&a[1]=y', 'a[-1]=x&a[]=y', 'a[]=1&a=2', 'a=1&a[]=2', 'a[x]=1&a[x]=2',
    'a[=1', 'a]=1', 'a[b=1', 'a[b]c=1', 'a[b]]=1', 'a[[b]=1', 'a[b][c=1', 'a[ b ]=1', 'a[b.c]=1', 'a.b[c.d]=1',
    'a%5B%5D=1&a%5B%5D=2', 'a%5Bx%5D=1', '[a]=1', '[]=1', 'a[]', 'a[x]',
    'key=evil&version=1', 'limit=500&page=2&origin=private', 'security-issue-state=open&limit=500',
    'redirect=https%3A%2F%2Fexample.com%2F%3Fx%3D1%26y%3D2', 'q=a%26b%3Dc', 'q=%00', 'q=%0A%0D%09',
    'a=1;b=2', 'a=1#frag', 'a[b][c][d][e]=deep', 'x[]=1&y=2&x[]=3', 'a=%2520',
];
$plugin = new RequestSignatureMock('token', 'secret');
$queryVectors = [];
foreach ($queries as $query) {
    $queryVectors[] = ['query' => $query, 'canonical' => callPrivate($plugin, 'normalizeQueryString', $query)];
}
writeJson($outDir . '/php-queries.json', ['meta' => $meta, 'vectors' => $queryVectors]);

// ---------------------------------------------------------------------------
// 3. Primitives: http_build_query, json_encode, rawurlencode, RequestPath::build
// ---------------------------------------------------------------------------

$buildQueryInputs = [
    ['limit' => 500],
    ['limit' => 500, 'origin' => 'private'],
    ['origin' => 'private', 'security-issue-state' => 'open', 'limit' => 10],
    ['q' => 'hello world', 'tilde' => '~', 'star' => '*', 'plus' => '+'],
    ['bool-true' => true, 'bool-false' => false, 'null' => null, 'zero' => 0, 'empty' => ''],
    ['list' => ['a', 'b'], 'map' => ['x' => 1, 'y' => ['z' => 2]]],
    ['unicode' => "caf\u{00e9} \u{2713}", 'emoji' => "\u{1F600}"],
    ['reserved' => "!#\$&'()*+,/:;=?@[]"],
    ['nested-empty' => [], 'after' => 'x'],
];
$primitives = ['httpBuildQuery' => [], 'jsonEncode' => [], 'rawurlencode' => [], 'requestPath' => []];
foreach ($buildQueryInputs as $input) {
    $primitives['httpBuildQuery'][] = [
        'input' => $input,
        'rfc1738' => http_build_query($input),
        'rfc3986' => http_build_query($input, '', '&', PHP_QUERY_RFC3986),
    ];
}

$jsonInputs = [
    ['name' => 'Acme'],
    ['url' => 'https://github.com/acme/website', 'path' => '/a/b/'],
    ['unicode' => "caf\u{00e9} \u{2713} \u{4e2d}\u{6587}", 'emoji' => "\u{1F600}"],
    ['quote' => 'say "hi"', 'backslash' => 'C:\\path', 'control' => "a\nb\tc\rd\x08e\x0cf\x01"],
    ['null' => null, 'true' => true, 'false' => false, 'int' => 42, 'negative' => -7, 'float' => 1.5],
    ['list' => [1, 2, 3], 'emptyList' => [], 'nested' => ['a' => ['b' => ['c' => 'd']]]],
    [['name' => 'acme/package', 'versionConstraint' => '^1.0 | ^2.0', 'expirationDate' => '2027-01-01T00:00:00+00:00']],
    ['html' => '<script>&amp;\'</script>'],
    ['separators' => "\u{2028}\u{2029}"],
    ['repoConfig' => json_encode(['type' => 'package', 'package' => ['name' => 'acme/x', 'version' => '1.0.0', 'dist' => ['url' => 'https://example.com/x.zip', 'type' => 'zip']]])],
];
foreach ($jsonInputs as $input) {
    $primitives['jsonEncode'][] = ['input' => $input, 'output' => json_encode($input)];
}

foreach (['acme/package', 'a b', 'a+b', '~user', "!*'()", '#', '?limit=1', '..x', '100%', "caf\u{00e9}", "\u{1F600}", 'A-Z_a.z~0', '42', '%2F'] as $value) {
    $primitives['rawurlencode'][] = ['input' => $value, 'output' => rawurlencode($value)];
}

$pathCases = [
    ['/customers/%s/', ['acme']],
    ['/customers/%s/packages/%s/', [42, 'acme/website']],
    ['/packages/%s/', ['?limit=1']],
    ['/packages/%s/', ['#']],
    ['/packages/%s/', ['a/../b']],
    ['/vendor-bundles/%s/packages/%s/', [7, 'vendor/name with space']],
    ['/packages/%s/', ['']],
    ['/packages/%s/', ['.']],
    ['/packages/%s/', ['..']],
];
foreach ($pathCases as [$template, $args]) {
    try {
        $primitives['requestPath'][] = ['template' => $template, 'args' => $args, 'output' => RequestPath::build($template, ...$args)];
    } catch (\Throwable $e) {
        $primitives['requestPath'][] = ['template' => $template, 'args' => $args, 'error' => $e->getMessage()];
    }
}

$webhooks = [];
foreach ([['test', 'payload'], ['webhook-secret', '{"type":"package.updated","package":{"name":"acme\/package"}}'], ['s', ''], ["s\u{00e9}cret", "caf\u{00e9}"]] as [$secret, $payload]) {
    $webhooks[] = ['secret' => $secret, 'payload' => $payload, 'signature' => 'sha1=' . hash_hmac('sha1', $payload, $secret), 'valid' => (new WebhookSignature($secret))->validate('sha1=' . hash_hmac('sha1', $payload, $secret), $payload)];
}
$primitives['webhooks'] = $webhooks;
$primitives['teamPermissions'] = [];
foreach ([0, 1, 2, 3, 4, 8, 16, 31, 6, 24] as $flags) {
    $permissions = TeamPermissions::fromFlags($flags);
    $primitives['teamPermissions'][] = ['flags' => $flags, 'permissions' => [
        'canEditTeamPackages' => $permissions->canEditTeamPackages,
        'canAddPackages' => $permissions->canAddPackages,
        'canCreateSuborganizations' => $permissions->canCreateSuborganizations,
        'canViewVendorCustomers' => $permissions->canViewVendorCustomers,
        'canManageVendorCustomers' => $permissions->canManageVendorCustomers,
    ]];
}
writeJson($outDir . '/php-primitives.json', ['meta' => $meta] + $primitives);

// ---------------------------------------------------------------------------
// 4. Every API method of the PHP client, end to end through its plugin chain
// ---------------------------------------------------------------------------

const KEY = 'packagist_ack_ffce048835c6cdea47bcc4b73c79';
const SECRET = 'packagist_acs_0b6c3f0a4e2d8c41b7a95e13d06f7a2c9b1e5d44';
const TIMESTAMP = 1763020800;
const NONCE = 'c5e1a5b2f0d94e7a8b3c6d1e2f4a5b6c7d8e9f01';

function jsonResponse($data, array $headers = []): Response
{
    return new Response(200, array_merge(['Content-Type' => 'application/json'], $headers), json_encode($data));
}

function record(string $name, array $args, callable $call, array $responses = [], string $baseUrl = 'https://packagist.com'): array
{
    $mock = new MockClient();
    $mock->setDefaultResponse(jsonResponse([]));
    foreach ($responses as $response) {
        $mock->addResponse($response);
    }
    $client = new VectorClient(new HttpPluginClientBuilder($mock), $baseUrl);
    $client->useFixedSignature(KEY, SECRET, TIMESTAMP, NONCE);
    $result = $call($client);
    $recorded = [];
    foreach ($mock->getRequests() as $request) {
        $headers = [];
        foreach (['Accept', 'Content-Type', 'X-FILENAME'] as $header) {
            if ($request->hasHeader($header)) {
                $headers[$header] = $request->getHeaderLine($header);
            }
        }
        $recorded[] = array_merge([
            'method' => $request->getMethod(),
            'url' => (string) $request->getUri(),
            'headers' => $headers,
        ], encodeBody((string) $request->getBody()), [
            'authorization' => $request->getHeaderLine('Authorization'),
        ]);
    }

    return ['name' => $name, 'args' => $args, 'baseUrl' => $baseUrl, 'result' => $result, 'requests' => $recorded];
}

$page = function (array $items, ?string $next = null): Response {
    return jsonResponse($items, $next === null ? [] : ['Link' => sprintf('<%s>; rel="next", <https://packagist.com/api/x?page=1>; rel="first"', $next)]);
};

$customJson = '{"name":"acme/custom","version":"1.0.0","dist":{"url":"https://example.com/custom.zip","type":"zip"}}';
$zip = "PK\x03\x04" . $binary;

$calls = [
    ['organization.sync', [], fn ($c) => $c->organization()->sync()],

    ['teams.all', [], fn ($c) => $c->teams()->all()],
    ['teams.create', ['Developers', 3], fn ($c) => $c->teams()->create('Developers', TeamPermissions::fromFlags(3))],
    ['teams.create', ['Vendors', 28], fn ($c) => $c->teams()->create('Vendors', TeamPermissions::fromFlags(28))],
    ['teams.show', [1], fn ($c) => $c->teams()->show(1)],
    ['teams.edit', [1, 'Owners', 31], fn ($c) => $c->teams()->edit(1, 'Owners', TeamPermissions::fromFlags(31))],
    ['teams.grantAccessToAllPackages', [1], fn ($c) => $c->teams()->grantAccessToAllPackages(1)],
    ['teams.revokeAccessToAllPackages', [1], fn ($c) => $c->teams()->revokeAccessToAllPackages(1)],
    ['teams.remove', [1], fn ($c) => $c->teams()->remove(1)],
    ['teams.addMember', [1, 12], fn ($c) => $c->teams()->addMember(1, 12)],
    ['teams.removeMember', [1, 12], fn ($c) => $c->teams()->removeMember(1, 12)],
    ['teams.packages', [1], fn ($c) => $c->teams()->packages(1)],
    ['teams.addPackages', [1, ['acme-website/package', 2]], fn ($c) => $c->teams()->addPackages(1, ['acme-website/package', 2])],
    ['teams.removePackage', [1, 'acme-website/package'], fn ($c) => $c->teams()->removePackage(1, 'acme-website/package')],

    ['tokens.all', [], fn ($c) => $c->tokens()->all()],
    ['tokens.create', [['description' => 'CI token', 'access' => 'read', 'accessToAllPackages' => true]], fn ($c) => $c->tokens()->create(['description' => 'CI token', 'access' => 'read', 'accessToAllPackages' => true])],
    ['tokens.create', [['description' => 'Team token', 'access' => 'update', 'teamId' => 1, 'expiresAt' => '2027-01-01T00:00:00+00:00']], fn ($c) => $c->tokens()->create(['description' => 'Team token', 'access' => 'update', 'teamId' => 1, 'expiresAt' => '2027-01-01T00:00:00+00:00'])],
    ['tokens.remove', [33], fn ($c) => $c->tokens()->remove(33)],
    ['tokens.regenerate', [33, ['IConfirmOldTokenWillStopWorkingImmediately' => true]], fn ($c) => $c->tokens()->regenerate(33, ['IConfirmOldTokenWillStopWorkingImmediately' => true])],

    ['customers.all', [], fn ($c) => $c->customers()->all()],
    ['customers.show', [42], fn ($c) => $c->customers()->show(42)],
    ['customers.show', ['customer-url-name'], fn ($c) => $c->customers()->show('customer-url-name')],
    ['customers.create', ['New customer'], fn ($c) => $c->customers()->create('New customer')],
    ['customers.create', ['New customer', false, 'customer-url-name', 'beta', true], fn ($c) => $c->customers()->create('New customer', false, 'customer-url-name', 'beta', true)],
    ['customers.create', ["Caf\u{00e9} \u{2713}", true, null, 'stable', false], fn ($c) => $c->customers()->create("Caf\u{00e9} \u{2713}", true, null, 'stable', false)],
    ['customers.edit', [42, ['name' => 'Renamed', 'urlName' => 'customer', 'accessToVersionControlSource' => false, 'minimumAccessibleStability' => 'beta', 'assignAllPackages' => true]], fn ($c) => $c->customers()->edit(42, ['name' => 'Renamed', 'urlName' => 'customer', 'accessToVersionControlSource' => false, 'minimumAccessibleStability' => 'beta', 'assignAllPackages' => true])],
    ['customers.remove', [42], fn ($c) => $c->customers()->remove(42)],
    ['customers.enable', [42], fn ($c) => $c->customers()->enable(42)],
    ['customers.disable', [42], fn ($c) => $c->customers()->disable(42)],
    ['customers.listPackages', [42], fn ($c) => $c->customers()->listPackages(42)],
    ['customers.showPackage', [42, 'acme-website/package'], fn ($c) => $c->customers()->showPackage(42, 'acme-website/package')],
    ['customers.addOrEditPackages', [42, [['name' => 'acme-website/package', 'versionConstraint' => '^1.0 | ^2.0', 'expirationDate' => '2027-11-13T00:00:00+00:00', 'minimumAccessibleStability' => 'beta']]], fn ($c) => $c->customers()->addOrEditPackages(42, [['name' => 'acme-website/package', 'versionConstraint' => '^1.0 | ^2.0', 'expirationDate' => '2027-11-13T00:00:00+00:00', 'minimumAccessibleStability' => 'beta']])],
    ['customers.removePackage', [42, 'acme-website/package'], fn ($c) => $c->customers()->removePackage(42, 'acme-website/package')],
    ['customers.regenerateToken', [42, ['IConfirmOldTokenWillStopWorkingImmediately' => true]], fn ($c) => $c->customers()->regenerateToken(42, ['IConfirmOldTokenWillStopWorkingImmediately' => true])],
    ['customers.vendorBundles.listVendorBundles', [42], fn ($c) => $c->customers()->vendorBundles()->listVendorBundles(42)],
    ['customers.vendorBundles.addOrEditVendorBundle', [42, 12], fn ($c) => $c->customers()->vendorBundles()->addOrEditVendorBundle(42, 12)],
    ['customers.vendorBundles.addOrEditVendorBundle', [42, 12, '2027-11-13T00:00:00+00:00'], fn ($c) => $c->customers()->vendorBundles()->addOrEditVendorBundle(42, 12, '2027-11-13T00:00:00+00:00')],
    ['customers.vendorBundles.removeVendorBundle', [42, 12], fn ($c) => $c->customers()->vendorBundles()->removeVendorBundle(42, 12)],
    ['customers.magentoLegacyKeys.all', [42], fn ($c) => $c->customers()->magentoLegacyKeys()->all(42)],
    ['customers.magentoLegacyKeys.create', [42, 'public-key', 'private-key'], fn ($c) => $c->customers()->magentoLegacyKeys()->create(42, 'public-key', 'private-key')],
    ['customers.magentoLegacyKeys.remove', [42, 'public-key'], fn ($c) => $c->customers()->magentoLegacyKeys()->remove(42, 'public-key')],

    ['vendorBundles.all', [], fn ($c) => $c->vendorBundles()->all()],
    ['vendorBundles.show', [7], fn ($c) => $c->vendorBundles()->show(7)],
    ['vendorBundles.create', ['Bundle'], fn ($c) => $c->vendorBundles()->create('Bundle')],
    ['vendorBundles.create', ['Bundle', 'dev', '^1.0', true, [123]], fn ($c) => $c->vendorBundles()->create('Bundle', 'dev', '^1.0', true, [123])],
    ['vendorBundles.edit', [7, ['name' => 'Bundle name', 'minimumAccessibleStability' => 'dev', 'versionConstraint' => '^1.0', 'assignAllPackages' => true, 'synchronizationIds' => [123]]], fn ($c) => $c->vendorBundles()->edit(7, ['name' => 'Bundle name', 'minimumAccessibleStability' => 'dev', 'versionConstraint' => '^1.0', 'assignAllPackages' => true, 'synchronizationIds' => [123]])],
    ['vendorBundles.remove', [7], fn ($c) => $c->vendorBundles()->remove(7)],
    ['vendorBundles.packages.listPackages', [7], fn ($c) => $c->vendorBundles()->packages()->listPackages(7)],
    ['vendorBundles.packages.addOrEditPackages', [7, [['name' => 'acme-website/package', 'versionConstraint' => '^1.0 | ^2.0', 'minimumAccessibleStability' => 'beta']]], fn ($c) => $c->vendorBundles()->packages()->addOrEditPackages(7, [['name' => 'acme-website/package', 'versionConstraint' => '^1.0 | ^2.0', 'minimumAccessibleStability' => 'beta']])],
    ['vendorBundles.packages.removePackage', [7, 'acme-website/package'], fn ($c) => $c->vendorBundles()->packages()->removePackage(7, 'acme-website/package')],

    ['suborganizations.all', [], fn ($c) => $c->suborganizations()->all()],
    ['suborganizations.show', ['sub'], fn ($c) => $c->suborganizations()->show('sub')],
    ['suborganizations.create', ['New suborganization'], fn ($c) => $c->suborganizations()->create('New suborganization')],
    ['suborganizations.remove', ['sub'], fn ($c) => $c->suborganizations()->remove('sub')],
    ['suborganizations.listTeams', ['sub'], fn ($c) => $c->suborganizations()->listTeams('sub')],
    ['suborganizations.addOrEditTeams', ['sub', [['id' => 12, 'permission' => 'owner']]], fn ($c) => $c->suborganizations()->addOrEditTeams('sub', [['id' => 12, 'permission' => 'owner']])],
    ['suborganizations.removeTeam', ['sub', 12], fn ($c) => $c->suborganizations()->removeTeam('sub', 12)],
    ['suborganizations.listTokens', ['sub'], fn ($c) => $c->suborganizations()->listTokens('sub')],
    ['suborganizations.createToken', ['sub', ['description' => 'Suborganization Token', 'access' => 'read']], fn ($c) => $c->suborganizations()->createToken('sub', ['description' => 'Suborganization Token', 'access' => 'read'])],
    ['suborganizations.removeToken', ['sub', 33], fn ($c) => $c->suborganizations()->removeToken('sub', 33)],
    ['suborganizations.regenerateToken', ['sub', 33, ['IConfirmOldTokenWillStopWorkingImmediately' => true]], fn ($c) => $c->suborganizations()->regenerateToken('sub', 33, ['IConfirmOldTokenWillStopWorkingImmediately' => true])],
    ['suborganizations.packages.all', ['sub'], fn ($c) => $c->suborganizations()->packages()->all('sub')],
    ['suborganizations.packages.all', ['sub', ['origin' => 'private']], fn ($c) => $c->suborganizations()->packages()->all('sub', ['origin' => 'private'])],
    ['suborganizations.packages.show', ['sub', 'acme-website/package'], fn ($c) => $c->suborganizations()->packages()->show('sub', 'acme-website/package')],
    ['suborganizations.packages.createVcsPackage', ['sub', 'https://github.com/acme-website/package'], fn ($c) => $c->suborganizations()->packages()->createVcsPackage('sub', 'https://github.com/acme-website/package')],
    ['suborganizations.packages.createVcsPackage', ['sub', 'https://github.com/acme-website/package', 42, 'git', 'admin'], fn ($c) => $c->suborganizations()->packages()->createVcsPackage('sub', 'https://github.com/acme-website/package', 42, 'git', 'admin')],
    ['suborganizations.packages.createCustomPackage', ['sub', $customJson], fn ($c) => $c->suborganizations()->packages()->createCustomPackage('sub', $customJson)],
    ['suborganizations.packages.createCustomPackage', ['sub', $customJson, 42, 'read'], fn ($c) => $c->suborganizations()->packages()->createCustomPackage('sub', $customJson, 42, 'read')],
    ['suborganizations.packages.createArtifactPackage', ['sub', [41, 42]], fn ($c) => $c->suborganizations()->packages()->createArtifactPackage('sub', [41, 42])],
    ['suborganizations.packages.editVcsPackage', ['sub', 'acme-website/package', 'https://github.com/acme-website/package'], fn ($c) => $c->suborganizations()->packages()->editVcsPackage('sub', 'acme-website/package', 'https://github.com/acme-website/package')],
    ['suborganizations.packages.editCustomPackage', ['sub', 'acme-website/package', $customJson, 42], fn ($c) => $c->suborganizations()->packages()->editCustomPackage('sub', 'acme-website/package', $customJson, 42)],
    ['suborganizations.packages.editArtifactPackage', ['sub', 'acme-website/package', [42, 43]], fn ($c) => $c->suborganizations()->packages()->editArtifactPackage('sub', 'acme-website/package', [42, 43])],
    ['suborganizations.packages.remove', ['sub', 'acme-website/package'], fn ($c) => $c->suborganizations()->packages()->remove('sub', 'acme-website/package')],
    ['suborganizations.packages.listDependents', ['sub', 'acme-website/package'], fn ($c) => $c->suborganizations()->packages()->listDependents('sub', 'acme-website/package')],
    ['suborganizations.packages.artifacts.create', ['sub', 'zip', 'application/zip', 'package1.zip'], fn ($c) => $c->suborganizations()->packages()->artifacts()->create('sub', $zip, 'application/zip', 'package1.zip')],
    ['suborganizations.packages.artifacts.add', ['sub', 'acme/artifact', 'zip', 'application/zip', 'package1.zip'], fn ($c) => $c->suborganizations()->packages()->artifacts()->add('sub', 'acme/artifact', $zip, 'application/zip', 'package1.zip')],
    ['suborganizations.packages.artifacts.show', ['sub', 41], fn ($c) => $c->suborganizations()->packages()->artifacts()->show('sub', 41)],
    ['suborganizations.packages.artifacts.showPackageArtifacts', ['sub', 'acme/artifact'], fn ($c) => $c->suborganizations()->packages()->artifacts()->showPackageArtifacts('sub', 'acme/artifact')],
    ['suborganizations.mirroredRepositories.all', ['sub'], fn ($c) => $c->suborganizations()->mirroredRepositories()->all('sub')],
    ['suborganizations.mirroredRepositories.add', ['sub', [['id' => 12, 'mirroringBehavior' => 'add_on_use']]], fn ($c) => $c->suborganizations()->mirroredRepositories()->add('sub', [['id' => 12, 'mirroringBehavior' => 'add_on_use']])],
    ['suborganizations.mirroredRepositories.show', ['sub', 12], fn ($c) => $c->suborganizations()->mirroredRepositories()->show('sub', 12)],
    ['suborganizations.mirroredRepositories.edit', ['sub', 12, 'add_all'], fn ($c) => $c->suborganizations()->mirroredRepositories()->edit('sub', 12, 'add_all')],
    ['suborganizations.mirroredRepositories.remove', ['sub', 12], fn ($c) => $c->suborganizations()->mirroredRepositories()->remove('sub', 12)],
    ['suborganizations.mirroredRepositories.listPackages', ['sub', 12], fn ($c) => $c->suborganizations()->mirroredRepositories()->listPackages('sub', 12)],
    ['suborganizations.mirroredRepositories.addPackages', ['sub', 12, ['acme/cool-lib']], fn ($c) => $c->suborganizations()->mirroredRepositories()->addPackages('sub', 12, ['acme/cool-lib'])],
    ['suborganizations.mirroredRepositories.removePackages', ['sub', 12], fn ($c) => $c->suborganizations()->mirroredRepositories()->removePackages('sub', 12)],

    ['subrepositories.all', [], fn ($c) => $c->subrepositories()->all()],
    ['subrepositories.show', ['sub'], fn ($c) => $c->subrepositories()->show('sub')],
    ['subrepositories.create', ['New subrepository'], fn ($c) => $c->subrepositories()->create('New subrepository')],
    ['subrepositories.remove', ['sub'], fn ($c) => $c->subrepositories()->remove('sub')],
    ['subrepositories.listTeams', ['sub'], fn ($c) => $c->subrepositories()->listTeams('sub')],
    ['subrepositories.addOrEditTeams', ['sub', [['id' => 12, 'permission' => 'view']]], fn ($c) => $c->subrepositories()->addOrEditTeams('sub', [['id' => 12, 'permission' => 'view']])],
    ['subrepositories.removeTeam', ['sub', 12], fn ($c) => $c->subrepositories()->removeTeam('sub', 12)],
    ['subrepositories.listTokens', ['sub'], fn ($c) => $c->subrepositories()->listTokens('sub')],
    ['subrepositories.createToken', ['sub', ['description' => 'Token', 'access' => 'read']], fn ($c) => $c->subrepositories()->createToken('sub', ['description' => 'Token', 'access' => 'read'])],
    ['subrepositories.removeToken', ['sub', 33], fn ($c) => $c->subrepositories()->removeToken('sub', 33)],
    ['subrepositories.regenerateToken', ['sub', 33, ['IConfirmOldTokenWillStopWorkingImmediately' => true]], fn ($c) => $c->subrepositories()->regenerateToken('sub', 33, ['IConfirmOldTokenWillStopWorkingImmediately' => true])],
    ['subrepositories.packages.all', ['sub', ['origin' => 'public-mirror']], fn ($c) => $c->subrepositories()->packages()->all('sub', ['origin' => 'public-mirror'])],
    ['subrepositories.packages.show', ['sub', 'acme-website/package'], fn ($c) => $c->subrepositories()->packages()->show('sub', 'acme-website/package')],
    ['subrepositories.packages.createVcsPackage', ['sub', 'https://github.com/acme-website/package', null, 'vcs', null], fn ($c) => $c->subrepositories()->packages()->createVcsPackage('sub', 'https://github.com/acme-website/package')],
    ['subrepositories.packages.createCustomPackage', ['sub', $customJson], fn ($c) => $c->subrepositories()->packages()->createCustomPackage('sub', $customJson)],
    ['subrepositories.packages.editVcsPackage', ['sub', 'acme-website/package', 'https://github.com/acme-website/package', 42, 'git'], fn ($c) => $c->subrepositories()->packages()->editVcsPackage('sub', 'acme-website/package', 'https://github.com/acme-website/package', 42, 'git')],
    ['subrepositories.packages.editCustomPackage', ['sub', 'acme-website/package', $customJson], fn ($c) => $c->subrepositories()->packages()->editCustomPackage('sub', 'acme-website/package', $customJson)],
    ['subrepositories.packages.remove', ['sub', 'acme-website/package'], fn ($c) => $c->subrepositories()->packages()->remove('sub', 'acme-website/package')],
    ['subrepositories.packages.listDependents', ['sub', 'acme-website/package'], fn ($c) => $c->subrepositories()->packages()->listDependents('sub', 'acme-website/package')],
    ['subrepositories.mirroredRepositories.all', ['sub'], fn ($c) => $c->subrepositories()->mirroredRepositories()->all('sub')],
    ['subrepositories.mirroredRepositories.add', ['sub', [['id' => 12, 'mirroringBehavior' => 'add_on_use']]], fn ($c) => $c->subrepositories()->mirroredRepositories()->add('sub', [['id' => 12, 'mirroringBehavior' => 'add_on_use']])],
    ['subrepositories.mirroredRepositories.show', ['sub', 12], fn ($c) => $c->subrepositories()->mirroredRepositories()->show('sub', 12)],
    ['subrepositories.mirroredRepositories.edit', ['sub', 12, 'add_all'], fn ($c) => $c->subrepositories()->mirroredRepositories()->edit('sub', 12, 'add_all')],
    ['subrepositories.mirroredRepositories.remove', ['sub', 12], fn ($c) => $c->subrepositories()->mirroredRepositories()->remove('sub', 12)],
    ['subrepositories.mirroredRepositories.listPackages', ['sub', 12], fn ($c) => $c->subrepositories()->mirroredRepositories()->listPackages('sub', 12)],
    ['subrepositories.mirroredRepositories.addPackages', ['sub', 12, ['acme/cool-lib']], fn ($c) => $c->subrepositories()->mirroredRepositories()->addPackages('sub', 12, ['acme/cool-lib'])],
    ['subrepositories.mirroredRepositories.removePackages', ['sub', 12], fn ($c) => $c->subrepositories()->mirroredRepositories()->removePackages('sub', 12)],

    ['packages.all', [], fn ($c) => $c->packages()->all()],
    ['packages.all', [['origin' => 'private', 'security-issue-state' => 'open']], fn ($c) => $c->packages()->all(['origin' => 'private', 'security-issue-state' => 'open'])],
    ['packages.all', [['limit' => 50]], fn ($c) => $c->packages()->all(['limit' => 50])],
    ['packages.show', ['acme-website/package'], fn ($c) => $c->packages()->show('acme-website/package')],
    ['packages.show', [123], fn ($c) => $c->packages()->show(123)],
    ['packages.createVcsPackage', ['https://github.com/acme-website/package'], fn ($c) => $c->packages()->createVcsPackage('https://github.com/acme-website/package')],
    ['packages.createVcsPackage', ['https://github.com/acme-website/package', 42], fn ($c) => $c->packages()->createVcsPackage('https://github.com/acme-website/package', 42)],
    ['packages.createVcsPackage', ['https://github.com/acme-website/package', null, 'git', 'admin'], fn ($c) => $c->packages()->createVcsPackage('https://github.com/acme-website/package', null, 'git', 'admin')],
    ['packages.createCustomPackage', [$customJson], fn ($c) => $c->packages()->createCustomPackage($customJson)],
    ['packages.createCustomPackage', [['name' => 'acme/custom', 'version' => '1.0.0'], 42, 'read'], fn ($c) => $c->packages()->createCustomPackage(['name' => 'acme/custom', 'version' => '1.0.0'], 42, 'read')],
    ['packages.createArtifactPackage', [[41]], fn ($c) => $c->packages()->createArtifactPackage([41])],
    ['packages.createArtifactPackage', [[41, 42], 'hidden'], fn ($c) => $c->packages()->createArtifactPackage([41, 42], 'hidden')],
    ['packages.editVcsPackage', ['acme-website/package', 'https://github.com/acme-website/package'], fn ($c) => $c->packages()->editVcsPackage('acme-website/package', 'https://github.com/acme-website/package')],
    ['packages.editVcsPackage', ['acme-website/package', 'https://gitlab.com/acme/package.git', 7, 'git', 'read'], fn ($c) => $c->packages()->editVcsPackage('acme-website/package', 'https://gitlab.com/acme/package.git', 7, 'git', 'read')],
    ['packages.editArtifactPackage', ['acme/artifact', [42, 43]], fn ($c) => $c->packages()->editArtifactPackage('acme/artifact', [42, 43])],
    ['packages.editCustomPackage', ['acme-website/package', $customJson], fn ($c) => $c->packages()->editCustomPackage('acme-website/package', $customJson)],
    ['packages.remove', ['acme-website/package'], fn ($c) => $c->packages()->remove('acme-website/package')],
    ['packages.listCustomers', ['acme-website/package'], fn ($c) => $c->packages()->listCustomers('acme-website/package')],
    ['packages.listDependents', ['acme-website/package'], fn ($c) => $c->packages()->listDependents('acme-website/package')],
    ['packages.listSecurityIssues', ['acme-website/package', ['security-issue-state' => 'open']], fn ($c) => $c->packages()->listSecurityIssues('acme-website/package', ['security-issue-state' => 'open'])],
    ['packages.showSecurityMonitoringConfig', ['acme-website/package'], fn ($c) => $c->packages()->showSecurityMonitoringConfig('acme-website/package')],
    ['packages.editSecurityMonitoringConfig', ['acme-website/package', ['monitorAllBranches' => false, 'monitoredBranches' => ['dev-main']]], fn ($c) => $c->packages()->editSecurityMonitoringConfig('acme-website/package', ['monitorAllBranches' => false, 'monitoredBranches' => ['dev-main']])],
    ['packages.artifacts.create', ['zip', 'application/zip', 'package1.zip'], fn ($c) => $c->packages()->artifacts()->create($zip, 'application/zip', 'package1.zip')],
    ['packages.artifacts.add', ['acme/artifact', 'zip', 'application/zip', 'package1.zip'], fn ($c) => $c->packages()->artifacts()->add('acme/artifact', $zip, 'application/zip', 'package1.zip')],
    ['packages.artifacts.show', [41], fn ($c) => $c->packages()->artifacts()->show(41)],
    ['packages.artifacts.showPackageArtifacts', ['acme/artifact'], fn ($c) => $c->packages()->artifacts()->showPackageArtifacts('acme/artifact')],

    ['credentials.all', [], fn ($c) => $c->credentials()->all()],
    ['credentials.show', [42], fn ($c) => $c->credentials()->show(42)],
    ['credentials.create', ['ACME http auth', 'http-basic', 'acme-website.com', 'username', 'password'], fn ($c) => $c->credentials()->create('ACME http auth', 'http-basic', 'acme-website.com', 'username', 'password')],
    ['credentials.create', ['GitHub token', 'github-oauth', 'github.com', null, 'ghp_example'], fn ($c) => $c->credentials()->create('GitHub token', 'github-oauth', 'github.com', null, 'ghp_example')],
    ['credentials.edit', [42, 'http-basic', 'username', 'new password'], fn ($c) => $c->credentials()->edit(42, 'http-basic', 'username', 'new password')],
    ['credentials.remove', [42], fn ($c) => $c->credentials()->remove(42)],

    ['mirroredRepositories.all', [], fn ($c) => $c->mirroredRepositories()->all()],
    ['mirroredRepositories.show', [42], fn ($c) => $c->mirroredRepositories()->show(42)],
    ['mirroredRepositories.create', ['Mirrored Repository', 'https://composer.example.com', 'add_on_use', 543], fn ($c) => $c->mirroredRepositories()->create('Mirrored Repository', 'https://composer.example.com', 'add_on_use', 543)],
    ['mirroredRepositories.create', ['Packagist', 'https://repo.packagist.org', 'add_all'], fn ($c) => $c->mirroredRepositories()->create('Packagist', 'https://repo.packagist.org', 'add_all')],
    ['mirroredRepositories.edit', [42, 'Mirrored Repository', 'https://composer.example.com', 'add_on_use', 543], fn ($c) => $c->mirroredRepositories()->edit(42, 'Mirrored Repository', 'https://composer.example.com', 'add_on_use', 543)],
    ['mirroredRepositories.remove', [42], fn ($c) => $c->mirroredRepositories()->remove(42)],
    ['mirroredRepositories.listPackages', [42], fn ($c) => $c->mirroredRepositories()->listPackages(42)],
    ['mirroredRepositories.addPackages', [42, ['acme/cool-lib', 'acme/other']], fn ($c) => $c->mirroredRepositories()->addPackages(42, ['acme/cool-lib', 'acme/other'])],
    ['mirroredRepositories.removePackages', [42], fn ($c) => $c->mirroredRepositories()->removePackages(42)],

    ['synchronizations.all', [], fn ($c) => $c->synchronizations()->all()],
    ['jobs.show', ['46bf13150a86fece079ca979cb8ef57c78773faa'], fn ($c) => $c->jobs()->show('46bf13150a86fece079ca979cb8ef57c78773faa')],
    ['securityIssues.all', [], fn ($c) => $c->securityIssues()->all()],
    ['securityIssues.all', [['security-issue-state' => 'open']], fn ($c) => $c->securityIssues()->all(['security-issue-state' => 'open'])],
    ['securityIssues.show', [42], fn ($c) => $c->securityIssues()->show(42)],
    ['securityIssues.open', [42], fn ($c) => $c->securityIssues()->open(42)],
    ['securityIssues.close', [42, 'not-affected'], fn ($c) => $c->securityIssues()->close(42, 'not-affected')],

    ['projects.all', [], fn ($c) => $c->projects()->all()],
    ['projects.create', ['New project'], fn ($c) => $c->projects()->create('New project')],
];

$apiVectors = [];
foreach ($calls as [$name, $args, $call]) {
    $apiVectors[] = record($name, $args, $call);
}

// Pagination: Link headers, same origin absolute links and links without a host.
$apiVectors[] = record('pagination.absoluteNext', [], fn ($c) => $c->packages()->all(), [
    $page([['id' => 1, 'name' => 'acme/a']], 'https://packagist.com/api/packages/?page=2&limit=500'),
    $page([['id' => 2, 'name' => 'acme/b']], 'https://packagist.com/api/packages/?page=3&limit=500'),
    $page([['id' => 3, 'name' => 'acme/c']]),
]);
$apiVectors[] = record('pagination.relativeNext', [], fn ($c) => $c->customers()->all(), [
    $page([['id' => 1]], '/api/customers/?page=2&limit=500'),
    $page([['id' => 2]]),
]);
$apiVectors[] = record('pagination.filtersKeptOnNext', [['security-issue-state' => 'open']], fn ($c) => $c->securityIssues()->all(['security-issue-state' => 'open']), [
    $page([['id' => 10]], 'https://packagist.com/api/security-issues/?security-issue-state=open&page=2&limit=500'),
    $page([['id' => 11]]),
]);
$apiVectors[] = record('pagination.selfHosted', [], fn ($c) => $c->teams()->all(), [
    $page([['id' => 1]], 'https://packagist.example.com:8443/api/teams/?page=2&limit=500'),
    $page([['id' => 2]]),
], 'https://packagist.example.com:8443');
$apiVectors[] = record('selfHosted.show', ['acme/package'], fn ($c) => $c->packages()->show('acme/package'), [], 'https://packagist.example.com:8443');

// Job helper: polls until success.
$apiVectors[] = record('jobs.waitForJob', ['46bf13150a86fece079ca979cb8ef57c78773faa'], function ($c) {
    return (new JobHelper($c))->waitForJob('46bf13150a86fece079ca979cb8ef57c78773faa', 30, 0);
}, [
    jsonResponse(['id' => '46bf13150a86fece079ca979cb8ef57c78773faa', 'status' => 'queued']),
    jsonResponse(['id' => '46bf13150a86fece079ca979cb8ef57c78773faa', 'status' => 'running']),
    jsonResponse(['id' => '46bf13150a86fece079ca979cb8ef57c78773faa', 'status' => 'success', 'message' => 'done']),
]);

writeJson($outDir . '/php-requests.json', ['meta' => $meta + ['key' => KEY, 'secret' => SECRET, 'timestamp' => TIMESTAMP, 'nonce' => NONCE], 'vectors' => $apiVectors]);

// ---------------------------------------------------------------------------
// 5. Trusted publishing exchange, as the PHP client runs it inside GitHub Actions
// ---------------------------------------------------------------------------

$_SERVER['GITHUB_ACTIONS'] = 'true';
$_SERVER['ACTIONS_ID_TOKEN_REQUEST_TOKEN'] = 'gh-request-token';
$_SERVER['ACTIONS_ID_TOKEN_REQUEST_URL'] = 'https://pipelines.actions.example/idtoken?api-version=2.0';
$oidc = base64_encode('{"alg":"RS256"}') . '.' . base64_encode('{"aud":"packagist.com"}') . '.c2ln';
$mock = new MockClient();
$mock->addResponse(jsonResponse(['audience' => 'https://packagist.com/oidc/acme-org']));
$mock->addResponse(jsonResponse(['value' => $oidc]));
$mock->addResponse(jsonResponse(['key' => 'packagist_ack_exchanged', 'secret' => 'packagist_acs_exchanged']));
$mock->addResponse(jsonResponse(['id' => 99]));
$client = new Client(new HttpPluginClientBuilder($mock));
$client->authenticateWithTrustedPublishing('acme-org', 'acme/package');
$client->packages()->artifacts()->add('acme/package', $zip, 'application/zip', 'package1.zip');
$exchange = [];
foreach ($mock->getRequests() as $request) {
    $exchange[] = [
        'method' => $request->getMethod(),
        'url' => (string) $request->getUri(),
        'authorization' => $request->getHeaderLine('Authorization'),
    ];
}
writeJson($outDir . '/php-trusted-publishing.json', ['meta' => $meta, 'oidcToken' => $oidc, 'vectors' => $exchange]);
