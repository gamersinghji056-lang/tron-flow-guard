import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const employeeInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(10).max(128),
  permissions: z.array(z.string().trim().min(3).max(80)).default([]),
});

const permissionInput = z.object({
  userId: z.string().uuid(),
  permissions: z.array(z.string().trim().min(3).max(80)),
});

export const createEmployeeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => employeeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.name, account_type: "employee" },
    });
    if (authError) throw new Error(authError.message);
    const userId = created.user?.id;
    if (!userId) throw new Error("Could not create employee");
    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: data.email,
      full_name: data.name,
    });
    await supabaseAdmin.from("user_roles" as never).upsert({
      user_id: userId,
      role: "employee",
    } as never);
    if (data.permissions.length) {
      await supabaseAdmin
        .from("admin_permissions")
        .insert(data.permissions.map((permission) => ({ user_id: userId, permission })));
    }
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      actor_type: "admin",
      action: "employee_created",
      entity_type: "user",
      entity_id: userId,
      metadata: { permissions: data.permissions },
    });
    return { id: userId };
  });

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin
      .from("user_roles" as never)
      .select("user_id")
      .eq("role", "employee" as never);
    if (error) throw new Error(error.message);
    const ids = ((roles ?? []) as unknown as { user_id: string }[]).map((row) => row.user_id);
    if (!ids.length) return [];
    const [profiles, perms] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, updated_at").in("id", ids),
      supabaseAdmin.from("admin_permissions").select("user_id, permission").in("user_id", ids),
    ]);
    if (profiles.error) throw new Error(profiles.error.message);
    if (perms.error) throw new Error(perms.error.message);
    return (profiles.data ?? []).map((profile) => ({
      ...profile,
      permissions: (perms.data ?? [])
        .filter((row) => row.user_id === profile.id)
        .map((row) => row.permission),
    }));
  });

export const updateEmployeePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => permissionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_permissions").delete().eq("user_id", data.userId);
    if (data.permissions.length) {
      const { error } = await supabaseAdmin
        .from("admin_permissions")
        .insert(data.permissions.map((permission) => ({ user_id: data.userId, permission })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
