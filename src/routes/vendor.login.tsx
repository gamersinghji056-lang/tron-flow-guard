import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/vendor/login")({
  head: () => ({ meta: [{ title: "Vendor Login - WTRON" }] }),
  component: VendorLoginPage,
});

function VendorLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/vendor", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#05070B] px-4 py-10 text-white">
      <form
        className="mx-auto mt-12 max-w-md space-y-4 rounded-lg border border-white/10 bg-white/6 p-6"
        onSubmit={submit}
      >
        <Link to="/" className="text-sm text-blue-300">
          WTRON
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
        <Button className="w-full bg-blue-600" disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Login
        </Button>
        <p className="text-center text-sm text-slate-400">
          New vendor?{" "}
          <Link to="/vendor/register" className="text-blue-300">
            Register
          </Link>
        </p>
      </form>
    </main>
  );
}
