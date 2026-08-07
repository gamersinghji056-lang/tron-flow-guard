/**
 * Administrator provisioning (server-only).
 *
 * Admin accounts are created with the service-role Auth Admin API, pre-confirmed
 * (the shared registration code already proves authorisation), then granted the
 * `admin` role in `user_roles` — never on the profile row.
 */
export async function provisionAdmin(input: {
  email: string;
  password: string;
  fullName: string;
  code?: string;
}) {
  const expected = process.env["ADMIN_REGISTRATION_CODE"];
  // When an administrator code is configured it is mandatory. If none is set the
  // desk runs in open demo mode and administrator sign-up is unrestricted.
  if (expected && input.code !== expected) {
    throw new Error("Invalid administrator registration code");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error || !created.user) {
    throw new Error(error?.message ?? "Could not create the administrator account");
  }

  const userId = created.user.id;

  // handle_new_user() already inserted a profile + role; make sure it is admin.
  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "trader");

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: userId,
    actor_type: "admin",
    action: "auth.admin_registered",
    entity_type: "user",
    entity_id: userId,
  });

  return { ok: true, email: input.email };
}
