import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth-panel";

export const Route = createFileRoute("/trader/login")({
  head: () => ({
    meta: [
      { title: "Trader sign in — TRONDESK" },
      {
        name: "description",
        content:
          "Sign in to your TRONDESK trader account to manage wallets, send USDT and track automatic TRC20 deposits.",
      },
      { property: "og:title", content: "Trader sign in — TRONDESK" },
      {
        property: "og:description",
        content: "Trader entrance to the TRONDESK automatic TRC20 USDT deposit desk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <AuthPanel audience="trader" mode="login" />,
});
