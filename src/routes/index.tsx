import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Menu, ShieldCheck, Wallet2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WtronLogo } from "@/components/mini-app/crypto-icons";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WTRON - Wallet, P2P and Vendor USDT Trading" },
      {
        name: "description",
        content:
          "WTRON provides TRON USDT wallets, P2P trading, direct sell orders and an approved vendor network.",
      },
    ],
  }),
  component: Landing,
});

const sections = [
  "About",
  "Features",
  "Wallet",
  "P2P",
  "WTRON Trade",
  "Vendor Network",
  "Security",
  "FAQ",
  "Contact",
];

function Landing() {
  const [open, setOpen] = useState(false);
  return (
    <main className="min-h-screen bg-[#05070B] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4">
          <Link to="/" className="flex items-center gap-2">
            <WtronLogo
              markClassName="h-8 w-8"
              textClassName="text-xl font-semibold tracking-tight"
            />
          </Link>
          <nav className="ml-8 hidden items-center gap-5 text-sm text-slate-300 lg:flex">
            {sections.map((section) => (
              <a key={section} href={`#${section.toLowerCase().replaceAll(" ", "-")}`}>
                {section}
              </a>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Button asChild variant="ghost" size="sm">
              <Link to="/trader/login">User Login</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/trader/register">User Register</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/vendor/login">Vendor Login</Link>
            </Button>
            <Button asChild size="sm" className="bg-blue-600">
              <Link to="/vendor/register">Vendor Register</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/login">Admin Login</Link>
            </Button>
          </div>
          <button className="ml-auto md:hidden" onClick={() => setOpen((value) => !value)}>
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {open ? (
          <div className="space-y-2 border-t border-white/10 px-4 py-4 md:hidden">
            {sections.map((section) => (
              <a
                key={section}
                className="block rounded-md px-3 py-2 text-sm text-slate-300"
                href={`#${section.toLowerCase().replaceAll(" ", "-")}`}
                onClick={() => setOpen(false)}
              >
                {section}
              </a>
            ))}
            <div className="grid gap-2 pt-2">
              <Button asChild className="bg-blue-600">
                <Link to="/trader/login">User Login</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/trader/register">User Register</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/vendor/login">Vendor Login</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/vendor/register">Vendor Register</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/login">Admin Login</Link>
              </Button>
            </div>
          </div>
        ) : null}
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl content-center gap-10 px-4 py-14 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-red-400">
            TRON / TRC20 USDT trading platform
          </p>
          <WtronLogo
            className="mt-4"
            markClassName="h-14 w-14"
            textClassName="text-4xl font-semibold leading-tight md:text-6xl"
          />
          <p className="mt-5 max-w-2xl text-lg text-slate-300">
            Personal TRON wallets, P2P USDT trades, direct sell orders to WTRON and an
            approved-vendor network in one operations-backed platform.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-blue-600">
              <Link to="/trader/register">Create User Account</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/vendor/register">Apply as Vendor</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-gradient-to-br from-blue-600/25 via-white/5 to-red-500/20 p-6">
          <Wallet2 className="h-10 w-10 text-blue-300" />
          <div className="mt-8 grid gap-3">
            {["Personal Wallet", "P2P Escrow", "Direct Sell", "Vendor Network"].map((item) => (
              <div key={item} className="rounded-md border border-white/10 bg-black/35 p-4">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <ContentSection id="about" title="About WTRON">
        WTRON is built for TRON USDT users who need wallet visibility, structured INR settlement
        workflows and controlled operations around deposits, direct sell orders and vendor trades.
      </ContentSection>
      <GridSection
        id="features"
        title="Features"
        items={[
          "TRON wallet creation and import",
          "TRC20 deposit monitoring",
          "P2P buy and sell workflows",
          "Direct Sell to WTRON",
          "Vendor listings and order confirmation",
          "Admin operations controls",
        ]}
      />
      <ContentSection id="wallet" title="Personal Wallet">
        Users can manage TRON wallets, receive USDT, refresh on-chain balances and keep wallet
        balances separate from platform balances.
      </ContentSection>
      <ContentSection id="p2p" title="P2P">
        P2P orders use saved payment methods, escrow state, payment proof, confirmations and
        disputes for user-to-user USDT trades.
      </ContentSection>
      <ContentSection id="wtron-trade" title="WTRON Trade">
        Direct Sell creates a company-address deposit request and tracks detection, confirmations
        and INR receivable state.
      </ContentSection>
      <ContentSection id="vendor-network" title="Vendor Network">
        Vendors self-register and only approved vendors can access trading tools, listings, orders
        and confirmations.
      </ContentSection>
      <ContentSection id="security" title="Security">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-5 w-5 text-blue-300" />
          <p>
            Sensitive actions are checked server-side. WTRON avoids exposing private keys in admin
            company-wallet monitoring and does not claim on-chain fee sweeping without a secure
            signer.
          </p>
        </div>
      </ContentSection>
      <GridSection
        id="how-it-works"
        title="How It Works"
        items={[
          "Create or import a wallet",
          "Choose P2P, Direct Sell or Vendor Trade",
          "Follow the assigned payment or deposit instructions",
          "Track status and history from the account dashboard",
        ]}
      />
      <GridSection
        id="faq"
        title="FAQ"
        items={[
          "WTRON supports TRON/TRC20 USDT workflows.",
          "Vendor accounts require admin approval.",
          "Company receiving wallets can be monitored without private keys.",
          "Legal and risk disclosures are available below.",
        ]}
      />
      <section id="contact" className="border-t border-white/10 px-4 py-12">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-2xl font-semibold">Contact</h2>
          <a
            className="mt-3 inline-block text-blue-300"
            href="https://t.me/laura_luxee"
            rel="noreferrer"
            target="_blank"
          >
            Telegram @laura_luxee
          </a>
        </div>
      </section>
      <footer className="border-t border-white/10 px-4 py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-4 text-sm text-slate-400">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
          <Link to="/risk-disclosure">Risk Disclosure</Link>
        </div>
      </footer>
    </main>
  );
}

function ContentSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-t border-white/10 px-4 py-12">
      <div className="mx-auto max-w-7xl">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <div className="mt-4 max-w-3xl text-slate-300">{children}</div>
      </div>
    </section>
  );
}

function GridSection({ id, title, items }: { id: string; title: string; items: string[] }) {
  return (
    <section id={id} className="border-t border-white/10 px-4 py-12">
      <div className="mx-auto max-w-7xl">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item} className="rounded-lg border border-white/10 bg-white/6 p-4">
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
