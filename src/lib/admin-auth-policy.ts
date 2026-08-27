import type { AppRole } from "@/lib/rbac";

export type AdminLoginRole = AppRole | "owner";

export type AdminLoginDecision =
  | {
      status: "allowed";
      role: "owner" | "super_admin" | "admin" | "employee";
      permissions: string[];
      implicitPermissions: boolean;
    }
  | { status: "missing_profile" }
  | { status: "missing_role" }
  | { status: "not_authorized"; role: AppRole | null };

const ROLE_PRIORITY: AdminLoginRole[] = [
  "owner",
  "super_admin",
  "admin",
  "employee",
  "vendor",
  "trader",
];

export function selectPrimaryRole(roles: readonly AdminLoginRole[]): AdminLoginRole | null {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return null;
}

export function resolveAdminLoginDecision(input: {
  hasProfile: boolean;
  roles: readonly AdminLoginRole[];
  permissions?: readonly string[];
}): AdminLoginDecision {
  if (!input.hasProfile) return { status: "missing_profile" };

  const role = selectPrimaryRole(input.roles);
  if (!role) return { status: "missing_role" };

  if (role === "owner" || role === "super_admin" || role === "admin") {
    return {
      status: "allowed",
      role,
      permissions: [...(input.permissions ?? [])],
      implicitPermissions: true,
    };
  }

  if (role === "employee") {
    return {
      status: "allowed",
      role,
      permissions: [...(input.permissions ?? [])],
      implicitPermissions: false,
    };
  }

  return { status: "not_authorized", role };
}

export function adminLoginErrorMessage(status: Exclude<AdminLoginDecision["status"], "allowed">) {
  if (status === "missing_profile") return "Admin profile is incomplete.";
  if (status === "missing_role") return "Admin access is incomplete.";
  return "Account is not authorized for Admin.";
}
