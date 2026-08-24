/**
 * Role-based access control vocabulary (client-safe).
 *
 * The browser only ever uses these constants for *presentation*. Every
 * privileged action re-checks the role and permission server-side through
 * `requireStaff` / `requirePermission` in `src/lib/access.server.ts`.
 */

export type AppRole = "super_admin" | "admin" | "employee" | "vendor" | "trader";

export const PERMISSIONS = {
  DASHBOARD_READ: "dashboard.read",
  USERS_READ: "users.read",
  USERS_MANAGE: "users.manage",
  P2P_READ: "p2p.read",
  P2P_MANAGE: "p2p.manage",
  DISPUTES_READ: "disputes.read",
  DISPUTES_MANAGE: "disputes.manage",
  DIRECT_SELL_READ: "direct_sell.read",
  DIRECT_SELL_MANAGE: "direct_sell.manage",
  VENDORS_READ: "vendors.read",
  VENDORS_REVIEW: "vendors.review",
  VENDORS_MANAGE: "vendors.manage",
  DEPOSITS_READ: "deposits.read",
  DEPOSITS_MANAGE: "deposits.manage",
  WITHDRAWALS_READ: "withdrawals.read",
  WITHDRAWALS_MANAGE: "withdrawals.manage",
  WALLETS_READ: "wallets.read",
  WALLETS_MANAGE: "wallets.manage",
  LEDGER_READ: "ledger.read",
  API_READ: "api.read",
  API_MANAGE: "api.manage",
  WEBHOOKS_READ: "webhooks.read",
  WEBHOOKS_MANAGE: "webhooks.manage",
  SYSTEM_HEALTH_READ: "system_health.read",
  SYSTEM_HEALTH_MANAGE: "system_health.manage",
  SETTINGS_READ: "settings.read",
  SETTINGS_MANAGE: "settings.manage",
  FEES_SWEEP: "fees.sweep",
  EMPLOYEES_READ: "employees.read",
  EMPLOYEES_MANAGE: "employees.manage",
  AUDIT_LOGS_READ: "audit_logs.read",
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
  [PERMISSIONS.DASHBOARD_READ]: "View dashboard",
  [PERMISSIONS.USERS_READ]: "View users",
  [PERMISSIONS.USERS_MANAGE]: "Manage users",
  [PERMISSIONS.P2P_READ]: "View P2P",
  [PERMISSIONS.P2P_MANAGE]: "Manage P2P",
  [PERMISSIONS.DISPUTES_READ]: "View disputes",
  [PERMISSIONS.DISPUTES_MANAGE]: "Manage disputes",
  [PERMISSIONS.DIRECT_SELL_READ]: "View direct sell",
  [PERMISSIONS.DIRECT_SELL_MANAGE]: "Manage direct sell",
  [PERMISSIONS.VENDORS_READ]: "View vendors",
  [PERMISSIONS.VENDORS_REVIEW]: "Review vendors",
  [PERMISSIONS.VENDORS_MANAGE]: "Manage vendors",
  [PERMISSIONS.DEPOSITS_READ]: "View deposits",
  [PERMISSIONS.DEPOSITS_MANAGE]: "Manage deposits",
  [PERMISSIONS.WITHDRAWALS_READ]: "View withdrawals",
  [PERMISSIONS.WITHDRAWALS_MANAGE]: "Manage withdrawals",
  [PERMISSIONS.WALLETS_READ]: "View wallets",
  [PERMISSIONS.WALLETS_MANAGE]: "Manage wallets",
  [PERMISSIONS.LEDGER_READ]: "View ledger",
  [PERMISSIONS.API_READ]: "View API settings",
  [PERMISSIONS.API_MANAGE]: "Manage API settings",
  [PERMISSIONS.WEBHOOKS_READ]: "View webhooks",
  [PERMISSIONS.WEBHOOKS_MANAGE]: "Manage webhooks",
  [PERMISSIONS.SYSTEM_HEALTH_READ]: "View system health",
  [PERMISSIONS.SYSTEM_HEALTH_MANAGE]: "Manage system health",
  [PERMISSIONS.SETTINGS_READ]: "View settings",
  [PERMISSIONS.SETTINGS_MANAGE]: "Manage settings",
  [PERMISSIONS.FEES_SWEEP]: "Create fee sweeps",
  [PERMISSIONS.EMPLOYEES_READ]: "View employees",
  [PERMISSIONS.EMPLOYEES_MANAGE]: "Manage employees",
  [PERMISSIONS.AUDIT_LOGS_READ]: "View audit logs",
  [PERMISSIONS.MANAGE_ADMINS]: "Manage administrators",
  [PERMISSIONS.MANAGE_TRADERS]: "Manage traders",
  [PERMISSIONS.MANAGE_WALLETS]: "Manage wallets",
  [PERMISSIONS.MANAGE_P2P]: "Manage P2P assignments",
  [PERMISSIONS.MANAGE_API_KEYS]: "Manage API keys",
  [PERMISSIONS.MANAGE_SETTINGS]: "Manage system settings",
  [PERMISSIONS.MANAGE_FEES]: "Manage fees",
  [PERMISSIONS.MANAGE_BLOCKCHAIN]: "Manage blockchain configuration",
  [PERMISSIONS.VIEW_AUDIT_LOGS]: "View audit logs",
};

/** Default operational permission set for a plain administrator. */
export const DEFAULT_ADMIN_PERMISSIONS: Permission[] = [
  PERMISSIONS.DASHBOARD_READ,
  PERMISSIONS.USERS_READ,
  PERMISSIONS.P2P_READ,
  PERMISSIONS.P2P_MANAGE,
  PERMISSIONS.DISPUTES_READ,
  PERMISSIONS.DISPUTES_MANAGE,
  PERMISSIONS.DIRECT_SELL_READ,
  PERMISSIONS.DIRECT_SELL_MANAGE,
  PERMISSIONS.VENDORS_READ,
  PERMISSIONS.VENDORS_REVIEW,
  PERMISSIONS.DEPOSITS_READ,
  PERMISSIONS.DEPOSITS_MANAGE,
  PERMISSIONS.WITHDRAWALS_READ,
  PERMISSIONS.WITHDRAWALS_MANAGE,
  PERMISSIONS.WALLETS_READ,
  PERMISSIONS.WALLETS_MANAGE,
  PERMISSIONS.LEDGER_READ,
  PERMISSIONS.API_READ,
  PERMISSIONS.API_MANAGE,
  PERMISSIONS.WEBHOOKS_READ,
  PERMISSIONS.WEBHOOKS_MANAGE,
  PERMISSIONS.SYSTEM_HEALTH_READ,
  PERMISSIONS.SYSTEM_HEALTH_MANAGE,
  PERMISSIONS.SETTINGS_READ,
  PERMISSIONS.SETTINGS_MANAGE,
  PERMISSIONS.FEES_SWEEP,
  PERMISSIONS.EMPLOYEES_READ,
  PERMISSIONS.EMPLOYEES_MANAGE,
  PERMISSIONS.AUDIT_LOGS_READ,
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
  if (role === "super_admin" || role === "admin") return true;
  return held.includes(permission);
}

export function isKnownPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

export function canGrantPermissions(input: {
  actorRole: AppRole | null;
  actorPermissions: string[];
  requestedPermissions: string[];
}) {
  if (!input.requestedPermissions.every(isKnownPermission)) return false;
  if (input.actorRole === "super_admin" || input.actorRole === "admin") return true;
  return input.requestedPermissions.every((permission) =>
    input.actorPermissions.includes(permission),
  );
}
