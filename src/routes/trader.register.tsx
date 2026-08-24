import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth-panel";

export const Route = createFileRoute("/trader/register")({
  head: () => ({
    meta: [
      { title: "Create a trader account - WTRON" },
      {
        name: "description",
        content:
          "Register a WTRON trader account to create TRC20 wallets and receive automatically verified USDT deposits.",
      },
      { property: "og:title", content: "Create a trader account - WTRON" },
      {
        property: "og:description",
        content: "Trader registration for the WTRON automatic deposit verification desk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <AuthPanel audience="trader" mode="register" />,
});
