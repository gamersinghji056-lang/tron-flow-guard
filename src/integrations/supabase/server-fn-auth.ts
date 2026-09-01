import { supabase } from "@/integrations/supabase/client";

export const ADMIN_SESSION_BRIDGE_KEY = "wtron.admin.session.access_token";

export function rememberAdminSessionToken(accessToken: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ADMIN_SESSION_BRIDGE_KEY, accessToken);
  } catch {
    // Browser storage can be blocked; Supabase's persisted session remains primary.
  }
}

export function clearAdminSessionToken() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ADMIN_SESSION_BRIDGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function readAdminSessionToken() {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage.getItem(ADMIN_SESSION_BRIDGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function authenticatedServerFnOptions(
  accessToken?: string,
  options?: { diagnostic?: string },
) {
  const token =
    accessToken ??
    (await supabase.auth.getSession()).data.session?.access_token ??
    readAdminSessionToken();
  if (!token) return undefined;

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (options?.diagnostic) headers["X-WTRON-Auth-Diagnostic"] = options.diagnostic;
  return { headers };
}
