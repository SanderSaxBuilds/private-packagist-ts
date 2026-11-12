/** The permissions a team grants its members, with the same flags as the PHP TeamPermissions class. */
export class TeamPermissions {
  static readonly PERMISSION_CAN_EDIT_TEAM_PACKAGES = 1 << 0;
  static readonly PERMISSION_CAN_ADD_PACKAGES = 1 << 1;
  static readonly PERMISSION_CAN_CREATE_SUBORGANIZATIONS = 1 << 2;
  /** @deprecated Use PERMISSION_CAN_CREATE_SUBORGANIZATIONS. */
  static readonly PERMISSION_CAN_CREATE_SUBREPOSITORIES = 1 << 2;
  static readonly PERMISSION_CAN_VIEW_VENDOR_CUSTOMERS = 1 << 3;
  static readonly PERMISSION_CAN_MANAGE_VENDOR_CUSTOMERS = 1 << 4;

  canEditTeamPackages = false;
  canAddPackages = false;
  canCreateSuborganizations = false;
  canViewVendorCustomers = false;
  canManageVendorCustomers = false;

  constructor(init: Partial<TeamPermissionFlags> = {}) {
    this.canEditTeamPackages = init.canEditTeamPackages ?? false;
    this.canAddPackages = init.canAddPackages ?? false;
    this.canCreateSuborganizations = (init.canCreateSuborganizations ?? false) || (init.canCreateSubrepositories ?? false);
    this.canViewVendorCustomers = init.canViewVendorCustomers ?? false;
    this.canManageVendorCustomers = init.canManageVendorCustomers ?? false;
  }

  /** @deprecated Use canCreateSuborganizations. */
  get canCreateSubrepositories(): boolean {
    return this.canCreateSuborganizations;
  }

  set canCreateSubrepositories(value: boolean) {
    this.canCreateSuborganizations = value;
  }

  /** Builds permissions from a bit mask of the PERMISSION_* constants. */
  static fromFlags(flags: number): TeamPermissions {
    return new TeamPermissions({
      canEditTeamPackages: (flags & TeamPermissions.PERMISSION_CAN_EDIT_TEAM_PACKAGES) > 0,
      canAddPackages: (flags & TeamPermissions.PERMISSION_CAN_ADD_PACKAGES) > 0,
      canCreateSuborganizations: (flags & TeamPermissions.PERMISSION_CAN_CREATE_SUBORGANIZATIONS) > 0,
      canViewVendorCustomers: (flags & TeamPermissions.PERMISSION_CAN_VIEW_VENDOR_CUSTOMERS) > 0,
      canManageVendorCustomers: (flags & TeamPermissions.PERMISSION_CAN_MANAGE_VENDOR_CUSTOMERS) > 0,
    });
  }

  /** Reads the `permissions` object of a team returned by the API. Older responses use canCreateSubrepositories. */
  static fromTeamResponse(team: { permissions?: Partial<Record<keyof TeamPermissionFlags, unknown>> | null }): TeamPermissions {
    const p = team.permissions ?? {};
    return new TeamPermissions({
      canEditTeamPackages: Boolean(p.canEditTeamPackages),
      canAddPackages: Boolean(p.canAddPackages),
      canCreateSuborganizations: Boolean(p.canCreateSuborganizations) || Boolean(p.canCreateSubrepositories),
      canViewVendorCustomers: Boolean(p.canViewVendorCustomers),
      canManageVendorCustomers: Boolean(p.canManageVendorCustomers),
    });
  }

  /** The bit mask for these permissions. */
  toFlags(): number {
    return (
      (this.canEditTeamPackages ? TeamPermissions.PERMISSION_CAN_EDIT_TEAM_PACKAGES : 0) |
      (this.canAddPackages ? TeamPermissions.PERMISSION_CAN_ADD_PACKAGES : 0) |
      (this.canCreateSuborganizations ? TeamPermissions.PERMISSION_CAN_CREATE_SUBORGANIZATIONS : 0) |
      (this.canViewVendorCustomers ? TeamPermissions.PERMISSION_CAN_VIEW_VENDOR_CUSTOMERS : 0) |
      (this.canManageVendorCustomers ? TeamPermissions.PERMISSION_CAN_MANAGE_VENDOR_CUSTOMERS : 0)
    );
  }

  /** The `permissions` object the API expects when a team is created or edited. */
  toParameters(): TeamPermissionParameters {
    return {
      canEditTeamPackages: this.canEditTeamPackages,
      canAddPackages: this.canAddPackages,
      canCreateSuborganizations: this.canCreateSuborganizations,
      canViewVendorCustomers: this.canViewVendorCustomers,
      canManageVendorCustomers: this.canManageVendorCustomers,
    };
  }
}

export interface TeamPermissionParameters {
  canEditTeamPackages: boolean;
  canAddPackages: boolean;
  canCreateSuborganizations: boolean;
  canViewVendorCustomers: boolean;
  canManageVendorCustomers: boolean;
}

export interface TeamPermissionFlags extends TeamPermissionParameters {
  /** @deprecated Use canCreateSuborganizations. */
  canCreateSubrepositories: boolean;
}

/** Anything the team methods accept as permissions: a TeamPermissions object, a flag mask, or a plain object. */
export type TeamPermissionsInput = TeamPermissions | number | Partial<TeamPermissionFlags>;

export function toTeamPermissions(input: TeamPermissionsInput): TeamPermissions {
  if (input instanceof TeamPermissions) return input;
  if (typeof input === 'number') return TeamPermissions.fromFlags(input);
  return new TeamPermissions(input);
}
