import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Store, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WtronLogo } from "@/components/mini-app/crypto-icons";
import { supabase } from "@/integrations/supabase/client";
import { authenticatedServerFnOptions } from "@/integrations/supabase/server-fn-auth";
import { getCurrentAccountAccess } from "@/lib/accounts.functions";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "WTRON App" }] }),
  component: AppEntryPage,
});

function AppEntryPage() {
  const navigate = useNavigate();
  const resolveCurrentAccount = useServerFn(getCurrentAccountAccess);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        if (!data.session?.access_token) {
          setChecking(false);
          return;
        }
        const account = await resolveCurrentAccount(
          await authenticatedServerFnOptions(data.session.access_token),
        );
        if (!active) return;
        navigate({
          to: account.accountType === "vendor" ? "/vendor" : "/dashboard",
          replace: true,
        });
      })
      .catch(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [navigate, resolveCurrentAccount]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#080a0f] px-4 text-white">
      <section className="w-full max-w-sm rounded-[17px] border border-[#222837] bg-[#10131a] p-5 text-center shadow-[0_30px_100px_rgba(0,0,0,.55)]">
        <WtronLogo
          className="justify-center"
          markClassName="h-12 w-12"
          textClassName="text-xl font-semibold"
        />
        {checking ? (
          <div className="mt-8">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="mt-3 text-sm text-slate-400">Opening WTRON</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-3">
            <Button asChild>
              <Link to="/trader/login">
                <UserRound className="mr-2 h-4 w-4" />
                Trader Login
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/vendor/login">
                <Store className="mr-2 h-4 w-4" />
                Vendor Login
              </Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
