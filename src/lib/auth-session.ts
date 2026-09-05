import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_BRIDGE_KEY } from "@/integrations/supabase/server-fn-auth";

function clearMatchingStorage(storage: Storage | undefined, shouldClear: (key: string) => boolean) {
  if (!storage) return;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && shouldClear(key)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

export function clearBrowserAuthState() {
  if (typeof window === "undefined") return;
  const isAuthKey = (key: string) =>
    key === ADMIN_SESSION_BRIDGE_KEY ||
    (key.startsWith("sb-") && key.includes("auth-token")) ||
    key.startsWith("supabase.auth.token") ||
    key.startsWith("wtron.auth.") ||
    key === "tanstack-router-scroll-positions";
  clearMatchingStorage(window.sessionStorage, isAuthKey);
  clearMatchingStorage(window.localStorage, isAuthKey);
}

export async function signOutAndReplace({
  supabase,
  queryClient,
  to,
}: {
  supabase: SupabaseClient;
  queryClient: QueryClient;
  to: string;
}) {
  await queryClient.cancelQueries();
  clearBrowserAuthState();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  clearBrowserAuthState();
  queryClient.clear();
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    clearBrowserAuthState();
    throw new Error("WTRON could not clear the current session. Try again.");
  }
  if (error) {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("wtron.auth.lastSignOutError", error.message);
      window.location.replace(to);
      return;
    }
    throw error;
  }
  if (typeof window !== "undefined") window.location.replace(to);
}
