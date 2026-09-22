/**
 * Role definitions.
 *
 * ## Relationship to Better Auth
 * `owner` is assigned automatically when an organization is created and cannot
 * be changed. Every other role is assigned by the application.
 *
 * ## What each role means
 * - `owner`            highest privilege, granted by Better Auth on creation
 * - `admin`            manages the whole organization: reads and writes every
 *                      department's data, invites users, changes roles
 * - `department_admin` manages their own department: invites and changes roles
 *                      inside it, writes its data, reads other departments
 * - `editor`           writes their own department's data, reads others, no
 *                      user management
 * - `viewer`           reads every department, writes nothing
 * - `partner_member`   an external collaborator. Denied by default everywhere;
 *                      only the routes that explicitly opt in are reachable.
 *                      See `PARTNER_ALLOWED_PREFIXES` and the `allowPartner`
 *                      option on `getSessionContextWithRole`.
 *
 * The predicates that act on these live in lib/helpers/role.helper.ts.
 */
export const ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  DEPARTMENT_ADMIN: "department_admin",
  EDITOR: "editor",
  VIEWER: "viewer",
  PARTNER_MEMBER: "partner_member",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  [ROLES.OWNER]: "Owner",
  [ROLES.ADMIN]: "Administrator",
  [ROLES.DEPARTMENT_ADMIN]: "Department administrator",
  [ROLES.EDITOR]: "Editor",
  [ROLES.VIEWER]: "Viewer",
  [ROLES.PARTNER_MEMBER]: "Partner",
};

/**
 * Roles that can be handed out through an invitation.
 * `owner` is excluded: Better Auth assigns it, nobody else does.
 */
export const INVITABLE_ROLES = [
  ROLES.ADMIN,
  ROLES.DEPARTMENT_ADMIN,
  ROLES.EDITOR,
  ROLES.VIEWER,
  ROLES.PARTNER_MEMBER,
] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/**
 * Roles allowed to invite users and manage organization settings.
 * `department_admin` is included, but its reach is limited to its own
 * department — see `canEditMember`.
 */
export const ROLES_WITH_ADMIN_PERMISSION = [
  ROLES.OWNER,
  ROLES.ADMIN,
  ROLES.DEPARTMENT_ADMIN,
] as const;

/**
 * Roles allowed to create, update and delete business records.
 * Everything above plus `editor` — that is, everyone except `viewer` and
 * `partner_member`.
 */
export const ROLES_WITH_EDIT_PERMISSION = [
  ...ROLES_WITH_ADMIN_PERMISSION,
  ROLES.EDITOR,
] as const;
