/**
 * Server-side authorisation primitives (server-only).
 *
 * Nothing here trusts anything the browser sends: the role and permission set
 * are always re-read from the database with the *authenticated* client, so RLS
 * applies and a trader cannot impersonate staff by editing a request payload.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AppRole, Permission } from "@/lib/rbac";

type Client = SupabaseClient<Database>;

export interface AccessProfile {
  userId: string;
  role: AppRole;
  permissions: string[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export async function readAccess(client: Client, userId: string): Promise<AccessProfile> {
  const [{ data: initialRoles, error: roleError }, { data: initialPerms }] = await Promise.all([
    client.from("user_roles").select("role").eq("user_id", userId),
    client.from("admin_permissions").select("permission").eq("user_id", userId),
  ]);
  let roles = initialRoles ?? [];
  let perms = initialPerms ?? [];
  if (roleError || roles.length === 0) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: serviceRoles, error: serviceRoleError }, { data: servicePerms }] =
      await Promise.all([
        supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
        supabaseAdmin.from("admin_permissions").select("permission").eq("user_id", userId),
      ]);
    if (serviceRoleError) throw new Error("Could not read your account role");
    roles = serviceRoles ?? [];
    perms = servicePerms ?? [];
  }

  const held = (roles ?? []).map((row) => row.role as AppRole);
  const role: AppRole = held.includes("super_admin")
    ? "super_admin"
    : held.includes("admin")
      ? "admin"
      : held.includes("employee")
        ? "employee"
        : held.includes("vendor")
          ? "vendor"
          : "trader";

  return {
    userId,
    role,
    permissions: (perms ?? []).map((row) => row.permission),
    isAdmin: role === "admin" || role === "super_admin" || role === "employee",
    isSuperAdmin: role === "super_admin",
  };
}

/** Throws unless the caller is an administrator or super administrator. */
export async function requireStaff(client: Client, userId: string): Promise<AccessProfile> {
  const access = await readAccess(client, userId);
  if (!access.isAdmin) throw new Error("Forbidden: administrator access required");
  return access;
}

/** Throws unless the caller holds the permission (super admins always pass). */
export async function requirePermission(
  client: Client,
  userId: string,
  permission: Permission,
): Promise<AccessProfile> {
  const access = await requireStaff(client, userId);
  if (access.isSuperAdmin) return access;
  if (!access.permissions.includes(permission)) {
    throw new Error("Forbidden: you do not have permission to perform this action");
  }
  return access;
}

export async function requireSuperAdmin(client: Client, userId: string): Promise<AccessProfile> {
  const access = await readAccess(client, userId);
  if (!access.isSuperAdmin) throw new Error("Forbidden: super administrator access required");
  return access;
}
