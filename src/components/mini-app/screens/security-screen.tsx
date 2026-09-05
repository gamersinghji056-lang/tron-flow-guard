import type { FormEvent } from "react";
import { MiniIcons } from "@/components/mini-app/crypto-icons";
import {
  V17Button,
  V17EmptyLine,
  V17Input,
  V17Screen,
  V17Section,
  V17SettingRow,
  V17Surface,
} from "@/components/mini-app/shared/v17-primitives";

export interface MiniWalletSecurityRow {
  id: string;
  name?: string | null;
  backup_status?: string | null;
}

export default function SecurityScreen({
  wallets,
  enabled,
  changing,
  setChanging,
  currentPassword,
  setCurrentPassword,
  password,
  setPassword,
  confirm,
  setConfirm,
  busy,
  onSubmit,
  onWalletBackup,
}: {
  wallets: MiniWalletSecurityRow[];
  enabled: boolean;
  changing: boolean;
  setChanging: (value: boolean) => void;
  currentPassword: string;
  setCurrentPassword: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  confirm: string;
  setConfirm: (value: string) => void;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onWalletBackup: (wallet: MiniWalletSecurityRow) => void;
}) {
  const showForm = !enabled || changing;
  return (
    <V17Screen title="Security" subtitle="Login, transaction password and wallet backup">
      <V17Surface className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Transaction Password</h2>
            <p className="text-sm text-slate-400">{enabled ? "Enabled" : "Not set"}</p>
          </div>
          {enabled && !changing ? (
            <V17Button type="button" variant="secondary" onClick={() => setChanging(true)}>
              Change Password
            </V17Button>
          ) : null}
        </div>
        {showForm ? (
          <form className="space-y-3" onSubmit={onSubmit}>
            {enabled ? (
              <V17Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current transaction password"
              />
            ) : null}
            <V17Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="New transaction password"
            />
            <V17Input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Confirm new transaction password"
            />
            <div className="grid grid-cols-2 gap-2">
              {enabled ? (
                <V17Button type="button" variant="secondary" onClick={() => setChanging(false)}>
                  Cancel
                </V17Button>
              ) : null}
              <V17Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={busy}
              >
                {enabled ? "Update Password" : "Set Password"}
              </V17Button>
            </div>
          </form>
        ) : null}
      </V17Surface>
      <V17Section title="Wallet Backup Status">
        {wallets.length ? (
          wallets.map((wallet) => (
            <V17SettingRow
              key={wallet.id}
              icon={MiniIcons.backup}
              title={wallet.name ?? "Wallet"}
              body={wallet.backup_status ?? "not_backed_up"}
              onClick={() => onWalletBackup(wallet)}
            />
          ))
        ) : (
          <V17EmptyLine>No personal wallets yet.</V17EmptyLine>
        )}
      </V17Section>
      <V17EmptyLine>
        Private-key export is unavailable in the Mini App until secure export architecture is
        configured.
      </V17EmptyLine>
    </V17Screen>
  );
}
