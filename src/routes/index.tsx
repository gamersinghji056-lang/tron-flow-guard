import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  History,
  Menu,
  ShieldCheck,
  Wallet2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WtronLogo } from "@/components/mini-app/crypto-icons";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WTRON - TRON Wallet and USDT Trading" },
      {
        name: "description",
        content:
          "WTRON combines self-custody TRON wallets, structured USDT trading, P2P orders, direct sell workflows and approved vendor operations.",
      },
    ],
    links: [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
  }),
  component: Landing,
});

const nav = [
  ["Product", "product"],
  ["Wallet", "wallet"],
  ["P2P", "p2p"],
  ["WTRON Trade", "trade"],
  ["Vendors", "vendors"],
  ["Security", "security"],
  ["How It Works", "how"],
  ["About", "about"],
  ["FAQ", "faq"],
] as const;

function Landing() {
  const [open, setOpen] = useState(false);
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7faf9] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2" aria-label="WTRON home">
            <WtronLogo markClassName="h-9 w-9" textClassName="text-lg font-semibold" />
          </Link>
          <nav className="ml-10 hidden items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
            {nav.map(([label, id]) => (
              <a key={id} href={`#${id}`} className="hover:text-slate-950">
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Button asChild variant="ghost" size="sm">
              <Link to="/trader/login">Trader Login</Link>
            </Button>
            <Button asChild size="sm" className="bg-red-600 text-white hover:bg-red-500">
              <Link to="/trader/register">Create Account</Link>
            </Button>
          </div>
          <button
            className="ml-auto grid h-10 w-10 place-items-center rounded-lg border border-slate-200 md:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open ? (
          <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
            <div className="grid gap-1 text-sm">
              {nav.map(([label, id]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="rounded-lg px-3 py-2 text-slate-700"
                  onClick={() => setOpen(false)}
                >
                  {label}
                </a>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button asChild variant="secondary">
                <Link to="/trader/login">Trader Login</Link>
              </Button>
              <Button asChild className="bg-red-600 text-white hover:bg-red-500">
                <Link to="/trader/register">Create Account</Link>
              </Button>
            </div>
          </div>
        ) : null}
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-red-600">
            TRON wallet + USDT trading
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            TRON Wallet. USDT Trading. One WTRON Platform.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            A focused TRON wallet and USDT trading product for users who need on-chain visibility,
            P2P settlement, direct company trades and approved vendor workflows in one place.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-red-600 text-white hover:bg-red-500">
              <Link to="/trader/register">
                Create Trader Account <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-slate-300 bg-white text-slate-950 hover:bg-slate-100 hover:text-slate-950"
            >
              <Link to="/trader/login">Trader Login</Link>
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
            <Link
              to="/vendor/login"
              className="inline-flex items-center text-violet-700 hover:text-violet-900"
            >
              Vendor Login <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
            <Link
              to="/vendor/register"
              className="inline-flex items-center text-slate-600 hover:text-slate-950"
            >
              Register Vendor <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>
        <ProductPreview />
      </section>

      <section id="product" className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:px-6 md:grid-cols-4">
          <Proof label="Wallets" value="General + GasFree views" />
          <Proof label="Network" value="TRON / TRC20" />
          <Proof label="Trading" value="P2P + Direct Sell" />
          <Proof label="Operations" value="Vendor and audit tools" />
        </div>
      </section>

      <FeatureSection
        id="wallet"
        eyebrow="Wallet"
        title="Self-custody wallet visibility without mixing platform balances."
        body="Create or import a TRON wallet, refresh public balances, inspect TRX resources, receive USDT and review wallet-specific history. GasFree child wallets remain linked to the same wallet group while keeping balances and history separate."
        icon={Wallet2}
        items={["General wallet", "GasFree wallet view", "USDT/TRX balances", "Wallet history"]}
      />
      <FeatureSection
        id="p2p"
        eyebrow="P2P"
        title="Structured USDT marketplace flows for repeat trading."
        body="Buy and sell USDT using saved payment methods, clear limits, order state, proof collection and dispute-aware settlement logic."
        icon={Banknote}
        items={["Offer discovery", "Payment method detail", "Order state", "History"]}
        flip
      />
      <FeatureSection
        id="trade"
        eyebrow="WTRON Trade"
        title="Direct company sell orders with assigned deposit addresses."
        body="Direct Sell shows the exact USDT amount, TRON network, assigned WTRON deposit address, QR, payout method and payment progress after blockchain confirmation."
        icon={History}
        items={["Assigned address", "TRC20 QR", "Confirmation tracking", "INR progress"]}
      />
      <FeatureSection
        id="vendors"
        eyebrow="Vendor Network"
        title="Approved vendors operate through controlled trading workflows."
        body="Vendor access is separated from user trading, with approval, listings, liquidity controls and order management built for operational review."
        icon={Building2}
        items={["Vendor approval", "Listings", "Order controls", "Settlement history"]}
        flip
      />
      <FeatureSection
        id="security"
        eyebrow="Security"
        title="Sensitive wallet actions stay behind server-side authorization."
        body="Transaction passwords, idempotency, replay protection, on-chain verification and role-based admin operations are preserved. Normal Mainnet signing remains disabled unless explicitly configured."
        icon={ShieldCheck}
        items={["Transaction password", "Replay protection", "RBAC", "On-chain checks"]}
      />

      <section id="about" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1fr] lg:items-start">
          <SectionTitle
            eyebrow="About WTRON"
            title="A TRON-focused wallet and USDT trading platform."
          />
          <div className="space-y-5 text-base leading-7 text-slate-600">
            <p>
              WTRON combines self-custody TRON wallets, General and GasFree wallet visibility,
              structured P2P USDT trading, direct WTRON company trading, approved vendor operations,
              blockchain verification, transaction history and payment-method management.
            </p>
            <p>
              The product separates public chain visibility from transfer capability. Users can
              inspect wallet balances and histories without WTRON claiming unsupported guarantees,
              fake confirmations or unavailable sponsorship.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "Self-custody TRON wallet views",
                "General + GasFree wallet relationship",
                "P2P and direct company trading",
                "Vendor marketplace with approval",
                "On-chain confirmation tracking",
                "Payment method and order history",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="bg-[#07110e] px-4 py-16 text-white sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1fr]">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.12em] text-violet-300">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Clear workflows for traders and approved vendors.
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <HowList
              title="Trader flow"
              steps={[
                "Register Trader",
                "Link Telegram",
                "Open Mini App",
                "Create or import wallet",
                "Add UPI or bank account",
                "Use P2P or WTRON Trade",
                "Follow exact deposit/payment instructions",
                "Track order and blockchain confirmation",
                "Review wallet and trade history",
                "Manage security and settings",
              ]}
            />
            <HowList
              title="Vendor flow"
              steps={[
                "Register Vendor",
                "Telegram identity linked",
                "Wait for admin approval",
                "Login after approval",
                "Configure wallet",
                "Add receiving bank/UPI accounts",
                "Set min/max limits",
                "Create USDT listing",
                "Manage reservations and orders",
                "Review payment proof",
                "Confirm or dispute",
                "Track history and settings",
              ]}
            />
          </div>
          <div className="hidden">
            {[
              "Create or import a TRON wallet.",
              "Choose Wallet, P2P, WTRON Trade or Vendor flow.",
              "Follow the exact network, amount and payment instructions.",
              "Track confirmations, payment progress and history.",
            ].map((step, index) => (
              <div key={step} className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
                <span className="text-sm text-emerald-300">0{index + 1}</span>
                <p className="mt-3 text-base leading-7 text-slate-200">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <SectionTitle eyebrow="FAQ" title="Common WTRON questions" />
        <div className="mt-8 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {[
            [
              "What is WTRON?",
              "WTRON is a TRON-focused wallet and USDT trading platform for wallet visibility, P2P orders, direct company trades and vendor operations.",
            ],
            [
              "What is TRC20 USDT?",
              "TRC20 USDT is Tether issued on the TRON network. WTRON displays and tracks official TRON USDT flows.",
            ],
            [
              "Does WTRON support TRC20 USDT?",
              "Yes. WTRON is designed around TRON/TRC20 USDT wallet and trading workflows.",
            ],
            [
              "What is the difference between General and GasFree Wallet?",
              "The General wallet is the normal TRON wallet. The GasFree wallet is a deterministic related wallet view; transfer readiness depends on provider setup.",
            ],
            [
              "Can I use the same recovery phrase elsewhere?",
              "Yes. WTRON uses standard TRON derivation for the General wallet; protect the phrase because it controls funds.",
            ],
            [
              "How does WTRON P2P work?",
              "Users trade against offers with clear limits, proof collection, order state and dispute-aware settlement.",
            ],
            [
              "How does Sell to WTRON work?",
              "WTRON assigns a company deposit address and shows exact USDT, network, QR and payout details.",
            ],
            [
              "How are blockchain deposits confirmed?",
              "Existing listeners detect real TRON transfers and wait for required confirmations before status advances.",
            ],
            [
              "What happens during a dispute?",
              "The order is held for review and authorized operators can resolve it according to recorded evidence.",
            ],
            [
              "What is a Vendor?",
              "A Vendor is an approved operator that can publish USDT listings and manage reservations through controlled tools.",
            ],
            [
              "Why does Vendor registration require approval?",
              "Vendor tools affect marketplace liquidity and payment operations, so WTRON requires admin review first.",
            ],
            [
              "How are transaction fees displayed?",
              "Applicable WTRON and provider fees are shown before protected transfer actions and recorded server-side.",
            ],
            [
              "What if the GasFree provider is unavailable?",
              "The GasFree wallet can still show public chain assets/history, but GasFree Send stays disabled until provider readiness returns.",
            ],
            [
              "How do I protect my wallet?",
              "Never share your recovery phrase, private key, transaction password or Telegram login messages.",
            ],
            [
              "Where can I see history?",
              "Wallet, P2P, Direct Sell and vendor histories are available in the relevant app sections.",
            ],
            [
              "How do I contact support?",
              "Use Telegram @laura_luxee for WTRON support and vendor inquiries.",
            ],
          ].map(([question, answer]) => (
            <details key={question} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {question}
                <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-600">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="contact" className="border-t border-slate-200 bg-white px-4 py-12 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold">Contact WTRON</h2>
            <p className="mt-2 text-slate-600">
              For support and vendor inquiries, contact WTRON on Telegram.
            </p>
          </div>
          <a
            className="font-medium text-emerald-700"
            href="https://t.me/laura_luxee"
            target="_blank"
            rel="noreferrer"
          >
            Telegram @laura_luxee
          </a>
        </div>
      </section>

      <footer className="bg-slate-950 px-4 py-8 text-slate-300 sm:px-6">
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

function ProductPreview() {
  return (
    <div className="mx-auto w-full max-w-[430px] rounded-[28px] border border-slate-200 bg-slate-950 p-3 shadow-2xl shadow-emerald-900/20">
      <div className="rounded-[22px] bg-[#07110e] p-5 text-white">
        <div className="flex items-center justify-between">
          <WtronLogo markClassName="h-8 w-8" textClassName="font-semibold" />
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
            TRON Mainnet
          </span>
        </div>
        <div className="mt-8">
          <p className="text-xs text-slate-400">Portfolio balance</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">15.00 USDT</p>
          <p className="mt-1 text-sm text-slate-400">7.954209 TRX</p>
        </div>
        <div className="mt-6 grid grid-cols-4 gap-3 text-center text-xs text-slate-300">
          {[
            { icon: Wallet2, label: "Send" },
            { icon: Zap, label: "Receive" },
            { icon: Banknote, label: "Trade" },
            { icon: History, label: "History" },
          ].map(({ icon: PreviewIcon, label }) => {
            return (
              <div key={String(label)}>
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white/8 text-emerald-300">
                  <PreviewIcon className="h-4 w-4" />
                </span>
                <span className="mt-2 block">{label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-7 divide-y divide-white/10">
          {[
            ["USDT", "15.00 USDT", "TRC20"],
            ["TRX", "7.954209 TRX", "Resources"],
            ["GasFree", "Wallet Ready", "Transfers setup required"],
          ].map(([name, value, meta]) => (
            <div key={name} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">{name}</p>
                <p className="text-xs text-slate-500">{meta}</p>
              </div>
              <p className="font-medium tabular-nums">{value}</p>
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
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-base font-medium text-slate-950">{value}</p>
    </div>
  );
}

function HowList({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <h3 className="text-lg font-semibold">{title}</h3>
      <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="text-violet-300 tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-sm font-medium uppercase tracking-[0.12em] text-red-600">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
        {title}
      </h2>
    </div>
  );
}

function FeatureSection({
  id,
  eyebrow,
  title,
  body,
  icon: Icon,
  items,
  flip = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: typeof Wallet2;
  items: string[];
  flip?: boolean;
}) {
  return (
    <section
      id={id}
      className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center"
    >
      <div className={flip ? "lg:order-2" : undefined}>
        <SectionTitle eyebrow={eyebrow} title={title} />
        <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">{body}</p>
      </div>
      <div
        className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${flip ? "lg:order-1" : ""}`}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <Icon className="h-5 w-5" />
          </span>
          <p className="text-lg font-semibold">{eyebrow}</p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
