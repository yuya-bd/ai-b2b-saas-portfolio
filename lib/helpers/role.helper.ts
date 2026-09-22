import {
  INVITABLE_ROLES,
  type InvitableRole,
  ROLES,
  ROLES_WITH_ADMIN_PERMISSION,
  ROLES_WITH_EDIT_PERMISSION,
  type Role,
} from "@/lib/constants/roles";

// --- Role identity ---------------------------------------------------------

/** Organization-wide admin: reaches every department. */
export function isOrgAdmin(role: Role): boolean {
  return role === ROLES.OWNER || role === ROLES.ADMIN;
}

/** Admin scoped to their own department only. */
export function isDepartmentAdmin(role: Role): boolean {
  return role === ROLES.DEPARTMENT_ADMIN;
}

/**
 * External collaborator. Denied everywhere unless a route opts in, so new
 * routes are safe by default rather than safe by remembering.
 */
export function isPartnerMember(role: Role): boolean {
  return role === ROLES.PARTNER_MEMBER;
}

// --- Capability checks -----------------------------------------------------

export function canInvite(role: Role): boolean {
  return (ROLES_WITH_ADMIN_PERMISSION as readonly string[]).includes(role);
}

export function canManageUsers(role: Role): boolean {
  return (ROLES_WITH_ADMIN_PERMISSION as readonly string[]).includes(role);
}

/** Create, update or delete business records. `viewer` cannot. */
export function canEdit(role: Role): boolean {
  return (ROLES_WITH_EDIT_PERMISSION as readonly string[]).includes(role);
}

/**
 * Whether the operator may change the target member.
 * Organization admins may change anyone; a department admin only members of
 * the same department; everyone else, nobody.
 */
export function canEditMember(
  operatorRole: Role,
  operatorDepartmentId: string | null,
  targetDepartmentId: string | null,
): boolean {
  if (isOrgAdmin(operatorRole)) return true;
  if (isDepartmentAdmin(operatorRole)) {
    if (!operatorDepartmentId) return false;
    return operatorDepartmentId === targetDepartmentId;
  }
  return false;
}

// --- Role assignment -------------------------------------------------------

/**
 * Which roles this role may grant through an invitation.
 * A department admin cannot grant a role at or above their own, so privilege
 * cannot be escalated sideways through the invite flow.
 */
export function getAssignableRoles(role: Role): readonly InvitableRole[] {
  if (isOrgAdmin(role)) {
    return INVITABLE_ROLES;
  }
  if (isDepartmentAdmin(role)) {
    return [ROLES.EDITOR, ROLES.VIEWER] as const;
  }
  return [] as const;
}
