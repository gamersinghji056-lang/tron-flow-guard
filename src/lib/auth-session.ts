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
  clearMatchingStorage(window.sessionStorage, (key) => key === ADMIN_SESSION_BRIDGE_KEY);
  clearMatchingStorage(
    window.localStorage,
    (key) =>
      key === ADMIN_SESSION_BRIDGE_KEY ||
      (key.startsWith("sb-") && key.includes("auth-token")) ||
      key.startsWith("supabase.auth.token"),
  );
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
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  clearBrowserAuthState();
  queryClient.clear();
  const { data } = await supabase.auth.getSession();
  if (data.session) throw new Error("WTRON could not clear the current session. Try again.");
  if (typeof window !== "undefined") window.location.replace(to);
}
