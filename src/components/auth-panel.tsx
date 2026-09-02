import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  authenticatedServerFnOptions,
  clearAdminSessionToken,
  rememberAdminSessionToken,
} from "@/integrations/supabase/server-fn-auth";
import {
  getCurrentAccountAccess,
  getCurrentAdminLoginAccess,
  registerAdmin,
  registerTrader,
} from "@/lib/accounts.functions";
import { adminLoginErrorMessage } from "@/lib/admin-auth-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WtronLogo } from "@/components/mini-app/crypto-icons";

export type Audience = "trader" | "admin";
export type AuthMode = "login" | "register";

const COPY: Record<Audience, Record<AuthMode, { title: string; hint: string; cta: string }>> = {
  trader: {
    login: {
      title: "Trader sign in",
      hint: "Access your wallets, deposit orders and transaction history.",
      cta: "Sign in",
    },
    register: {
      title: "Create a trader account",
      hint: "Your account is active immediately — no email confirmation needed.",
      cta: "Create trader account",
    },
  },
  admin: {
    login: {
      title: "Administrator sign in",
      hint: "Operations console: wallets, P2P assignments, API keys and audit logs.",
      cta: "Sign in as administrator",
    },
    register: {
      title: "Administrator registration",
      hint: "Administrator accounts are provisioned server-side with an explicit role grant.",
      cta: "Create administrator",
    },
  },
};

function schemaFor(audience: Audience, mode: AuthMode) {
  return z.object({
    email: z.string().trim().email("Enter a valid email address").max(255),
    password:
      mode === "register" && audience === "admin"
        ? z.string().min(10, "Administrator passwords must be at least 10 characters").max(72)
        : z.string().min(8, "Password must be at least 8 characters").max(72),
    fullName:
      mode === "register"
        ? z.string().trim().min(1, "Full name is required").max(80)
        : z.string().optional(),
  });
}

function authToastMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Authentication failed";
}

function logAdminLoginDiagnostic(stage: string, details?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console.info(`[AdminAuth] ${stage}`, details ?? {});
}

