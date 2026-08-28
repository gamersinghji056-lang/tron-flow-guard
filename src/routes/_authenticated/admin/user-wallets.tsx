import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { networkConfig } from "@/lib/chain";
import { getAdminGasFreeWalletDiagnostics, setNileTestWalletAccess } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/user-wallets")({
  head: () => ({ meta: [{ title: "Wallet Monitor - WTRON Admin" }] }),
  component: AdminUserWalletsPage,
});

interface WalletMonitorRow {
  walletId: string;
  userId: string | null;
  user: string;
  accountRole: string;
  telegramUsername: string | null;
  telegramUserId: number | null;
  walletName: string;
  walletType: string;
  walletRole: string;
  generatedImported: string;
  backupStatus: string | null;
  generalWalletAddress: string | null;
  gasFreeAddress: string | null;
  network: "trc20-mainnet" | "trc20-nile" | null;
  usdtBalance: number | null;
  trxBalance: number | null;
  gasFreeState: string;
  activationStatus: string | null;
  signerAvailable: boolean;
  transactionPasswordConfigured: boolean;
  successfulTransferCount: number;
  totalUsdtSent: number;
  totalUsdtReceived: number;
  gasfreeTransferCount: number;
  totalFees: number | null;
  createdAt: string | null;
  lastTransaction: {
    status?: string | null;
    txid?: string | null;
    createdAt?: string | null;
  } | null;
  lastBlockchainSync: string | null;
  nileTestWalletEnabled: boolean;
  adminAction: string;
}

interface WalletMonitorResult {
  summary: {
    totalWallets: number;
    mainnetWallets: number;
    nileWallets: number;
    gasfreeWallets: number;
    activationRequired: number;
    trackedUsdt: number;
    successfulTransfers24h: number;
    transferVolume24h: number;
  };
  rows: WalletMonitorRow[];
}

