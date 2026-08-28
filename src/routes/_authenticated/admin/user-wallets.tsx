import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { getAdminGasFreeWalletDiagnostics } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/user-wallets")({
  head: () => ({ meta: [{ title: "User Wallets - WTRON Admin" }] }),
  component: AdminUserWalletsPage,
});

interface GasFreeWalletDiagnostic {
  walletId: string;
  user: string;
  walletName: string;
  generalWalletAddress: string | null;
  gasFreeAddress: string | null;
  network: string | null;
  usdtBalance: number;
  trxBalance: number;
  gasFreeState: string;
  activationStatus: string | null;
  nonce: string | null;
  provider: string;
  providerStatus: string;
  lastProviderCheck: string | null;
  lastSuccessfulQuote: string | null;
  lastGasFreeTransaction: {
    providerRequestId?: string | null;
    status?: string | null;
    txid?: string | null;
    network?: string | null;
    updatedAt?: string | null;
  } | null;
  lastError: string | null;
  transactionPasswordConfigured: boolean;
  transactionPasswordLocked: boolean;
  adminAction: string;
}

function AdminUserWalletsPage() {
  const loadDiagnostics = useServerFn(getAdminGasFreeWalletDiagnostics);
  const [rows, setRows] = useState<GasFreeWalletDiagnostic[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadDiagnostics({ data: { limit: 50 } });
      setRows(result as unknown as GasFreeWalletDiagnostic[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load GasFree diagnostics");
    } finally {
      setLoading(false);
    }
  }, [loadDiagnostics]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="User Wallet GasFree Diagnostics"
        description="Non-secret wallet diagnostics. Admin can inspect provider state, but user authorization is required for activation or signing."
        actions={
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh Status
          </Button>
        }
      />
      <div className="panel overflow-x-auto">
        {loading ? (
          <div className="grid h-44 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                {[
                  "User",
                  "Network",
                  "GasFree State",
                  "Activation",
                  "Balances",
                  "General Address",
                  "GasFree Address",
                  "Nonce",
                  "Provider",
                  "Quote",
                  "Last Transaction",
                  "Last Error",
                  "Admin Action",
                ].map((label) => (
                  <th key={label} className="px-4 py-2.5 text-left font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-muted-foreground">
                    No GasFree wallets found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.walletId} className="hover:bg-secondary/30">
                    <Cell primary={row.user} secondary={row.walletName} />
                    <Cell
                      primary={row.network === "trc20-nile" ? "Nile Testnet" : "Mainnet"}
                      secondary={row.network === "trc20-nile" ? "TESTNET" : "PRODUCTION"}
                    />
                    <td className="px-4 py-2.5 align-top">
                      <StatusBadge status={row.gasFreeState} />
                    </td>
                    <Cell
                      primary={row.activationStatus ?? "-"}
                      secondary={row.nonce ? `Nonce ${row.nonce}` : null}
                    />
                    <Cell
                      primary={`${formatAmount(row.usdtBalance)} USDT`}
                      secondary={`${formatAmount(row.trxBalance)} TRX`}
                    />
                    <MonoCell value={row.generalWalletAddress} />
                    <MonoCell value={row.gasFreeAddress} />
                    <MonoCell value={row.nonce} />
                    <Cell primary={row.provider} secondary={row.providerStatus} />
                    <Cell
                      primary={row.lastSuccessfulQuote ?? "-"}
                      secondary={formatDate(row.lastProviderCheck)}
                    />
                    <Cell
                      primary={row.lastGasFreeTransaction?.status ?? "-"}
                      secondary={row.lastGasFreeTransaction?.providerRequestId ?? null}
                    />
                    <Cell primary={row.lastError ?? "-"} />
                    <Cell
                      primary={row.adminAction}
                      secondary={
                        row.transactionPasswordConfigured
                          ? row.transactionPasswordLocked
                            ? "Password locked"
                            : "Password configured"
                          : "Password missing"
                      }
                    />
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Cell({ primary, secondary }: { primary: string | null; secondary?: string | null }) {
  return (
    <td className="max-w-80 px-4 py-2.5 align-top">
      <p className="break-words">{primary || "-"}</p>
      {secondary ? <p className="mt-1 text-xs text-muted-foreground">{secondary}</p> : null}
    </td>
  );
}

function MonoCell({ value }: { value?: string | null }) {
  return <td className="mono max-w-80 break-all px-4 py-2.5 align-top text-xs">{value || "-"}</td>;
}

function formatAmount(value: number) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : null;
}
