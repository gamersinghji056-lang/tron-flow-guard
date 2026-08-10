/**
 * Access + auth-configuration server functions.
 *
 * Thin RPC wrappers only: every runtime helper is imported from a server-only
 * module inside the handler body.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The signed-in caller's authoritative role + permission set. */
export const getAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readAccess } = await import("@/lib/access.server");
    return readAccess(context.supabase, context.userId);
  });

/**
 * Public auth configuration. Currently exposes the single flag that decides
 * whether registration sends a verification email.
 */
export const getAuthConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { readAuthConfig } = await import("@/lib/auth-config.server");
  return readAuthConfig();
});
