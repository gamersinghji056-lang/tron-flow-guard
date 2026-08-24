import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WtronLogo } from "@/components/mini-app/crypto-icons";

export const Route = createFileRoute("/admin/register")({
  head: () => ({
    meta: [
      { title: "Admin registration unavailable - WTRON" },
      {
        name: "robots",
        content: "noindex,nofollow",
      },
    ],
  }),
  component: AdminRegisterBlocked,
});

function AdminRegisterBlocked() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#070707] px-4 text-white">
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.04] p-6 text-center">
        <div className="flex justify-center">
          <WtronLogo markClassName="h-10 w-10" textClassName="text-lg font-semibold text-white" />
        </div>
        <ShieldAlert className="mx-auto mt-6 h-8 w-8 text-red-400" />
        <h1 className="mt-4 text-xl font-semibold">Admin registration is closed</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          WTRON administrator accounts are provisioned privately by the platform owner. This public
          route cannot create an admin account.
        </p>
        <Button asChild className="mt-6 w-full bg-red-600 text-white hover:bg-red-500">
          <Link to="/admin/login">Go to admin login</Link>
        </Button>
      </section>
    </main>
  );
}
