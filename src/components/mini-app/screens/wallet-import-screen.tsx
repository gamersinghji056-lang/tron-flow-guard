import type { FormEvent } from "react";
import { ScanLine } from "lucide-react";
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

export default function WalletImportScreen(props: {
  name: string;
  setName: (value: string) => void;
  phrase: string;
  setPhrase: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  busy: boolean;
  t: MiniT;
  onSubmit: (event: FormEvent) => void;
  onScanPhrase: () => void | Promise<void>;
}) {
  return (
    <V17Screen title={props.t("importWallet")} subtitle={props.t("importWalletSubtitle")}>
      <form className="space-y-4" onSubmit={props.onSubmit}>
        <FormCard title={props.t("walletName")}>
          <Input
            value={props.name}
            onChange={(event) => props.setName(event.target.value)}
            placeholder={props.t("tradingWallet")}
          />
        </FormCard>
        <FormCard title="TRON Mainnet">
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm text-primary-foreground">
            Imports are added as standard TRON Mainnet wallets.
          </div>
        </FormCard>
        <FormCard title={props.t("recoveryPhrase")}>
          <textarea
            className="min-h-28 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none focus:border-primary"
            value={props.phrase}
            onChange={(event) => props.setPhrase(event.target.value)}
            placeholder={props.t("enterRecoveryPhrase")}
          />
          <Button
            type="button"
            variant="secondary"
            className="mt-2 w-full"
            onClick={props.onScanPhrase}
          >
            <ScanLine className="mr-2 h-4 w-4" />
            Scan recovery QR
          </Button>
          <p className="mt-2 text-xs text-slate-500">
            QR scanning only fills this local form. Anyone with the phrase or QR can control the
            wallet.
          </p>
        </FormCard>
        <FormCard title={props.t("transactionPassword")}>
          <V17FormField label={props.t("password")}>
            <Input
              type="password"
              value={props.password}
              onChange={(event) => props.setPassword(event.target.value)}
              placeholder={props.t("password")}
            />
          </V17FormField>
        </FormCard>
        <Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={props.busy}
        >
          {props.t("importWallet")}
        </Button>
      </form>
    </V17Screen>
  );
}
