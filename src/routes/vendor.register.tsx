import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { registerVendorApplication } from "@/lib/vendor.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/vendor/register")({
  head: () => ({ meta: [{ title: "Vendor Register - WTRON" }] }),
  component: VendorRegisterPage,
});

function VendorRegisterPage() {
  const registerVendor = useServerFn(registerVendorApplication);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    email: "",
    password: "",
    confirmPassword: "",
    telegram: "",
    termsAccepted: false,
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (!form.termsAccepted) {
      toast.error("Accept the vendor terms to continue");
      return;
    }
    setPending(true);
    try {
      await registerVendor({
        data: {
          businessName: form.businessName,
          contactName: form.contactName,
          email: form.email,
          password: form.password,
          telegram: form.telegram || undefined,
          termsAccepted: true,
        },
      });
      setDone(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not register vendor");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#05070B] px-4 py-10 text-white">
      <div className="mx-auto max-w-md">
        <Link to="/" className="text-sm text-blue-300">
          WTRON
        </Link>
        {done ? (
          <section className="mt-8 rounded-lg border border-white/10 bg-white/6 p-6">
            <h1 className="text-2xl font-semibold">Vendor Application Under Review</h1>
            <p className="mt-3 text-sm text-slate-300">
              Registration submitted. Waiting for admin approval.
            </p>
            <Button asChild className="mt-5 w-full bg-blue-600">
              <Link to="/vendor/login">Vendor Login</Link>
            </Button>
          </section>
        ) : (
          <form
            className="mt-8 space-y-4 rounded-lg border border-white/10 bg-white/6 p-6"
            onSubmit={submit}
          >
            <div>
              <h1 className="text-2xl font-semibold">Vendor Register</h1>
              <p className="mt-1 text-sm text-slate-400">Applications require admin approval.</p>
            </div>
            <Input
              placeholder="Vendor / Business Name"
              value={form.businessName}
              onChange={(event) => setForm({ ...form, businessName: event.target.value })}
            />
            <Input
              placeholder="Contact Name"
              value={form.contactName}
              onChange={(event) => setForm({ ...form, contactName: event.target.value })}
            />
            <Input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
            <Input
              placeholder="Password"
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
            <Input
              placeholder="Confirm Password"
              type="password"
              value={form.confirmPassword}
              onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
            />
            <Input
              placeholder="Telegram (optional)"
              value={form.telegram}
              onChange={(event) => setForm({ ...form, telegram: event.target.value })}
            />
            <label className="flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.termsAccepted}
                onChange={(event) => setForm({ ...form, termsAccepted: event.target.checked })}
                className="mt-1"
              />
              I accept WTRON vendor terms and understand approval is required.
            </label>
            <Button className="w-full bg-blue-600" disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Register
            </Button>
            <p className="text-center text-sm text-slate-400">
              Already applied?{" "}
              <Link to="/vendor/login" className="text-blue-300">
                Vendor Login
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
