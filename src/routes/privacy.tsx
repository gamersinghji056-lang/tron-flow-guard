import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy - WTRON" }] }),
  component: () => <LegalPage title="Privacy Policy" body={privacyBody} />,
});

const privacyBody = [
  "WTRON collects account, wallet, payment method, order and operational data needed to provide wallet, P2P, Direct Sell, vendor and admin services.",
  "Blockchain addresses, transaction hashes and public network activity may be processed to detect deposits and display transaction history.",
  "Payment method details are used for order settlement workflows and are shown only where required for the relevant transaction or operation.",
  "WTRON does not intentionally publish passwords, private keys, mnemonics, service keys or session tokens. Users should never share wallet recovery phrases with support or counterparties.",
  "Operational logs may include safe error messages and related order, user or transaction references. Secrets must not be stored in logs.",
  "Contact WTRON on Telegram at @laura_luxee for privacy questions.",
];

function LegalPage({ title, body }: { title: string; body: string[] }) {
  return (
    <main className="min-h-screen bg-[#05070B] px-4 py-10 text-white">
      <article className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm text-blue-300">
          WTRON
        </Link>
        <h1 className="mt-6 text-3xl font-semibold">{title}</h1>
        <div className="mt-6 space-y-4 text-slate-300">
          {body.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </article>
    </main>
  );
}
