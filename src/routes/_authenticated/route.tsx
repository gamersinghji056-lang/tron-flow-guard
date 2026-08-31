import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { UserShell } from "@/components/user-shell";
import { getCurrentAccountAccess } from "@/lib/accounts.functions";
import { adminDomainClientRouteTarget } from "@/lib/domain-policy";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/trader/login" });
    if (typeof window !== "undefined") {
      const possibleAdminTarget = adminDomainClientRouteTarget({
        hostname: window.location.hostname,
        pathname: window.location.pathname,
        authenticated: false,
        isAdmin: false,
      });
      if (possibleAdminTarget) {
        try {
          const account = await getCurrentAccountAccess();
          throw redirect({ to: account.isAdmin ? "/admin" : "/admin/login", replace: true });
        } catch (routeError) {
          if (routeError && typeof routeError === "object" && "to" in routeError) {
            throw routeError;
          }
          throw redirect({ to: "/admin/login", replace: true });
        }
      }
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = window.location.pathname;
  if (pathname.startsWith("/admin")) return <Outlet />;
  if (pathname.startsWith("/vendor")) return <Outlet />;
  return (
    <UserShell>
      <Outlet />
    </UserShell>
  );
}
