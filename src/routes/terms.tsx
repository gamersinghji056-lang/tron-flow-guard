import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service - WTRON" }] }),
  component: TermsPage,
});

const terms = [
  "WTRON provides software workflows for TRON wallet visibility, P2P trades, Direct Sell orders, vendor listings and operations management.",
  "Users are responsible for checking wallet addresses, payment details, order amounts and network selection before sending funds.",
  "Vendors must self-register and receive admin approval before accessing vendor financial operations. WTRON may reject, suspend or disable vendor access where required for operational safety.",
  "Order fees, rates and timers may be configured by admins and should be snapshotted at order creation where applicable.",
  "WTRON does not make a licensing, regulatory approval or government authorization claim in these terms.",
  "Support contact: Telegram @laura_luxee.",
];

function TermsPage() {
  return (
    <main className="min-h-screen bg-[#05070B] px-4 py-10 text-white">
      <article className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm text-blue-300">
          WTRON
        </Link>
        <h1 className="mt-6 text-3xl font-semibold">Terms of Service</h1>
        <div className="mt-6 space-y-4 text-slate-300">
          {terms.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </article>
    </main>
  );
}
