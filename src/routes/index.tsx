import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  Download,
  HandCoins,
  History,
  Menu,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Wallet2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WtronLogo } from "@/components/mini-app/crypto-icons";
import { WTRON_ANDROID_VERSION } from "@/lib/app-release";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WTRON - TRON Wallet and USDT Trading" },
      {
        name: "description",
        content:
          "WTRON combines TRON Mainnet wallets, P2P orders, direct WTRON trades and approved vendor operations.",
      },
    ],
    links: [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
  }),
  component: Landing,
});

const nav = [
  ["Wallet", "wallet"],
  ["P2P", "p2p"],
  ["Trade", "trade"],
  ["Vendors", "vendors"],
  ["Security", "security"],
] as const;

function Landing() {
  const [open, setOpen] = useState(false);
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050505] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2" aria-label="WTRON home">
            <WtronLogo markClassName="h-10 w-10" textClassName="text-lg font-semibold" />
          </Link>
          <nav className="ml-10 hidden items-center gap-6 text-sm font-medium text-slate-400 lg:flex">
            {nav.map(([label, id]) => (
              <a key={id} href={`#${id}`} className="hover:text-white">
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Button asChild variant="ghost" size="sm">
              <Link to="/trader/login">Trader Login</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/vendor/login">Vendor Login</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/download/android">
                <Download className="mr-1.5 h-4 w-4" />
                Download App
              </Link>
            </Button>
          </div>
          <button
            className="ml-auto grid h-10 w-10 place-items-center rounded-md border border-white/10 md:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open ? (
          <div className="border-t border-white/10 bg-[#090909] px-4 py-4 md:hidden">
            <div className="grid gap-1 text-sm">
              {nav.map(([label, id]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="rounded-md px-3 py-2 text-slate-300 hover:bg-white/5"
                  onClick={() => setOpen(false)}
                >
                  {label}
                </a>
              ))}
            </div>
            <div className="mt-3 grid gap-2">
              <Button asChild>
                <Link to="/download/android">Download WTRON App</Link>
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="secondary">
                  <Link to="/trader/login">Trader Login</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/vendor/login">Vendor Login</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1fr_0.85fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold tracking-[0.22em] text-primary uppercase">
            TRON Mainnet wallet + USDT trading
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl">
            WTRON
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            A production TRON platform for Mainnet wallets, P2P marketplace orders, direct WTRON
            company trades and approved vendor sell operations.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-red-600 text-white hover:bg-red-500">
              <Link to="/trader/register">
                Create Trader Account <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/download/android">
                <Smartphone className="mr-2 h-4 w-4" />
                Download WTRON App
              </Link>
            </Button>
          </div>
          <div className="mt-5 flex flex-wrap gap-4 text-sm font-medium">
            <Link to="/trader/login" className="text-slate-300 hover:text-white">
              Trader Login
            </Link>
            <Link to="/vendor/register" className="text-slate-300 hover:text-white">
              Register Vendor
            </Link>
            <Link
              to="/mini-app"
              search={{ tab: "home", auth: "login", handoff: undefined }}
              className="inline-flex items-center text-slate-300 hover:text-white"
            >
              Telegram Mini App <MessageCircle className="ml-1.5 h-4 w-4" />
            </Link>
          </div>
        </div>
        <ProductPreview />
      </section>

      <section className="border-y border-white/10 bg-white/[0.035]">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:px-6 md:grid-cols-4">
          <Proof label="Network" value="TRON Mainnet" />
          <Proof label="Wallet" value="Create, import, send, receive" />
          <Proof label="Trading" value="P2P and direct WTRON sell" />
          <Proof label="Android" value={`Release ${WTRON_ANDROID_VERSION}`} />
        </div>
      </section>

      <FeatureSection
        id="wallet"
        eyebrow="Wallet"
        title="Mainnet wallet workflows without testnet choices."
        body="Create or import a TRON Mainnet wallet, switch wallets, view USDT/TRX balances, receive with QR, scan, send through protected server-side policy and inspect wallet-specific history."
        icon={Wallet2}
      />
      <FeatureSection
        id="p2p"
        eyebrow="P2P"
        title="Real orderbook flows with proof, timers and disputes."
        body="Trader P2P uses existing marketplace, payment method, proof, chat, escrow, timer and dispute logic. Vendor accounts remain separated from buyer functionality."
        icon={Banknote}
        flip
      />
      <FeatureSection
        id="trade"
        eyebrow="Trade with WTRON"
        title="Direct company sell orders with assigned Mainnet addresses."
        body="WTRON assigns the configured company receiving wallet and the existing listener verifies TRC20 USDT deposits before settlement state advances."
        icon={HandCoins}
      />
      <FeatureSection
        id="vendors"
        eyebrow="Vendor"
        title="Approved vendors operate SELL-only tools."
        body="Vendor approval, wallet setup, payment accounts, sell listings, reservations, order review and history stay in a separate role-aware interface."
        icon={History}
        flip
      />
      <FeatureSection
        id="security"
        eyebrow="Security"
        title="Backend authority remains the source of truth."
        body="Transaction passwords, signer authorization, idempotency, fee reconciliation, RBAC, domain routing and listener architecture remain enforced server-side."
        icon={ShieldCheck}
      />

      <section id="about" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            About WTRON
          </p>
          <h2 className="mt-3 text-3xl font-semibold">Built for real TRON operations.</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
            WTRON keeps public website, Trader web UI, Vendor portal, Telegram Mini App and Android
            entry aligned around the same production backend. Operational data appears only after
            authentication from live account, wallet, order and listener state.
          </p>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.035] px-4 py-14 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
          <FlowCard
            title="Trader flow"
            steps={[
              "Create or import a Mainnet wallet",
              "Add UPI or bank payout details",
              "Use P2P, Trade with WTRON, Send or Receive",
              "Track orders, confirmations and history",
            ]}
          />
          <FlowCard
            title="Vendor flow"
            steps={[
              "Register and wait for approval",
              "Configure wallet and receiving accounts",
              "Create SELL listings only",
              "Review orders, proof and settlement state",
            ]}
          />
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">FAQ</p>
        <h2 className="mt-3 text-3xl font-semibold">Common WTRON questions</h2>
        <div className="mt-6 divide-y divide-white/10 rounded-lg border border-white/10 bg-white/[0.035]">
          {[
            ["What is WTRON?", "A production TRON wallet and USDT trading platform."],
            ["What network does WTRON use?", "Normal user wallet UX is TRON Mainnet."],
            ["Can Traders buy USDT?", "Trader P2P and vendor inventory flows are role-controlled."],
            ["Can Vendors buy USDT?", "Vendors are SELL-only and do not receive buyer controls."],
            [
              "How are deposits confirmed?",
              "The existing listener verifies real on-chain transfers.",
            ],
            [
              "Does WTRON show fake balances?",
              "No. Account data loads from authenticated backend state.",
            ],
            [
              "Is Admin publicly linked?",
              "No. Admin remains isolated from the public website CTAs.",
            ],
            [
              "How does Direct Sell work?",
              "WTRON assigns a company address and tracks confirmation.",
            ],
            [
              "Are transaction passwords required?",
              "Protected wallet actions still require server validation.",
            ],
            ["Does GasFree always work?", "GasFree availability depends on provider readiness."],
            ["Is there a Play Store listing?", "Android distribution is first-party for now."],
            [
              "Where is the Android APK?",
              "The download page links it only after the artifact is published.",
            ],
          ].map(([question, answer]) => (
            <details key={question} className="group p-5">
              <summary className="cursor-pointer list-none font-medium">{question}</summary>
              <p className="mt-2 text-sm leading-6 text-slate-400">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.035] px-4 py-14 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-primary uppercase">Android</p>
            <h2 className="mt-2 text-3xl font-semibold">Install WTRON on Android</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Android distribution is first-party for now. The download page exposes the release
              version and only links the APK when the signed artifact is present.
            </p>
          </div>
          <Button asChild size="lg">
            <Link to="/download/android">
              <Download className="mr-2 h-4 w-4" />
              Download WTRON App
            </Link>
          </Button>
        </div>
      </section>

      <footer className="px-4 py-8 text-slate-400 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center">
          <WtronLogo markClassName="h-8 w-8" textClassName="font-semibold text-white" />
          <div className="flex flex-wrap gap-4 text-sm md:ml-auto">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/risk-disclosure">Risk Disclosure</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FlowCard({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#050505] p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="mono text-primary">{String(index + 1).padStart(2, "0")}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ProductPreview() {
  return (
    <div className="mx-auto w-full max-w-[430px] rounded-[28px] border border-white/10 bg-[#0b0b0b] p-3 shadow-[0_40px_120px_-70px_rgba(240,68,68,0.7)]">
      <div className="rounded-[22px] border border-white/10 bg-[#050505] p-5">
        <div className="flex items-center justify-between">
          <WtronLogo markClassName="h-8 w-8" textClassName="font-semibold" />
          <span className="rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs text-primary">
            TRON Mainnet
          </span>
        </div>
        <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs text-slate-500">Production wallet</p>
          <p className="mt-2 text-2xl font-semibold">Send / Receive / Trade</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Live balances, orders and transaction states load only after authentication.
          </p>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-3 text-center text-xs text-slate-300">
          {[
            { icon: Wallet2, label: "Wallet" },
            { icon: Banknote, label: "P2P" },
            { icon: HandCoins, label: "Trade" },
            { icon: History, label: "Orders" },
          ].map(({ icon: PreviewIcon, label }) => (
            <div key={label}>
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white/8 text-primary">
                <PreviewIcon className="h-4 w-4" />
              </span>
              <span className="mt-2 block">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Proof({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-base font-medium text-white">{value}</p>
    </div>
  );
}

function FeatureSection({
  id,
  eyebrow,
  title,
  body,
  icon: Icon,
  flip = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: typeof Wallet2;
  flip?: boolean;
}) {
  return (
    <section
      id={id}
      className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-center"
    >
      <div className={flip ? "lg:order-2" : undefined}>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold leading-tight text-white sm:text-4xl">
          {title}
        </h2>
        <p className="mt-5 max-w-xl text-sm leading-7 text-slate-400">{body}</p>
      </div>
      <div
        className={`rounded-lg border border-white/10 bg-white/[0.035] p-6 ${
          flip ? "lg:order-1" : ""
        }`}
      >
        <span className="grid h-12 w-12 place-items-center rounded-lg bg-primary/15 text-primary">
          <Icon className="h-6 w-6" />
        </span>
        <div className="mt-8 h-2 rounded-full bg-white/8">
          <div className="h-full w-2/3 rounded-full bg-primary" />
        </div>
        <div className="mt-4 grid gap-2">
          <div className="h-10 rounded-md border border-white/10 bg-black/30" />
          <div className="h-10 rounded-md border border-white/10 bg-black/30" />
          <div className="h-10 rounded-md border border-white/10 bg-black/30" />
        </div>
      </div>
    </section>
  );
}
