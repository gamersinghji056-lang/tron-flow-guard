/**
 * Role-based access control vocabulary (client-safe).
 *
 * The browser only ever uses these constants for *presentation*. Every
 * privileged action re-checks the role and permission server-side through
 * `requireStaff` / `requirePermission` in `src/lib/access.server.ts`.
 */

export type AppRole = "super_admin" | "admin" | "employee" | "vendor" | "trader";

export const PERMISSIONS = {
  MANAGE_ADMINS: "admins:manage",
  MANAGE_TRADERS: "traders:manage",
  MANAGE_WALLETS: "wallets:manage",
  MANAGE_P2P: "p2p:manage",
  MANAGE_API_KEYS: "api_keys:manage",
  MANAGE_SETTINGS: "settings:manage",
  MANAGE_FEES: "fees:manage",
  MANAGE_BLOCKCHAIN: "blockchain:manage",
  VIEW_SYSTEM_HEALTH: "system_health.read",
  MANAGE_EMPLOYEES: "employees.manage",
  VIEW_AUDIT_LOGS: "audit:read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const PERMISSION_LABELS: Record<Permission, string> = {
  [PERMISSIONS.MANAGE_ADMINS]: "Manage administrators",
  [PERMISSIONS.MANAGE_TRADERS]: "Manage traders",
  [PERMISSIONS.MANAGE_WALLETS]: "Manage wallets",
  [PERMISSIONS.MANAGE_P2P]: "Manage P2P assignments",
  [PERMISSIONS.MANAGE_API_KEYS]: "Manage API keys",
  [PERMISSIONS.MANAGE_SETTINGS]: "Manage system settings",
  [PERMISSIONS.MANAGE_FEES]: "Manage fees",
  [PERMISSIONS.MANAGE_BLOCKCHAIN]: "Manage blockchain configuration",
  [PERMISSIONS.VIEW_SYSTEM_HEALTH]: "View system health",
  [PERMISSIONS.MANAGE_EMPLOYEES]: "Manage employees",
  [PERMISSIONS.VIEW_AUDIT_LOGS]: "View audit logs",
};

/** Default operational permission set for a plain administrator. */
export const DEFAULT_ADMIN_PERMISSIONS: Permission[] = [
  PERMISSIONS.MANAGE_TRADERS,
  PERMISSIONS.MANAGE_WALLETS,
  PERMISSIONS.MANAGE_P2P,
  PERMISSIONS.VIEW_AUDIT_LOGS,
];

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super administrator",
  admin: "Administrator",
  employee: "Employee",
  vendor: "Vendor",
  trader: "Trader",
};

export function isStaffRole(role: AppRole | null): boolean {
  return role === "admin" || role === "super_admin" || role === "employee";
}

/** Super administrators implicitly hold every permission. */
export function grants(role: AppRole | null, held: string[], permission: Permission): boolean {
  if (role === "super_admin") return true;
  return held.includes(permission);
}
