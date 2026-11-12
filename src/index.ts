export {
  PrivatePackagistClient,
  PrivatePackagistClient as Client,
  DEFAULT_LIMIT,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  jsonBody,
  type ApiResponse,
  type ClientOptions,
  type FileContent,
  type RawRequest,
  type RequestOptions,
  type RetryOptions,
  type TrustedPublishingOptions,
} from './client.ts';

export {
  AbortError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  ConnectionError,
  errorFromResponse,
  HttpError,
  HttpTransportError,
  InvalidArgumentError,
  JobFailedError,
  JobTimeoutError,
  OriginMismatchError,
  PayloadTooLargeError,
  PermissionDeniedError,
  PrivatePackagistError,
  RateLimitError,
  ResourceNotFoundError,
  ServerError,
  TimeoutError,
  TrustedPublishingError,
  UnexpectedResponseError,
  type HttpErrorInit,
} from './errors.ts';

export {
  AUTHORIZATION_SCHEME,
  SIGNATURE_VERSION,
  RequestSigner,
  authorizationHeader,
  canonicalQuery,
  signRequest,
  stringToSign,
  type SignInput,
  type SignatureParts,
  type SignedRequest,
  type SignerOptions,
} from './signature.ts';

export { TeamPermissions, toTeamPermissions, type TeamPermissionFlags, type TeamPermissionParameters, type TeamPermissionsInput } from './team-permissions.ts';
export { WEBHOOK_SIGNATURE_HEADER, WebhookSignature, validateWebhookSignature } from './webhook.ts';
export { githubActionsTokenProvider, staticTokenProvider, type Environment, type GitHubActionsTokenProviderOptions, type OidcTokenContext, type OidcTokenProvider } from './trusted-publishing.ts';
export { buildPath, type PathArgument } from './path.ts';
export { parseLinkHeader } from './http.ts';
export { httpBuildQuery, parseStr, phpJsonEncode, rawurlencode, urlencode, type QueryValue } from './php.ts';
export type { BinaryLike } from './crypto.ts';
export type { CustomPackageJson, DefaultSuborganizationAccess } from './payload.ts';
export { VERSION } from './version.ts';

export { Credentials, type CredentialType } from './api/credentials.ts';
export { Customers, CustomerVendorBundles, MagentoLegacyKeys, type CustomerChanges, type CustomerIdOrUrlName, type CustomerPackageGrant, type Stability } from './api/customers.ts';
export { JobHelper, Jobs, type WaitForJobOptions } from './api/jobs.ts';
export { MirroredRepositories, type MirroringBehavior } from './api/mirrored-repositories.ts';
export { Organization } from './api/organization.ts';
export { PackageArtifacts, Packages, type PackageIdOrName, type SecurityMonitoringConfig } from './api/packages.ts';
export { AVAILABLE_ORIGINS, type PackageFilters, type RegenerateConfirmation } from './api/resource.ts';
export {
  ScopedContainer,
  ScopedMirroredRepositories,
  ScopedPackages,
  SuborganizationPackageArtifacts,
  SuborganizationPackages,
  type ScopedMirroredRepositoryAccess,
  type ScopedTeamAccess,
  type ScopedTokenData,
} from './api/scoped.ts';
export { SecurityIssues, type SecurityIssueFilters } from './api/security-issues.ts';
export { Suborganizations } from './api/suborganizations.ts';
export { Subrepositories } from './api/subrepositories.ts';
export { Synchronizations } from './api/synchronizations.ts';
export { Teams } from './api/teams.ts';
export { Tokens, type TokenData } from './api/tokens.ts';
export { VendorBundlePackages, VendorBundles, type VendorBundleChanges, type VendorBundlePackageGrant } from './api/vendor-bundles.ts';

export type * from './schema.ts';