function AdminUserWalletsPage() {
  const loadDiagnostics = useServerFn(getAdminGasFreeWalletDiagnostics);
  const setNileAccess = useServerFn(setNileTestWalletAccess);
  const [result, setResult] = useState<WalletMonitorResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [network, setNetwork] = useState("ALL");
  const [walletType, setWalletType] = useState("ALL");
  const [gasFreeState, setGasFreeState] = useState("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadDiagnostics({ data: { limit: 100 } });
      setResult(next as unknown as WalletMonitorResult);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load wallet monitor");
    } finally {
      setLoading(false);
    }
  }, [loadDiagnostics]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (result?.rows ?? []).filter((row) => {
      const text = [
        row.user,
        row.userId,
        row.telegramUsername,
        row.telegramUserId,
        row.walletId,
        row.generalWalletAddress,
        row.gasFreeAddress,
        row.walletName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (!normalized || text.includes(normalized)) &&
        (network === "ALL" || row.network === network) &&
        (walletType === "ALL" || row.walletType === walletType) &&
        (gasFreeState === "ALL" || row.gasFreeState === gasFreeState)
      );
    });
  }, [gasFreeState, network, query, result?.rows, walletType]);

  async function toggleNile(row: WalletMonitorRow) {
    if (!row.userId) return;
    try {
      await setNileAccess({
        data: {
          userId: row.userId,
          enabled: !row.nileTestWalletEnabled,
          reason: "Admin Wallet Monitor",
        },
      });
      toast.success("Nile test wallet access updated");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update Nile access");
    }
  }

  const summary = result?.summary;
  const states = Array.from(new Set((result?.rows ?? []).map((row) => row.gasFreeState))).sort();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Wallet Monitor"
        description="User wallet visibility, GasFree relationships and safe non-secret diagnostics."
        actions={
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        }
      />

      {summary ? (
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Total Wallets" value={summary.totalWallets} />
          <Metric
            label="Mainnet / Nile"
            value={`${summary.mainnetWallets} / ${summary.nileWallets}`}
          />
          <Metric
            label="GasFree / Activation Required"
            value={`${summary.gasfreeWallets} / ${summary.activationRequired}`}
          />
          <Metric label="Tracked USDT" value={formatAmount(summary.trackedUsdt)} />
          <Metric label="24h Successful Transfers" value={summary.successfulTransfers24h} />
          <Metric label="24h Volume" value={`${formatAmount(summary.transferVolume24h)} USDT`} />
        </div>
      ) : null}

      <div className="panel grid gap-3 p-3 md:grid-cols-[1fr_repeat(3,12rem)]">
        <label className="relative">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search user, Telegram, wallet ID or address"
          />
        </label>
        <Select
          value={network}
          onChange={setNetwork}
          options={["ALL", "trc20-mainnet", "trc20-nile"]}
        />
        <Select
          value={walletType}
          onChange={setWalletType}
          options={["ALL", "standard", "gasfree"]}
        />
        <Select value={gasFreeState} onChange={setGasFreeState} options={["ALL", ...states]} />
      </div>

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
                  "Owner",
                  "Wallet",
                  "Network",
                  "Addresses",
                  "Balances",
                  "GasFree",
                  "Security",
                  "Transfers",
                  "Last Activity",
                  "Actions",
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
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                    No wallets match the current filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <WalletRow key={row.walletId} row={row} onToggleNile={toggleNile} />
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function WalletRow({
  row,
  onToggleNile,
}: {
  row: WalletMonitorRow;
  onToggleNile: (row: WalletMonitorRow) => void;
}) {
  const explorer =
    row.network && row.generalWalletAddress
      ? networkConfig(row.network).explorerAddress(row.generalWalletAddress)
      : null;
  return (
    <tr className="hover:bg-secondary/30">
      <Cell
        primary={row.user}
        secondary={`${row.accountRole}${row.telegramUsername ? ` / ${row.telegramUsername}` : ""}${row.telegramUserId ? ` / ${row.telegramUserId}` : ""}`}
      />
      <Cell
        primary={row.walletName}
        secondary={`${row.walletType} / ${row.walletRole} / ${row.generatedImported}`}
        mono={row.walletId}
      />
      <Cell
        primary={row.network === "trc20-nile" ? "Nile Testnet" : "Mainnet"}
        secondary={row.network === "trc20-nile" ? "TESTNET" : "PRODUCTION"}
      />
      <Cell
        primary={`General: ${row.generalWalletAddress ?? "Not available"}`}
        secondary={`GasFree: ${row.gasFreeAddress ?? "Not available"}`}
      />
      <Cell
        primary={`${formatMaybeAmount(row.usdtBalance)} USDT`}
        secondary={`${formatMaybeAmount(row.trxBalance)} TRX`}
      />
      <td className="px-4 py-2.5 align-top">
        <StatusBadge status={row.gasFreeState} />
        <p className="mt-1 text-xs text-muted-foreground">
          {row.activationStatus ?? "Activation Not available"}
        </p>
      </td>
      <Cell
        primary={row.signerAvailable ? "Signer available" : "Signer Not available"}
        secondary={`${row.transactionPasswordConfigured ? "Password configured" : "Password missing"} / ${row.backupStatus ?? "Backup Not available"}`}
      />
      <Cell
        primary={`${row.successfulTransferCount} successful / ${row.gasfreeTransferCount} GasFree`}
        secondary={`Sent ${formatAmount(row.totalUsdtSent)} / Received ${formatAmount(row.totalUsdtReceived)} / Fees ${row.totalFees == null ? "Not available" : formatAmount(row.totalFees)}`}
      />
      <Cell
        primary={row.lastTransaction?.status ?? "Not available"}
        secondary={formatDate(row.lastTransaction?.createdAt ?? row.lastBlockchainSync)}
      />
      <td className="px-4 py-2.5 align-top">
        <div className="flex flex-wrap gap-2">
          {explorer ? (
            <a
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              href={explorer}
              target="_blank"
              rel="noreferrer"
            >
              Explorer <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void onToggleNile(row)}
          >
            {row.nileTestWalletEnabled ? "Disable Nile Test" : "Enable Nile Test"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Activation: user authorization is required.
        </p>
      </td>
    </tr>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Cell({
  primary,
  secondary,
  mono,
}: {
  primary: string | null;
  secondary?: string | null;
  mono?: string | null;
}) {
  return (
    <td className="max-w-96 px-4 py-2.5 align-top">
      <p className="break-words">{primary || "Not available"}</p>
      {secondary ? (
        <p className="mt-1 break-words text-xs text-muted-foreground">{secondary}</p>
      ) : null}
      {mono ? (
        <p className="mono mt-1 break-all text-[11px] text-muted-foreground">{mono}</p>
      ) : null}
    </td>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <select
      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function formatAmount(value: number) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatMaybeAmount(value: number | null) {
  return value == null ? "Not available" : formatAmount(value);
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Not available";
}
