import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, ExternalLink, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WtronLogo } from "@/components/mini-app/crypto-icons";
import {
  WTRON_ANDROID_APK_PATH,
  WTRON_ANDROID_PACKAGE,
  WTRON_ANDROID_SHA256_PATH,
  WTRON_ANDROID_VERSION,
  WTRON_ANDROID_VERSION_CODE,
} from "@/lib/app-release";

export const Route = createFileRoute("/download/android")({
  head: () => ({
    meta: [
      { title: "Download WTRON Android App" },
      {
        name: "description",
        content: "Download the first-party WTRON Android application release.",
      },
    ],
  }),
  component: AndroidDownloadPage,
});

type ApkState = "checking" | "available" | "missing";

function AndroidDownloadPage() {
  const [state, setState] = useState<ApkState>("checking");

  useEffect(() => {
    let active = true;
    fetch(WTRON_ANDROID_APK_PATH, { method: "HEAD", cache: "no-store" })
      .then((response) => {
        if (active) setState(response.ok ? "available" : "missing");
      })
      .catch(() => {
        if (active) setState("missing");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-8 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <Link to="/" aria-label="WTRON home">
            <WtronLogo markClassName="h-10 w-10" textClassName="text-lg font-semibold" />
          </Link>
          <Button asChild variant="secondary" size="sm">
            <Link to="/trader/login">Trader Login</Link>
          </Button>
        </header>

        <section className="grid gap-6 rounded-lg border border-white/10 bg-white/[0.04] p-6 shadow-[0_30px_90px_-60px_rgba(240,68,68,0.55)] md:grid-cols-[1fr_18rem]">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              Android release
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
              Download WTRON App
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Install the WTRON Android application for the production Trader and Vendor flows. The
              app uses the same WTRON account and production backend as wtron.org.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {state === "available" ? (
                <Button asChild size="lg">
                  <a href={WTRON_ANDROID_APK_PATH} download>
                    <Download className="mr-2 h-4 w-4" />
                    Download APK
                  </a>
                </Button>
              ) : (
                <Button size="lg" disabled>
                  {state === "checking" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  APK not published
                </Button>
              )}
              <Button asChild size="lg" variant="secondary">
                <Link to="/app">
                  Open Web App <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            {state === "missing" ? (
              <p className="mt-3 text-xs text-warning">
                The release APK file is not present on this deployment yet. Publish
                {` ${WTRON_ANDROID_APK_PATH} `}after owner signing.
              </p>
            ) : null}
          </div>

          <aside className="rounded-lg border border-white/10 bg-black/35 p-4">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary/15 text-primary">
              <Smartphone className="h-6 w-6" />
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <Info label="Version" value={WTRON_ANDROID_VERSION} />
              <Info label="Version code" value={String(WTRON_ANDROID_VERSION_CODE)} />
              <Info label="Package" value={WTRON_ANDROID_PACKAGE} />
              <Info label="Platform" value="Android" />
            </dl>
            <a
              href={WTRON_ANDROID_SHA256_PATH}
              className="mt-5 inline-flex items-center text-xs text-slate-400 hover:text-white"
            >
              SHA-256 checksum <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </aside>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {[
            ["Same account", "Trader and Vendor sessions use the production WTRON backend."],
            ["Protected wallet flow", "Transfers keep transaction password and signer checks."],
            ["Android first", "QR, copy, share and external TronScan actions are mobile-ready."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mono mt-1 break-all text-slate-100">{value}</dd>
    </div>
  );
}
