import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { V17FormField, V17Screen, V17Surface } from "@/components/mini-app/shared/v17-primitives";
import type { MiniT } from "@/lib/mini-i18n";

function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <V17Surface className="p-3">
      <p className="mb-3 text-xs font-semibold uppercase text-slate-500">{title}</p>
      {children}
    </V17Surface>
  );
}

export default function WalletCreateScreen(props: {
  name: string;
  setName: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  confirm: string;
  setConfirm: (value: string) => void;
  busy: boolean;
  t: MiniT;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <V17Screen title={props.t("createWallet")} subtitle={props.t("createWalletSubtitle")}>
      <form className="space-y-4" onSubmit={props.onSubmit}>
        <FormCard title={`1. ${props.t("walletName")}`}>
          <Input
            value={props.name}
            onChange={(event) => props.setName(event.target.value)}
            placeholder={props.t("mainWallet")}
          />
        </FormCard>
        <FormCard title="2. TRON Mainnet">
          <div className="space-y-2">
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm text-primary-foreground">
              WTRON creates a standard TRON Mainnet wallet for Send and Receive.
            </div>
          </div>
        </FormCard>
        <FormCard title={`3. ${props.t("transactionPassword")}`}>
          <div className="space-y-2">
            <V17FormField label={props.t("password")}>
              <Input
                type="password"
                value={props.password}
                onChange={(event) => props.setPassword(event.target.value)}
                placeholder={props.t("password")}
              />
            </V17FormField>
            <V17FormField label={props.t("confirmPassword")}>
              <Input
                type="password"
                value={props.confirm}
                onChange={(event) => props.setConfirm(event.target.value)}
                placeholder={props.t("confirmPassword")}
              />
            </V17FormField>
          </div>
        </FormCard>
        <Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={props.busy}
        >
          {props.busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {props.t("createWallet")}
        </Button>
      </form>
    </V17Screen>
  );
}
