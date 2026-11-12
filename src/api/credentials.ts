import type { RequestOptions } from '../client.ts';
import type { Credential } from '../schema.ts';
import { Resource } from './resource.ts';

export type CredentialType =
  | 'bitbucket-app-pw'
  | 'github-oauth'
  | 'gitlab-token'
  | 'http-basic'
  | 'magento'
  | 'http-header'
  | 'ssh-key'
  | (string & {});

export class Credentials extends Resource {
  static readonly TYPE_BITBUCKET_APP_PW = 'bitbucket-app-pw';
  static readonly TYPE_GITHUB_OAUTH = 'github-oauth';
  static readonly TYPE_GITLAB_TOKEN = 'gitlab-token';
  static readonly TYPE_HTTP_BASIC = 'http-basic';
  static readonly TYPE_MAGENTO = 'magento';
  static readonly TYPE_HTTP_HEADER = 'http-header';
  static readonly TYPE_SSH_KEY = 'ssh-key';

  all(options?: RequestOptions): Promise<Credential[]> {
    return this.client.getCollection('/credentials/', undefined, options);
  }

  show(credentialId: number, options?: RequestOptions): Promise<Credential> {
    return this.client.get(this.client.buildPath('/credentials/%s/', credentialId), undefined, options);
  }

  create(
    description: string,
    type: CredentialType,
    domain: string | null,
    username: string | null,
    credential: string,
    options?: RequestOptions,
  ): Promise<Credential> {
    return this.client.post('/credentials/', { description, type, domain, username, credential }, options);
  }

  edit(credentialId: number, type: CredentialType, username: string | null, credential: string, options?: RequestOptions): Promise<Credential> {
    return this.client.put(this.client.buildPath('/credentials/%s/', credentialId), { username, credential, type }, options);
  }

  /** @deprecated Use edit. */
  update(credentialId: number, type: CredentialType, username: string | null, credential: string, options?: RequestOptions): Promise<Credential> {
    return this.edit(credentialId, type, username, credential, options);
  }

  async remove(credentialId: number, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.client.buildPath('/credentials/%s/', credentialId), undefined, options);
  }
}
