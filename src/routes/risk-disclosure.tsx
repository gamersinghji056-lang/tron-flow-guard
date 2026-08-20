import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/risk-disclosure")({
  head: () => ({ meta: [{ title: "Risk Disclosure - WTRON" }] }),
  component: RiskDisclosurePage,
});

const risks = [
  "Digital assets can be volatile and transactions on public blockchains may be irreversible.",
  "Sending USDT on the wrong network or to the wrong address can permanently lose funds.",
  "Personal on-chain wallet balances are separate from platform available, locked and pending balances.",
  "Direct Sell and vendor INR payments depend on payment confirmation workflows and may involve disputes or manual review.",
  "Blockchain listeners, APIs, wallets, exchanges, payment systems and Telegram availability may be delayed or interrupted.",
  "WTRON does not claim that use of this platform eliminates legal, tax, counterparty, operational or market risk.",
];

function RiskDisclosurePage() {
  return (
    <main className="min-h-screen bg-[#05070B] px-4 py-10 text-white">
      <article className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm text-blue-300">
          WTRON
        </Link>
        <h1 className="mt-6 text-3xl font-semibold">Risk Disclosure</h1>
        <div className="mt-6 space-y-4 text-slate-300">
          {risks.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </article>
    </main>
  );
}
