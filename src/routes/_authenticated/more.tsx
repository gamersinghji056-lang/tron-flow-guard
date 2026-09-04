import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  BookOpenText,
  CreditCard,
  FileText,
  HelpCircle,
  History,
  KeyRound,
  ListOrdered,
  MessageCircle,
  Shield,
  UserRound,
  Wallet2,
} from "lucide-react";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/more")({
  head: () => ({ meta: [{ title: "More - WTRON" }] }),
  component: MorePage,
});

const items = [
  { to: "/orders", label: "Orders", icon: ListOrdered },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/bank-accounts", label: "Bank Accounts", icon: CreditCard },
  { to: "/payment-methods", label: "Payment Methods", icon: CreditCard },
  { to: "/history", label: "History", icon: History },
  { to: "/wallet", label: "Wallets", icon: Wallet2 },
  { to: "/deposits", label: "Deposits", icon: FileText },
  { to: "/profile-security", label: "Profile", icon: UserRound },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile-security", label: "Security", icon: Shield },
  { to: "/referral", label: "Referral", icon: KeyRound },
];

function MorePage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="More"
        description="Orders, analytics, payment methods and account tools."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="panel flex min-h-20 items-center gap-3 p-4 transition-colors hover:bg-white/8"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/8">
              <item.icon className="h-5 w-5 text-primary" />
            </span>
            <span className="min-w-0 font-medium">{item.label}</span>
          </Link>
        ))}
      </div>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="panel p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/15 text-primary">
              <HelpCircle className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">Support / Help</h2>
              <p className="text-sm text-muted-foreground">
                For order or payment issues, keep proof and messages inside WTRON order flows.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-300">
            <p>Use Orders for P2P proof, vendor payments, direct-sell status and disputes.</p>
            <p>Use Notifications and History to review account activity and settlement updates.</p>
            <p>
              Contact support on Telegram{" "}
              <a className="text-primary hover:text-primary/80" href="https://t.me/laura_luxee">
                @laura_luxee
              </a>
              . Never share your recovery phrase, private key or transaction password.
            </p>
          </div>
        </div>

        <div className="panel p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/15 text-primary">
              <BookOpenText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">FAQ</h2>
              <p className="text-sm text-muted-foreground">
                Mainnet wallet, P2P, direct sell and account safety basics.
              </p>
            </div>
          </div>
          <div className="mt-4 divide-y divide-white/10 text-sm">
            {[
              [
                "Which network is used?",
                "Normal WTRON wallet creation and import use TRON Mainnet.",
              ],
              [
                "What is GasFree?",
                "GasFree appears only when the wallet and configured provider support the USDT flow.",
              ],
              ["Where do I add payout details?", "Use Bank Accounts or Payment Methods."],
              ["Can Vendors buy?", "No. Vendor accounts remain SELL-only."],
              ["Where are disputes handled?", "Open the related order and submit proof there."],
              [
                "Can Admin see my keys?",
                "No. Admin operations must not expose seed phrases, private keys or transaction passwords.",
              ],
            ].map(([question, answer]) => (
              <details key={question} className="py-3">
                <summary className="cursor-pointer font-medium">{question}</summary>
                <p className="mt-1 text-muted-foreground">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Legal</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-slate-300"
            to="/terms"
          >
            Terms
          </Link>
          <Link
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-slate-300"
            to="/privacy"
          >
            Privacy
          </Link>
          <Link
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-slate-300"
            to="/risk-disclosure"
          >
            Risk Disclosure
          </Link>
          <Link
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-slate-300"
            to="/mini-app"
            search={{ tab: "home", auth: "login", handoff: undefined }}
          >
            <MessageCircle className="mr-1.5 inline h-4 w-4 align-text-bottom" />
            Telegram Mini App
          </Link>
        </div>
      </section>
    </div>
  );
}
