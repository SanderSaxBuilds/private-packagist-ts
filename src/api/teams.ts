import type { RequestOptions } from '../client.ts';
import type { Package, Team } from '../schema.ts';
import { toTeamPermissions, type TeamPermissionsInput } from '../team-permissions.ts';
import { Resource } from './resource.ts';

export class Teams extends Resource {
  all(options?: RequestOptions): Promise<Team[]> {
    return this.client.getCollection('/teams/', undefined, options);
  }

  /**
   * Creates a team. Permissions can be a TeamPermissions object, a flag mask such as
   * `TeamPermissions.PERMISSION_CAN_EDIT_TEAM_PACKAGES | TeamPermissions.PERMISSION_CAN_ADD_PACKAGES`,
   * or a plain object.
   */
  create(name: string, permissions: TeamPermissionsInput, options?: RequestOptions): Promise<Team> {
    return this.client.post('/teams/', { name, permissions: toTeamPermissions(permissions).toParameters() }, options);
  }

  show(teamId: number, options?: RequestOptions): Promise<Team> {
    return this.client.get(this.client.buildPath('/teams/%s/', teamId), undefined, options);
  }

  edit(teamId: number, name: string, permissions: TeamPermissionsInput, options?: RequestOptions): Promise<Team> {
    return this.client.put(this.client.buildPath('/teams/%s/', teamId), { name, permissions: toTeamPermissions(permissions).toParameters() }, options);
  }

  grantAccessToAllPackages(teamId: number, options?: RequestOptions): Promise<Team> {
    return this.client.put(this.client.buildPath('/teams/%s/all-package-access/grant', teamId), undefined, options);
  }

  revokeAccessToAllPackages(teamId: number, options?: RequestOptions): Promise<Team> {
    return this.client.put(this.client.buildPath('/teams/%s/all-package-access/revoke', teamId), undefined, options);
  }

  async remove(teamId: number, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.client.buildPath('/teams/%s/', teamId), undefined, options);
  }

  addMember(teamId: number, userId: number, options?: RequestOptions): Promise<Team> {
    return this.client.put(this.client.buildPath('/teams/%s/members/%s/', teamId, userId), undefined, options);
  }

  async removeMember(teamId: number, userId: number, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.client.buildPath('/teams/%s/members/%s/', teamId, userId), undefined, options);
  }

  packages(teamId: number, options?: RequestOptions): Promise<Package[]> {
    return this.client.getCollection(this.client.buildPath('/teams/%s/packages/', teamId), undefined, options);
  }

  /** Gives the team access to packages, by name or id. */
  addPackages(teamId: number, packages: ReadonlyArray<string | number>, options?: RequestOptions): Promise<Package[]> {
    return this.client.post(this.client.buildPath('/teams/%s/packages/', teamId), packages, options);
  }

  async removePackage(teamId: number, packageIdOrName: string | number, options?: RequestOptions): Promise<void> {
    await this.client.delete(this.client.buildPath('/teams/%s/packages/%s/', teamId, packageIdOrName), undefined, options);
  }
}
