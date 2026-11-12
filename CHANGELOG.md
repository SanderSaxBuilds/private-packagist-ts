# Changelog

## 1.0.0

First release.

- `PrivatePackagistClient` with every resource of the PHP client 1.x: teams, tokens, customers with vendor bundles and Magento legacy keys, vendor bundles, packages and artifacts, credentials, mirrored repositories, suborganizations, the deprecated subrepositories and projects, synchronizations, security issues, jobs and organization sync.
- `PACKAGIST-HMAC-SHA256` request signing that matches the PHP client byte for byte, checked against 126 signatures and 169 full requests recorded from it.
- Pagination over `Link: rel="next"` with the same origin check as PHP, plus `iterate()`, `paginate()` and `pages()` for streaming.
- Trusted publishing through GitHub Actions OIDC, or any token provider.
- `WebhookSignature`, `TeamPermissions`, `JobHelper` and `RequestSigner`.
- Typed errors per status code, per-attempt timeouts, `AbortSignal`, and retries with `Retry-After` on 429 and 5xx.
- Response types generated from the Private Packagist OpenAPI document.
- ESM and CommonJS builds, no runtime dependencies.
