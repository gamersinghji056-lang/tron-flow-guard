import type { FormEvent } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WtronMark } from "@/components/mini-app/crypto-icons";

export default function AuthScreen(props: {
  authMode: "login" | "register";
  setAuthMode: (mode: "login" | "register") => void;
  accountType: "trader" | "vendor";
  setAccountType: (mode: "trader" | "vendor") => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  busy: boolean;
  notice: string;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="space-y-6 pt-10">
      <WtronMark className="h-14 w-14" />
      <div>
        <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
          Telegram secure access
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          {props.authMode === "login"
            ? `Login ${props.accountType === "vendor" ? "Vendor" : "Trader"}`
            : `Register ${props.accountType === "vendor" ? "Vendor" : "Trader"}`}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Choose Trader for wallet/P2P/WTRON Trade, or Vendor for approved marketplace operations.
        </p>
        {props.notice ? (
          <p className="mt-3 rounded-[17px] border border-primary/30 bg-primary/10 p-3 text-sm text-primary-foreground">
            {props.notice}
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-[17px] bg-white/6 p-1">
        <button
          type="button"
          className={`rounded-xl px-3 py-2 text-sm ${props.accountType === "trader" ? "bg-primary text-white hover:bg-primary/90" : "text-slate-400"}`}
          onClick={() => props.setAccountType("trader")}
        >
          Trader
        </button>
        <button
          type="button"
          className={`rounded-xl px-3 py-2 text-sm ${props.accountType === "vendor" ? "bg-primary text-white hover:bg-primary/90" : "text-slate-400"}`}
          onClick={() => props.setAccountType("vendor")}
        >
          Vendor
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-[17px] bg-white/6 p-1">
        <button
          className={`rounded-xl px-3 py-2 text-sm ${props.authMode === "login" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-slate-400"}`}
          onClick={() => props.setAuthMode("login")}
        >
          Login
        </button>
        <button
          className={`rounded-xl px-3 py-2 text-sm ${props.authMode === "register" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-slate-400"}`}
          onClick={() => props.setAuthMode("register")}
        >
          Register
        </button>
      </div>
      <form className="space-y-3" onSubmit={props.onSubmit}>
        <Input
          value={props.email}
          onChange={(event) => props.setEmail(event.target.value)}
          placeholder="Email"
          type="email"
        />
        <Input
          value={props.password}
          onChange={(event) => props.setPassword(event.target.value)}
          placeholder="Password"
          type="password"
        />
        {props.authMode === "register" ? (
          <Input
            value={props.confirmPassword}
            onChange={(event) => props.setConfirmPassword(event.target.value)}
            placeholder="Confirm password"
            type="password"
          />
        ) : null}
        <Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={props.busy}
        >
          {props.busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="mr-2 h-4 w-4" />
          )}
          {props.authMode === "login"
            ? "Login and link"
            : props.accountType === "vendor"
              ? "Submit vendor application"
              : "Register and link"}
        </Button>
      </form>
      {props.accountType === "vendor" ? (
        <p className="text-xs leading-5 text-slate-400">
          Vendor registration is submitted for approval. Vendor financial tools remain blocked until
          an admin approves the application.
        </p>
      ) : null}
    </div>
  );
}
