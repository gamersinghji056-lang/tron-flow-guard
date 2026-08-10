/**
 * Account provisioning (server-only).
 *
 * Both trader and administrator accounts are created with the service-role Auth
 * Admin API so the confirmation behaviour is driven purely by our own
 * `email_verification_required` setting instead of the project-wide default:
 *
 *   required = false → the account is created pre-confirmed, no email is sent
 *                      and the user can sign in immediately.
 *   required = true  → the account is created unconfirmed and Supabase's
 *                      confirmation email is triggered; login stays blocked
 *                      until the link is used.
 *
 * Administrator roles are NEVER derived from signup order. The first
 * code-authorised administrator becomes the super administrator; every later
 * one is a plain administrator with a default operational permission set. Any
 * number of administrators may exist.
 */
import { DEFAULT_ADMIN_PERMISSIONS } from "@/lib/rbac";

export interface RegistrationResult {
  ok: true;
  email: string;
  role: "trader" | "admin" | "super_admin";
  emailVerificationRequired: boolean;
  /** True when the caller may sign in straight away. */
  canSignInNow: boolean;
}

async function createAuthUser(input: {
  email: string;
  password: string;
  fullName: string;
  emailVerificationRequired: boolean;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: !input.emailVerificationRequired,
    user_metadata: { full_name: input.fullName },
  });

  if (error || !data.user) {
    const message = error?.message ?? "Could not create the account";
    if (/already/i.test(message)) {
      throw new Error("An account with this email already exists");
    }
    throw new Error(message);
  }

  if (input.emailVerificationRequired) {
    // Send the confirmation email only when verification is actually required.
    await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email: input.email,
      password: input.password,
    });
  }

  return data.user.id;
}

export async function provisionTrader(input: {
  email: string;
  password: string;
  fullName: string;
}): Promise<RegistrationResult> {
  const { readAuthConfig } = await import("@/lib/auth-config.server");
  const { emailVerificationRequired } = await readAuthConfig();

  await createAuthUser({ ...input, emailVerificationRequired });

  return {
    ok: true,
    email: input.email,
    role: "trader",
    emailVerificationRequired,
    canSignInNow: !emailVerificationRequired,
  };
}

export async function provisionAdmin(input: {
  email: string;
  password: string;
  fullName: string;
  code?: string | undefined;
}): Promise<RegistrationResult> {
  const expected = process.env["ADMIN_REGISTRATION_CODE"];
  // When an administrator code is configured it is mandatory. If none is set the
  // desk runs in open demo mode and administrator sign-up is unrestricted.
  if (expected && input.code !== expected) {
    throw new Error("Invalid administrator registration code");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { readAuthConfig } = await import("@/lib/auth-config.server");
  const { emailVerificationRequired } = await readAuthConfig();

  // Explicit, code-authorised bootstrap of the first super administrator —
  // never "first registered user wins".
  const { data: existingSuper } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("role", "super_admin")
    .limit(1);
  const role = existingSuper && existingSuper.length > 0 ? "admin" : "super_admin";

  const userId = await createAuthUser({
    email: input.email,
    password: input.password,
    fullName: input.fullName,
    emailVerificationRequired,
  });

  // handle_new_user() inserted the trader role; replace it with the staff role.
  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "trader");

  if (role === "admin") {
    await supabaseAdmin.from("admin_permissions").upsert(
      DEFAULT_ADMIN_PERMISSIONS.map((permission) => ({ user_id: userId, permission })),
      { onConflict: "user_id,permission" },
    );
  }

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: userId,
    actor_type: "admin",
    action: "admin.created",
    entity_type: "user",
    entity_id: userId,
    metadata: { role, self_registered: true },
  });

  return {
    ok: true,
    email: input.email,
    role,
    emailVerificationRequired,
    canSignInNow: !emailVerificationRequired,
  };
}
