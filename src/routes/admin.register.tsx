import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth-panel";

export const Route = createFileRoute("/admin/register")({
  head: () => ({
    meta: [
      { title: "Administrator registration — TRONDESK" },
      {
        name: "description",
        content:
          "Register a TRONDESK administrator account. Roles are granted server-side and multiple administrators are supported.",
      },
      { property: "og:title", content: "Administrator registration — TRONDESK" },
      {
        property: "og:description",
        content: "Provision an additional TRONDESK administrator with explicit role-based access.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <AuthPanel audience="admin" mode="register" />,
});
