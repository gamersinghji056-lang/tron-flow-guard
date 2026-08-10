/**
 * Authentication configuration (server-only).
 *
 * `EMAIL_VERIFICATION_REQUIRED` lives in `system_settings.email_verification_required`
 * and can be flipped by a super administrator at any time.
 *
 * false (default) — registration creates a pre-confirmed account, no email is
 *                   sent, no verification link exists and login is never blocked.
 * true            — registration goes through Supabase's confirmation email and
 *                   the account cannot sign in until the link is used.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface AuthConfig {
  emailVerificationRequired: boolean;
}

export const DEFAULT_AUTH_CONFIG: AuthConfig = { emailVerificationRequired: false };

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export async function readAuthConfig(): Promise<AuthConfig> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = process.env["SUPABASE_SERVICE_ROLE_KEY"] ? supabaseAdmin : publicClient();
    const { data } = await client
      .from("system_settings")
      .select("value")
      .eq("key", "email_verification_required")
      .maybeSingle();
    return { emailVerificationRequired: data?.value === true };
  } catch {
    return DEFAULT_AUTH_CONFIG;
  }
}
