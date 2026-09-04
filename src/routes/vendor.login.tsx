import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchVendorApplication } from "@/lib/vendor.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WtronLogo } from "@/components/mini-app/crypto-icons";

export const Route = createFileRoute("/vendor/login")({
  head: () => ({ meta: [{ title: "Vendor Login - WTRON" }] }),
  component: VendorLoginPage,
});

function VendorLoginPage() {
  const navigate = useNavigate();
  const getVendorApplication = useServerFn(fetchVendorApplication);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const application = await getVendorApplication();
      if (!application) {
        await supabase.auth.signOut();
        throw new Error("This account is not a Vendor account. Use Trader Login instead.");
      }
      const status = String((application as { status?: string | null }).status ?? "pending");
      const rejectionReason = String(
        (application as { rejection_reason?: string | null }).rejection_reason ?? "",
      ).trim();
      const suspensionReason = String(
        (application as { suspension_reason?: string | null }).suspension_reason ?? "",
      ).trim();
      if (status !== "approved") {
        await supabase.auth.signOut();
        if (status === "pending") {
          throw new Error("Vendor application is pending approval.");
        }
        if (status === "rejected") {
          throw new Error(
            rejectionReason
              ? `Vendor application was rejected: ${rejectionReason}`
              : "Vendor application was rejected. Contact WTRON support.",
          );
        }
        if (status === "suspended") {
          throw new Error(
            suspensionReason
              ? `Vendor access is suspended: ${suspensionReason}`
              : "Vendor access is suspended.",
          );
        }
        if (status === "disabled") {
          throw new Error("Vendor access is disabled.");
        }
        throw new Error("Vendor approval required.");
      }
      navigate({ to: "/vendor", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080a0f] px-4 py-10 text-white">
      <form
        className="mx-auto mt-12 max-w-md space-y-4 rounded-[17px] border border-[#222837] bg-[#10131a] p-6 shadow-[0_30px_100px_rgba(0,0,0,.55)]"
        onSubmit={submit}
      >
        <Link to="/" className="inline-flex" aria-label="WTRON home">
          <WtronLogo markClassName="h-9 w-9" textClassName="font-semibold" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Vendor Login</h1>
          <p className="mt-1 text-sm text-slate-400">
            Approved vendors enter the portal. Pending applications show review status.
          </p>
        </div>
        <Input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button className="w-full" disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Login
        </Button>
        <p className="text-center text-sm text-slate-400">
          New vendor?{" "}
          <Link to="/vendor/register" className="text-primary">
            Register
          </Link>
        </p>
      </form>
    </main>
  );
}
