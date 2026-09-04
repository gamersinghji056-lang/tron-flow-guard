import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  Bell,
  CheckCircle2,
  Clock3,
  Download,
  HandCoins,
  History,
  LockKeyhole,
  Menu,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Smartphone,
  Wallet2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { V17NavIcon, WtronLogo } from "@/components/mini-app/crypto-icons";
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
  ["About", "about"],
  ["Wallet", "wallet"],
  ["P2P", "p2p"],
  ["Trade", "trade"],
  ["Vendors", "vendors"],
  ["FAQ", "faq"],
  ["Support", "support"],
  ["Security", "security"],
] as const;

function Landing() {
  const [open, setOpen] = useState(false);
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080a0f] text-white">
      <header className="sticky top-0 z-40 border-b border-[#222837] bg-[#080a0f]/90 backdrop-blur-xl">
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
            className="ml-auto grid h-10 w-10 place-items-center rounded-[11px] border border-[#222837] bg-[#10131a] md:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open ? (
          <div className="border-t border-[#222837] bg-[#10131a] px-4 py-4 md:hidden">
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
            WTRON is built as a Telegram-native TRON wallet and P2P platform, with the same account
            ecosystem available through Web, Telegram Mini App and Android. It combines TRON Mainnet
            wallet workflows, USDT/TRX balances, P2P orders, Trade with WTRON and approved Vendor
            SELL operations without presenting prototype balances as production state.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-primary text-white hover:bg-primary/90">
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
          <Proof label="Web" value="Trader and Vendor browser UI" />
          <Proof label="Telegram" value="Mini App and bot-linked account flow" />
          <Proof label="Android" value={`Standalone app release ${WTRON_ANDROID_VERSION}`} />
          <Proof label="Backend" value="Same account, wallet and order system" />
        </div>
      </section>

      <section id="about" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-8 rounded-[30px] border border-[#222837] bg-[#10131a] p-6 shadow-[0_30px_100px_rgba(0,0,0,.35)] lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="kicker-v17">About WTRON</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              One WTRON account across Web, Telegram and Android.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-400">
              WTRON brings wallet and P2P workflows directly into Telegram alongside a responsive
              website and Android application. Traders can manage TRON Mainnet Standard wallets,
              receive and send supported assets, place P2P orders, sell directly to WTRON and track
              order history. Approved Vendors receive a separate SELL-only workspace for liquidity,
              payout accounts, listings and matched orders.
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              The public site shows product previews only. Live balances, rates, addresses,
              confirmations, vendor status and payment details come from the authenticated
              production backend after login.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <PreviewRail
              title="Web"
              body="Full Trader and Vendor routes for wallets, P2P, orders and settings."
            />
            <PreviewRail
              title="Telegram Mini App"
              body="Telegram-linked wallet and P2P flows using the same backend contracts."
            />
            <PreviewRail
              title="Android"
              body="In-app WebView shell loading /app with persistent first-party APK distribution."
            />
          </div>
        </div>
      </section>

      <FeatureSection
        id="wallet"
        eyebrow="Wallet"
        title="Mainnet wallet workflows without testnet choices."
        body="Create or import a TRON Mainnet wallet, switch wallets, view USDT/TRX balances, receive with QR, scan, send through protected server-side policy and inspect wallet-specific history."
        icon={Wallet2}
        preview={[
          "Standard and GasFree capability states",
          "Receive QR and address copy",
          "Send guarded by transaction password",
          "Wallet-specific activity history",
        ]}
      />
      <FeatureSection
        id="p2p"
        eyebrow="P2P"
        title="Real orderbook flows with proof, timers and disputes."
        body="Trader P2P uses existing marketplace, payment method, proof, chat, escrow, timer and dispute logic. Vendor accounts remain separated from buyer functionality."
        icon={Banknote}
        preview={[
          "Buy and sell tabs for Traders",
          "Counterparty profile and ranking inputs",
          "Payment proof and UTR capture",
          "Dispute state retained in orders",
        ]}
        flip
      />
      <FeatureSection
        id="trade"
        eyebrow="Trade with WTRON"
        title="Direct company sell orders with assigned Mainnet addresses."
        body="WTRON assigns the configured company receiving wallet and the existing listener verifies TRC20 USDT deposits before settlement state advances."
        icon={HandCoins}
        preview={[
          "Company receiving address assignment",
          "TRC20 deposit confirmation tracking",
          "INR payout method selection",
          "Separate settlement states",
        ]}
      />
      <FeatureSection
        id="vendors"
        eyebrow="Vendor"
        title="Approved vendors operate SELL-only tools."
        body="Vendor approval, wallet setup, payment accounts, sell listings, reservations, order review and history stay in a separate role-aware interface."
        icon={History}
        preview={[
          "Vendor approval gate",
          "SELL listing creation",
          "Payment account rails",
          "Order review and confirmation",
        ]}
        flip
      />
      <FeatureSection
        id="security"
        eyebrow="Security"
        title="Backend authority remains the source of truth."
        body="Transaction passwords, signer authorization, idempotency, fee reconciliation, RBAC, domain routing and listener architecture remain enforced server-side."
        icon={ShieldCheck}
        preview={[
          "Mainnet transfer policy checks",
          "Signer authorization",
          "Idempotent order actions",
          "Admin isolation and RBAC",
        ]}
      />

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
        <div className="mt-6 divide-y divide-[#222837] rounded-[17px] border border-[#222837] bg-[#10131a]">
          {[
            [
              "What is WTRON?",
              "WTRON is a TRON Mainnet wallet and USDT trading platform for Traders and approved Vendors. It combines self-custody wallet workflows, P2P order handling, direct Trade with WTRON and role-aware Vendor SELL operations under the same authenticated backend.",
            ],
            [
              "Where can I use WTRON?",
              "WTRON is designed for three production experiences: the website, the Telegram Mini App/bot-linked flow and the Android application. These access paths use the same account ecosystem rather than separate demo backends.",
            ],
            [
              "Which network does the wallet use?",
              "Normal user wallet creation and import use TRON Mainnet in the production UX. Historical Nile/testnet records may still exist internally, but normal Traders and Vendors are not asked to choose Nile or testnet when creating or importing a production wallet.",
            ],
            [
              "Which assets are shown?",
              "The wallet UI focuses on TRC20 USDT and native TRX. USDT is the primary trading asset, while TRX is used by normal TRON wallets for network resources and transaction costs where applicable.",
            ],
            [
              "What is a Standard wallet?",
              "A Standard wallet is a normal TRON Mainnet wallet managed through WTRON’s protected wallet flow. Send actions remain subject to transaction password checks, signer authorization, balance/resource requirements, active-send protection and server-side transfer controls.",
            ],
            [
              "What is GasFree?",
              "GasFree is a wallet capability for supported USDT transfers when the configured provider and the selected wallet are ready. WTRON does not show GasFree as available unless provider configuration and wallet capability checks support it.",
            ],
            [
              "How does recovery phrase import work?",
              "A valid WTRON Standard wallet recovery phrase is deterministically derived using the same TRON derivation path. The same phrase and derivation path recover the same underlying TRON address on another WTRON installation or wallet entry.",
            ],
            [
              "Can WTRON support see my recovery phrase?",
              "No. Recovery phrases and private keys must never be sent to support, admins or counterparties. WTRON’s admin surfaces are designed not to expose wallet seed phrases, private keys or transaction passwords.",
            ],
            [
              "Can Traders buy USDT?",
              "Yes, Traders can use supported P2P BUY flows and approved Vendor marketplace flows where available. Orders use the existing marketplace, reservation, payment proof, UTR and dispute logic.",
            ],
            [
              "Can Traders sell USDT?",
              "Traders can create supported P2P SELL ads and can also use Trade with WTRON to sell USDT directly to the company flow where configured. Settlement state depends on real order and blockchain confirmation logic.",
            ],
            [
              "Can Vendors buy USDT?",
              "No. Vendor accounts are SELL-only. Vendor registration, approval, payout accounts, liquidity listings and matched orders are separated from Trader buyer functionality by role-aware UI and backend policy.",
            ],
            [
              "Why does Vendor approval matter?",
              "Vendor tools affect marketplace liquidity and payout capacity, so the Vendor workspace remains blocked until the account is approved. Pending Vendors can sign in to see status but do not receive operational SELL tools until approval.",
            ],
            [
              "How are deposits confirmed?",
              "Deposit and direct-trade screens rely on WTRON’s existing TRON listener to verify real on-chain transfers. The assigned address, token, network, transaction receipt and confirmation count must match before settlement state advances.",
            ],
            [
              "How do P2P orders work?",
              "Trader P2P uses live marketplace rows and order state. A buyer or seller follows the order timer, uses saved payment rails where required, submits proof or UTR in the order flow and can open a dispute from the relevant order if something goes wrong.",
            ],
            [
              "How should I judge a seller?",
              "WTRON surfaces available profile, completion and order metrics where implemented, but users should still review order terms and keep all communication and proof inside the WTRON flow. Verification indicators are product state, not a guarantee of future behavior.",
            ],
            [
              "How do direct WTRON trades work?",
              "Trade with WTRON creates a direct order and assigns the configured company receiving address for the supported asset. Blockchain confirmation and payout state are tracked separately through the existing order logic.",
            ],
            [
              "Where do I add payment methods?",
              "Use Bank Accounts or Payment Methods after login. Vendor payment accounts remain separate from Trader payout methods.",
            ],
            [
              "What protects wallet actions?",
              "Sensitive wallet actions keep transaction-password validation, server-side wallet ownership checks, signer authorization, idempotency and explicit transfer controls. The public website does not expose private operational details or secrets.",
            ],
            [
              "Can support ask for my seed phrase?",
              "No. Treat any request for your recovery phrase, private key or transaction password as unsafe. Support can help with account and order issues, but secrets should remain only with the wallet owner.",
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
              "Direct Sell assigns a company TRON receiving address and tracks the expected USDT deposit through the listener. Payout and blockchain confirmation are separate states so the UI should not mark settlement complete before the underlying events happen.",
            ],
            [
              "Does Android use the same account?",
              "Yes. The Android app opens the `/app` entry inside the WTRON app shell and uses the same production account/session flow as wtron.org. It should not display browser chrome or claim Play Store availability.",
            ],
            [
              "Does Telegram use a separate backend?",
              "No. The Telegram Mini App links Telegram access to existing WTRON accounts and uses the same production functions, while Telegram-specific verification and handoff behavior remain isolated from normal web authentication.",
            ],
            ["Is there a Play Store listing?", "No. Android distribution is first-party for now."],
            [
              "Where is the Android APK?",
              "The download page uses WTRON’s first-party release flow and should link the signed APK only after the release asset is published. Unsigned builds may be useful for testing, but they are not presented as the production signed release.",
            ],
            [
              "How do I contact support?",
              "Use the listed WTRON support contact and keep payment proof, UTRs, screenshots and dispute messages inside the relevant WTRON order whenever possible. Never move order evidence into private channels unless support explicitly instructs you without requesting secrets.",
            ],
          ].map(([question, answer]) => (
            <details key={question} className="group p-5">
              <summary className="cursor-pointer list-none font-medium">{question}</summary>
              <p className="mt-2 text-sm leading-6 text-slate-400">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="support" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-5 rounded-[17px] border border-[#222837] bg-[#10131a] p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Contact / Support
            </p>
            <h2 className="mt-3 text-3xl font-semibold">Get help with WTRON orders and access.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              For wallet, account, vendor approval or order/payment issues, use the existing WTRON
              support channel and keep proof, UTR, screenshots and dispute messages inside the
              matching WTRON order whenever the app provides that flow.
            </p>
          </div>
          <a
            href="https://t.me/laura_luxee"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Telegram @laura_luxee
          </a>
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
            <a href="#about">About</a>
            <a href="#faq">FAQ</a>
            <a href="#support">Support</a>
            <a href="#support">Contact</a>
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
    <div className="rounded-[17px] border border-[#222837] bg-[#10131a] p-5">
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

function PreviewRail({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[17px] border border-[#222837] bg-[#151925] p-4">
      <p className="text-[13px] font-semibold">{title}</p>
      <p className="mt-2 text-[11px] leading-5 text-slate-400">{body}</p>
    </div>
  );
}

function ProductPreview() {
  const actions = [
    { icon: "wallet", label: "Wallet" },
    { icon: "p2p", label: "P2P" },
    { icon: "trade", label: "Trade" },
    { icon: "orders", label: "Orders" },
  ];
  return (
    <div className="mx-auto w-full max-w-[430px] rounded-[30px] border border-[#151a24] bg-[#080a0f] p-3 shadow-[0_30px_100px_rgba(0,0,0,.55)]">
      <div className="rounded-[24px] border border-[#222837] bg-[#080a0f] p-4">
        <div className="flex items-center justify-between">
          <WtronLogo markClassName="h-8 w-8" textClassName="font-semibold" />
          <span className="rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs text-primary">
            TRON Mainnet
          </span>
        </div>
        <div className="mt-6 rounded-[17px] border border-[#222837] bg-[#10131a] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Total assets</p>
              <p className="mt-2 text-2xl font-semibold">Live after login</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <span className="rounded-xl bg-black/30 p-3 text-slate-300">USDT / TRX balances</span>
            <span className="rounded-xl bg-black/30 p-3 text-slate-300">Mainnet only UX</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs text-slate-300">
          {actions.map(({ icon, label }) => (
            <div key={label}>
              <span className="mx-auto grid h-[45px] w-[45px] place-items-center rounded-[14px] border border-[#222837] bg-[#10131a] text-[#7ba0ff]">
                <V17NavIcon
                  name={icon as "wallet" | "p2p" | "trade" | "orders"}
                  className="h-5 w-5"
                />
              </span>
              <span className="mt-2 block">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2">
          {[
            { label: "Receive", icon: QrCode },
            { label: "Payment proof", icon: Clock3 },
            { label: "Notifications", icon: Bell },
          ].map(({ label, icon: Icon }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-[17px] border border-[#222837] bg-[#10131a] p-3 text-sm"
            >
              <Icon className="h-4 w-4 text-primary" />
              <span className="flex-1 text-slate-300">{label}</span>
              <CheckCircle2 className="h-4 w-4 text-primary" />
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
  preview,
  flip = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: typeof Wallet2;
  preview: string[];
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
        className={`rounded-2xl border border-white/10 bg-white/[0.035] p-5 ${
          flip ? "lg:order-1" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Icon className="h-6 w-6" />
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400">
            Production flow
          </span>
        </div>
        <div className="mt-5 grid gap-2">
          {preview.map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-slate-300"
            >
              <LockKeyhole className="h-4 w-4 shrink-0 text-primary" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
