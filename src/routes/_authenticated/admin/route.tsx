import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAccess } from "@/lib/access.functions";

/**
 * Administrator subtree gate. The role is resolved by a *server* function that
 * re-reads `user_roles` with the caller's own token, so a trader cannot reach
 * any admin screen by editing client state or typing the URL.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    try {
      const access = await getAccess();
      if (!access.isAdmin) throw redirect({ to: "/dashboard", replace: true });
      return { access };
    } catch (error) {
      if (error && typeof error === "object" && "to" in error) throw error;
      throw redirect({ to: "/dashboard", replace: true });
    }
  },
  component: () => <Outlet />,
});
