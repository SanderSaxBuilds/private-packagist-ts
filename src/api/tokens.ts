import type { RequestOptions } from '../client.ts';
import { InvalidArgumentError } from '../errors.ts';
import type { TeamAuthenticationToken } from '../schema.ts';
import { assertConfirmation, Resource, type RegenerateConfirmation } from './resource.ts';

export interface TokenData {
  description: string;
  /** "read" or "update". */
  access: 'read' | 'update' | (string & {});
  /** Access to all packages. Leave out when teamId is set. */
  accessToAllPackages?: boolean;
  /** Limit the token to the packages of one team. Leave out when accessToAllPackages is set. */
  teamId?: number;
  /** ISO 8601 date the token stops working. */
  expiresAt?: string | null;
  [key: string]: unknown;
}

export class Tokens extends Resource {
  all(options?: RequestOptions): Promise<TeamAuthenticationToken[]> {
    return this.client.getCollection('/tokens/', undefined, options);
  }

  create(tokenData: TokenData, options?: RequestOptions): Promise<TeamAuthenticationToken> {
    if (tokenData.teamId !== undefined && tokenData.teamId !== null && tokenData.accessToAllPackages !== undefined && tokenData.accessToAllPackages !== null) {
      throw new InvalidArgumentError('Only set either "accessToAllPackages" or "teamId"');
    }
    return this.client.post('/tokens/', tokenData, options);
  }

  async remove(tokenId: number, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.client.buildPath('/tokens/%s/', tokenId), undefined, options);
  }

  /** Issues a new token value. The old one stops working right away, so the confirmation flag is required. */
  regenerate(tokenId: number, confirmation: RegenerateConfirmation, options?: RequestOptions): Promise<TeamAuthenticationToken> {
    assertConfirmation(confirmation);
    return this.client.post(this.client.buildPath('/tokens/%s/regenerate', tokenId), confirmation, options);
  }
}
