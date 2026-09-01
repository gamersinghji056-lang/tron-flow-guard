import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAccess } from "@/lib/access.functions";
import { AdminOpsShell } from "@/components/admin-ops-shell";
import { isAdminProductionHostname } from "@/lib/domain-policy";
import { authenticatedServerFnOptions } from "@/integrations/supabase/server-fn-auth";

/**
 * Administrator subtree gate. The role is resolved by a *server* function that
 * re-reads `user_roles` with the caller's own token, so a trader cannot reach
 * any admin screen by editing client state or typing the URL.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const unauthorizedTarget =
      typeof window !== "undefined" && isAdminProductionHostname(window.location.hostname)
        ? "/admin/login"
        : "/dashboard";
    try {
      const access = await getAccess(
        await authenticatedServerFnOptions(undefined, { diagnostic: "admin-route-guard" }),
      );
      if (!access.isAdmin) throw redirect({ to: unauthorizedTarget, replace: true });
      return { access };
    } catch (error) {
      if (error && typeof error === "object" && "to" in error) throw error;
      throw redirect({ to: unauthorizedTarget, replace: true });
    }
  },
  component: () => (
    <AdminOpsShell>
      <Outlet />
    </AdminOpsShell>
  ),
});
