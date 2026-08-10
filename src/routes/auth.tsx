import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy single sign-in page. Trader and administrator authentication are now
 * fully separate surfaces, so this route only forwards to the trader entrance.
 */
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/trader/login", replace: true });
  },
});