export function AuthPanel({ audience, mode }: { audience: Audience; mode: AuthMode }) {
  const navigate = useNavigate();
  const resolveCurrentAccount = useServerFn(getCurrentAccountAccess);
  const resolveAdminLoginAccess = useServerFn(getCurrentAdminLoginAccess);
  const copy = COPY[audience][mode];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [pending, setPending] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);

  // Already signed in? Send the session to the right console.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      const account = await resolveCurrentAccount(await authenticatedServerFnOptions());
      if (audience === "admin") {
        if (account.isAdmin) navigate({ to: "/admin", replace: true });
        else await supabase.auth.signOut();
        return;
      }
      if (account.accountType === "trader") navigate({ to: "/dashboard", replace: true });
      else await supabase.auth.signOut();
    });
    return () => {
      active = false;
    };
  }, [audience, navigate, resolveCurrentAccount]);

  async function signInAndRoute(credentials: { email: string; password: string }) {
    if (audience === "admin") {
      clearAdminSessionToken();
      await supabase.auth.signOut().catch(() => undefined);
    }

    const { data: signInData, error } = await supabase.auth.signInWithPassword(credentials);
    if (error) {
      throw new Error(
        /Email not confirmed/i.test(error.message)
          ? "Please confirm your email address before signing in."
          : /Invalid login/i.test(error.message)
            ? "Invalid email or password."
            : error.message,
      );
    }

    if (!signInData.session?.access_token || !signInData.session.refresh_token) {
      throw new Error("Authentication session was not created.");
    }
    if (audience === "admin") {
      logAdminLoginDiagnostic("LOGIN_SIGNIN_SUCCESS", {
        userIdPresent: Boolean(signInData.user?.id),
        tokenPresent: Boolean(signInData.session.access_token),
      });
    }

    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    });
    if (setSessionError) throw new Error(setSessionError.message);

    const { data: currentSession } = await supabase.auth.getSession();
    if (!currentSession.session?.access_token) {
      throw new Error("Authentication session was not saved for this domain.");
    }
    if (audience === "admin") {
      rememberAdminSessionToken(signInData.session.access_token);
      logAdminLoginDiagnostic("TOKEN_PRESENT", {
        storedSession: Boolean(currentSession.session.access_token),
      });
    }

    if (audience === "admin") {
      const adminAccess = await resolveAdminLoginAccess(
        await authenticatedServerFnOptions(signInData.session.access_token, {
          diagnostic: "admin-login-access",
        }),
      );
      logAdminLoginDiagnostic(
        adminAccess.status === "allowed" ? "ADMIN_ROLE_SUCCESS" : "ADMIN_ROLE_FAIL",
        { status: adminAccess.status },
      );
      if (adminAccess.status !== "allowed") {
        clearAdminSessionToken();
        await supabase.auth.signOut();
        throw new Error(adminLoginErrorMessage(adminAccess.status));
      }
      logAdminLoginDiagnostic("REDIRECT_TARGET", { to: "/admin" });
      navigate({ to: "/admin", replace: true });
      return;
    }

    const account = await resolveCurrentAccount(
      await authenticatedServerFnOptions(signInData.session.access_token),
    );
    const isStaff = account.isAdmin;

    if (audience === "trader" && isStaff) {
      await supabase.auth.signOut();
      throw new Error("This is an administrator account. Use the administrator sign-in page.");
    }
    if (audience === "trader" && account.accountType === "vendor") {
      await supabase.auth.signOut();
      throw new Error("This is a Vendor account. Use Vendor Login.");
    }

    navigate({ to: isStaff ? "/admin" : "/dashboard", replace: true });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = schemaFor(audience, mode).safeParse({ email, password, fullName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your details");
      return;
    }

    setPending(true);
    try {
      if (mode === "login") {
        await signInAndRoute({ email: parsed.data.email, password: parsed.data.password });
        return;
      }

      const payload = {
        email: parsed.data.email,
        password: parsed.data.password,
        fullName: parsed.data.fullName!,
      };

      const result =
        audience === "admin"
          ? await registerAdmin({
              data: { ...payload, ...(adminCode.trim() ? { code: adminCode.trim() } : {}) },
            })
          : await registerTrader({ data: payload });

      if (audience === "trader") {
        setPassword("");
        setRegistrationComplete(true);
        toast.success("Registration successful. Please log in.");
        return;
      }

      if (!result.canSignInNow) {
        setAwaitingVerification(true);
        toast.success("Account created — check your inbox to confirm your email.");
        return;
      }

      toast.success(audience === "admin" ? "Administrator account created" : "Account created");
      await signInAndRoute({ email: parsed.data.email, password: parsed.data.password });
    } catch (error) {
      toast.error(authToastMessage(error));
    } finally {
      setPending(false);
    }
  }

  const other =
    audience === "trader"
      ? mode === "login"
        ? { to: "/trader/register", label: "New here? Create a trader account" }
        : { to: "/trader/login", label: "Already registered? Sign in" }
      : mode === "login"
        ? null
        : { to: "/admin/login", label: "Already an administrator? Sign in" };

  return (
    <div className="grid min-h-screen place-items-center bg-[#050505] px-4 py-10 text-white">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <WtronLogo markClassName="h-9 w-9" textClassName="font-semibold tracking-tight" />
        </Link>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6 shadow-[0_30px_90px_-60px_rgba(240,68,68,0.55)]">
          <p className="mono text-[10px] tracking-[0.22em] text-primary uppercase">
            {audience === "admin" ? "Administrator area" : "Trader area"}
          </p>
          <h1 className="mt-2 text-lg font-semibold">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.hint}</p>

          {registrationComplete ? (
            <div className="mt-5 space-y-3">
              <p className="text-sm">Registration successful. Please log in.</p>
              <Button asChild className="w-full">
                <Link to="/trader/login">Trader Login</Link>
              </Button>
            </div>
          ) : awaitingVerification ? (
            <div className="mt-5 space-y-3">
              <p className="text-sm">
                We sent a confirmation link to <span className="font-medium">{email}</span>. Confirm
                your address, then sign in.
              </p>
              <Button asChild className="w-full">
                <Link to={audience === "admin" ? "/admin/login" : "/trader/login"}>
                  Go to sign in
                </Link>
              </Button>
            </div>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={submit}>
              {mode === "register" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder={audience === "admin" ? "Operations lead" : "Alex Trader"}
                    maxLength={80}
                    autoComplete="name"
                    required
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
                  placeholder={
                    mode === "register" && audience === "admin"
                      ? "At least 10 characters"
                      : "At least 8 characters"
                  }
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                />
              </div>

              {mode === "register" && audience === "admin" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="adminCode">Administrator code</Label>
                  <Input
                    id="adminCode"
                    value={adminCode}
                    onChange={(event) => setAdminCode(event.target.value)}
                    placeholder="Only required if configured"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Required when the project has an administrator registration code configured.
                  </p>
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                {copy.cta}
              </Button>
            </form>
          )}

          {other ? (
            <Link
              to={other.to}
              className="mt-4 block text-center text-sm text-muted-foreground hover:text-foreground"
            >
              {other.label}
            </Link>
          ) : null}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {audience === "admin"
            ? "Administrator access is role-based and enforced server-side on every request."
            : "Traders only ever see their own wallets, orders and transactions."}
        </p>
      </div>
    </div>
  );
}
