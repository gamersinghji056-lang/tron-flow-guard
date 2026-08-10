import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth-panel";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Administrator sign in — TRONDESK" },
      {
        name: "description",
        content:
          "Administrator entrance to the TRONDESK operations console: wallets, P2P assignments, API keys and audit logs.",
      },
      { property: "og:title", content: "Administrator sign in — TRONDESK" },
      {
        property: "og:description",
        content: "Role-based administrator access to the TRONDESK deposit operations console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <AuthPanel audience="admin" mode="login" />,
});
