import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowRight, LockKeyhole, Radio, ScanLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TRONDESK — Automatic TRC20 USDT Deposit Verification" },
      {
        name: "description",
        content:
          "Automatic USDT (TRC20) deposit verification on TRON. No screenshots, no TXID submission — the blockchain listener detects, verifies, confirms and credits every deposit.",
      },
      { property: "og:title", content: "TRONDESK — Automatic TRC20 USDT Deposit Verification" },
      {
        property: "og:description",
        content:
          "Exchange-grade deposit gateway: live blockchain monitoring, confirmation tracking and automatic balance crediting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: ScanLine,
    title: "Zero-touch verification",
    body: "Traders never upload a screenshot or paste a TXID. The listener reads the chain and matches the transfer to the open deposit request.",
  },
  {
    icon: Activity,
    title: "Live confirmation tracking",
    body: "Status moves from Waiting to Detected, Confirming and Confirmed in real time, with the confirmation count streamed to the dashboard.",
  },
  {
    icon: ShieldCheck,
    title: "Exchange-grade rule set",
    body: "Receiver address, token contract, network, amount, receipt status, unique TXID and replay protection are all enforced server-side.",
  },
  {
    icon: LockKeyhole,
    title: "Isolated listener service",
    body: "The blockchain worker runs behind the API with the service role. The browser only ever reads row-level-secured data.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-4">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Radio className="h-4 w-4" />
          </span>
          <span className="font-semibold tracking-tight">TRONDESK</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button asChild variant="ghost" size="sm">
            <Link to="/trader/login">Trader login</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/login">Admin login</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:pt-20">
        <p className="mono text-xs tracking-[0.2em] text-primary uppercase">
          TRC20 · USDT · Automatic settlement
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl leading-[1.05] font-semibold sm:text-6xl">
          Deposits that verify themselves on the TRON blockchain.
        </h1>
        <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          TRONDESK watches your company wallets around the clock, verifies every incoming USDT
          transfer against a strict rule set, tracks confirmations block by block and credits the
          trader automatically the moment the deposit is final.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:max-w-3xl">
          <Button asChild size="lg">
            <Link to="/trader/login">
              Trader login
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/trader/register">Trader register</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/admin/login">
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              Admin login
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/admin/register">Admin register</Link>
          </Button>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="panel p-5">
              <feature.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold">{feature.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>

        <div className="panel mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
          {[
            ["Waiting", "Deposit request created and wallet assigned"],
            ["Detected", "Matching transfer found on-chain"],
            ["Confirming", "Counting block confirmations"],
            ["Confirmed", "Balance credited automatically"],
          ].map(([label, hint], index) => (
            <div key={label} className="flex items-center gap-3">
              <span className="mono grid h-7 w-7 place-items-center rounded-full border border-primary/40 text-xs text-primary">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
