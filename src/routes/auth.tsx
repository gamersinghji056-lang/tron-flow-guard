import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { registerAdmin } from "@/lib/accounts.functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  fullName: z.string().trim().max(80).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Sign in — TRONDESK deposit desk" },
      {
        name: "description",
        content:
          "Sign in or create a trader account to generate automatically verified USDT (TRC20) deposit requests.",
      },
      { property: "og:title", content: "Sign in — TRONDESK deposit desk" },
      {
        property: "og:description",
        content: "Access the TRONDESK automatic TRC20 USDT deposit verification desk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(mode === "signup");
  const [role, setRole] = useState<"trader" | "admin">("trader");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = credentialsSchema.safeParse({ email, password, fullName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your details");
      return;
    }

    setPending(true);
    try {
      if (isSignup) {
        if (role === "admin") {
          await registerAdmin({
            data: {
              email: parsed.data.email,
              password: parsed.data.password,
              fullName: parsed.data.fullName || parsed.data.email.split("@")[0]!,
              ...(adminCode.trim() ? { code: adminCode.trim() } : {}),
            },
          });
        } else {
          const { error } = await supabase.auth.signUp({
            email: parsed.data.email,
            password: parsed.data.password,
            options: {
              emailRedirectTo: window.location.origin,
              data: { full_name: parsed.data.fullName || null },
            },
          });
          if (error) throw error;
        }

        // Email verification is disabled — sign the new account straight in.
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (signInError) throw signInError;
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error) throw error;
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Radio className="h-4 w-4" />
          </span>
          <span className="font-semibold tracking-tight">TRONDESK</span>
        </Link>

        <div className="panel p-6">
          <h1 className="text-lg font-semibold">
            {isSignup ? "Create an account" : "Sign in to the deposit desk"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSignup
              ? "Accounts are active immediately — no email confirmation needed."
              : "Enter your credentials to continue."}
          </p>

          {isSignup ? (
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
              {(["trader", "admin"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRole(option)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors",
                    role === option && "bg-background text-foreground shadow-sm",
                  )}
                >
                  {option === "trader" ? "User" : "Administrator"}
                </button>
              ))}
            </div>
          ) : null}

          <form className="mt-5 space-y-4" onSubmit={submit}>
            {isSignup ? (
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Alex Trader"
                  maxLength={80}
                  autoComplete="name"
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@desk.com"
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={role === "admin" && isSignup ? "At least 10 characters" : "At least 8 characters"}
                autoComplete={isSignup ? "new-password" : "current-password"}
              />
            </div>

            {isSignup && role === "admin" ? (
              <div className="space-y-1.5">
                <Label htmlFor="adminCode">Administrator code (optional)</Label>
                <Input
                  id="adminCode"
                  value={adminCode}
                  onChange={(event) => setAdminCode(event.target.value)}
                  placeholder="Only required if configured"
                  autoComplete="off"
                />
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {isSignup
                ? role === "admin"
                  ? "Create administrator"
                  : "Create user account"
                : "Sign in"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setIsSignup((prev) => !prev)}
          >
            {isSignup ? "Already registered? Sign in" : "New here? Create an account"}
          </button>
        </div>


        <p className="mt-4 text-center text-xs text-muted-foreground">
          Administrator accounts get listener control, company wallets and the transaction audit trail.
        </p>
      </div>
    </div>
  );
}
