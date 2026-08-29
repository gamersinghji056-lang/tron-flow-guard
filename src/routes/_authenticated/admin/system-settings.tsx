import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  createManualFeeSweep,
  testGasFreeProviderConnection,
  updatePlatformSettings,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/admin/system-settings")({
  component: SystemSettingsPage,
});

interface SettingRow {
  key: string;
  value: unknown;
  description?: string | null;
}

interface WalletOption {
  id: string;
  name: string;
  address: string;
  network: string;
  purpose?: string | null;
  is_active?: boolean | null;
  onchain_usdt_balance?: number | string | null;
  onchain_trx_balance?: number | string | null;
}

interface GasFreeProviderTestResult {
  connected: boolean;
  status: string;
  provider: string;
  providerAddress: string | null;
  network: string;
  asset: string;
  tokenAddress: string | null;
  envNames?: readonly string[];
  credentialState: "CONFIGURED" | "INCOMPLETE" | "MISSING";
  serviceProvider: string;
  message: string;
}

interface GasFreeDiagnosticsResult {
  mainnet: GasFreeProviderTestResult;
  nile: GasFreeProviderTestResult;
  transferEnabled: boolean;
  mainnetEnabled: boolean;
  killSwitch: boolean;
  productionReadiness: "PRODUCTION_ENABLED" | "TECHNICALLY_READY" | "NOT_READY" | string;
  lastProviderRequest?: {
    id?: string | null;
    network?: string | null;
    providerRequestId?: string | null;
    status?: string | null;
    txid?: string | null;
    failureCode?: string | null;
    failureReason?: string | null;
    updatedAt?: string | null;
  } | null;
}

const SETTINGS_LINKS: Array<[string, string]> = [
  ["PROFILE", "/admin"],
  ["SECURITY", "/admin/risk-security"],
  ["EMPLOYEES & PERMISSIONS", "/admin/employees"],
  ["FEES", "/admin/fees"],
  ["COMPANY WALLETS", "/admin/wallets"],
  ["SYSTEM HEALTH", "/admin/system-health"],
  ["TELEGRAM", "/admin/telegram"],
  ["API & WEBHOOKS", "/admin/api-management"],
  ["WEBHOOKS", "/admin/webhooks"],
  ["AUDIT", "/admin/audit-logs"],
];

function SystemSettingsPage() {
  const saveSettings = useServerFn(updatePlatformSettings);
  const requestSweep = useServerFn(createManualFeeSweep);
  const runGasFreeProviderTest = useServerFn(testGasFreeProviderConnection);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [pendingFees, setPendingFees] = useState(0);
  const [sweepAmount, setSweepAmount] = useState("");
  const [gasfreeTest, setGasfreeTest] = useState<GasFreeDiagnosticsResult | null>(null);
  const [pending, setPending] = useState(false);
  const [gasfreeTestPending, setGasfreeTestPending] = useState(false);

  const load = useCallback(async () => {
    const [settingRes, walletRes, feeRes] = await Promise.all([
      supabase.from("system_settings").select("key, value, description").order("key"),
      supabase
        .from("wallets")
        .select(
          "id, name, address, network, purpose, is_active, onchain_usdt_balance, onchain_trx_balance",
        )
        .eq("is_active", true)
        .order("priority", { ascending: true }),
      supabase
        .from("fee_liabilities" as never)
        .select("amount")
        .in("status", ["ACCRUED", "PENDING_SWEEP"] as never),
    ]);
    if (settingRes.error) toast.error(settingRes.error.message);
    if (walletRes.error) toast.error(walletRes.error.message);
    const map: Record<string, string> = {};
    for (const row of (settingRes.data ?? []) as SettingRow[]) {
      map[row.key] = row.value == null ? "" : String(row.value).replace(/^"|"$/g, "");
    }
    setSettings(map);
    setWallets((walletRes.data ?? []) as unknown as WalletOption[]);
    setPendingFees(
      ((feeRes.data ?? []) as Array<{ amount?: number | string | null }>).reduce(
        (sum, row) => sum + Number(row.amount ?? 0),
        0,
      ),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await saveSettings({
        data: {
          vendorBuyerFeePercent: Number(settings["vendor_buyer_fee_percent"] ?? 0.5),
          vendorSellerFeePercent: Number(settings["vendor_seller_fee_percent"] ?? 0.5),
          wtronBuyRateInr: Number(settings["wtron_buy_rate_inr"] ?? 0),
          directSellFeePercent: Number(settings["direct_sell_fee_percent"] ?? 0),
          withdrawalFeeUsdt: Number(settings["withdrawal_fee_usdt"] ?? 0),
          feeCollectionWalletId: settings["fee_collection_wallet_id"] || null,
          feeCollectionWalletIdMainnet:
            settings["fee_collection_wallet_id_trc20_mainnet"] ||
            settings["fee_collection_wallet_id"] ||
            null,
          feeCollectionWalletIdNile: settings["fee_collection_wallet_id_trc20_nile"] || null,
          onChainSendEnabled: settings["on_chain_send_enabled"] === "true",
          tronSigningMainnetEnabled: settings["tron_signing_mainnet_enabled"] === "true",
          feeSweepEnabled: settings["fee_sweep_enabled"] === "true",
          feeSweepMode: settings["fee_sweep_mode"] === "automatic" ? "automatic" : "manual",
          feeSweepMinimumUsdt: Number(settings["fee_sweep_minimum_usdt"] ?? 25),
          gasfreeTransferEnabled: settings["gasfree_transfer_enabled"] === "true",
          gasfreeProvider: settings["gasfree_provider"] || "gasfree_open_api",
          gasfreeMainnetEnabled: settings["gasfree_mainnet_enabled"] === "true",
          gasfreeSupportedAsset: "USDT",
          gasfreePerTxMaxUsdt: Number(settings["gasfree_per_tx_max_usdt"] ?? 0),
          gasfreeUserDailyMaxUsdt: Number(settings["gasfree_user_daily_max_usdt"] ?? 0),
          gasfreeGlobalDailyMaxUsdt: Number(settings["gasfree_global_daily_max_usdt"] ?? 0),
          gasfreeKillSwitch: settings["gasfree_kill_switch"] !== "false",
          gasfreeProviderFeePolicy: settings["gasfree_provider_fee_policy"] || "provider_quote",
          gasfreeWtronFeePolicy:
            settings["gasfree_wtron_fee_policy"] || "standard_wallet_transfer_fee",
        },
      });
      toast.success("Settings saved");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    } finally {
      setPending(false);
    }
  }

  async function submitSweep() {
    if (!selectedWallet) {
      toast.error("Select a fee collection wallet first");
      return;
    }
    const amount = Number(sweepAmount || pendingFees);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a sweep amount");
      return;
    }
    setPending(true);
    try {
      await requestSweep({
        data: {
          destinationWalletId: selectedWallet.id,
          amount,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      toast.success("Manual fee sweep requested");
      setSweepAmount("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not request fee sweep");
    } finally {
      setPending(false);
    }
  }

  async function testGasFreeConnection() {
    setGasfreeTestPending(true);
    try {
      const result = (await runGasFreeProviderTest()) as unknown as GasFreeDiagnosticsResult;
      setGasfreeTest(result);
      if (result.mainnet.connected || result.nile.connected)
        toast.success("GasFree diagnostics updated");
      else toast.warning("GasFree providers are not reachable");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not test GasFree provider");
    } finally {
      setGasfreeTestPending(false);
    }
  }

  const selectedWallet = wallets.find(
    (wallet) => wallet.id === settings["fee_collection_wallet_id"],
  );
  const feeWallets = wallets.filter((wallet) => wallet.purpose === "FEE_COLLECTION");
  const mainnetFeeWallets = feeWallets.filter((wallet) => wallet.network === "trc20-mainnet");
  const nileFeeWallets = feeWallets.filter((wallet) => wallet.network === "trc20-nile");
  const selectedMainnetFeeWallet =
    wallets.find(
      (wallet) =>
        wallet.id ===
        (settings["fee_collection_wallet_id_trc20_mainnet"] ||
          settings["fee_collection_wallet_id"]),
    ) ?? null;
  const selectedNileFeeWallet =
    wallets.find((wallet) => wallet.id === settings["fee_collection_wallet_id_trc20_nile"]) ?? null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Settings"
        description="Operational settings are database-authoritative. Secrets are not displayed here."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SETTINGS_LINKS.map(([label, to]) => (
          <Button key={label} asChild variant="secondary" className="h-12 justify-start">
            <Link to={to}>{label}</Link>
          </Button>
        ))}
      </div>

      <form className="panel grid gap-4 p-5 md:grid-cols-2" onSubmit={submit}>
        <SettingInput
          label="Vendor buyer fee %"
          value={settings["vendor_buyer_fee_percent"] ?? "0.5"}
          onChange={(value) => setSettings({ ...settings, vendor_buyer_fee_percent: value })}
        />
        <SettingInput
          label="Vendor seller fee %"
          value={settings["vendor_seller_fee_percent"] ?? "0.5"}
          onChange={(value) => setSettings({ ...settings, vendor_seller_fee_percent: value })}
        />
        <SettingInput
          label="WTRON buy rate"
          value={settings["wtron_buy_rate_inr"] ?? "0"}
          onChange={(value) => setSettings({ ...settings, wtron_buy_rate_inr: value })}
        />
        <SettingInput
          label="Direct sell fee %"
          value={settings["direct_sell_fee_percent"] ?? "0"}
          onChange={(value) => setSettings({ ...settings, direct_sell_fee_percent: value })}
        />
        <SettingInput
          label="Withdrawal fee USDT"
          value={settings["withdrawal_fee_usdt"] ?? "0"}
          onChange={(value) => setSettings({ ...settings, withdrawal_fee_usdt: value })}
        />
        <ToggleInput
          label="On-chain Send"
          checked={settings["on_chain_send_enabled"] === "true"}
          onChange={(checked) =>
            setSettings({ ...settings, on_chain_send_enabled: String(checked) })
          }
        />
        <ToggleInput
          label="Mainnet Signing"
          checked={settings["tron_signing_mainnet_enabled"] === "true"}
          onChange={(checked) =>
            setSettings({ ...settings, tron_signing_mainnet_enabled: String(checked) })
          }
        />
        <ToggleInput
          label="Fee Sweep"
          checked={settings["fee_sweep_enabled"] === "true"}
          onChange={(checked) => setSettings({ ...settings, fee_sweep_enabled: String(checked) })}
        />
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Fee sweep mode</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={settings["fee_sweep_mode"] ?? "manual"}
            onChange={(event) => setSettings({ ...settings, fee_sweep_mode: event.target.value })}
          >
            <option value="manual">Manual</option>
            <option value="automatic">Automatic</option>
          </select>
        </div>
        <SettingInput
          label="Minimum sweep USDT"
          value={settings["fee_sweep_minimum_usdt"] ?? "25"}
          onChange={(value) => setSettings({ ...settings, fee_sweep_minimum_usdt: value })}
        />
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Mainnet fee collection wallet</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={
              settings["fee_collection_wallet_id_trc20_mainnet"] ||
              settings["fee_collection_wallet_id"] ||
              ""
            }
            onChange={(event) =>
              setSettings({
                ...settings,
                fee_collection_wallet_id_trc20_mainnet: event.target.value,
              })
            }
          >
            <option value="">No Mainnet fee wallet selected</option>
            {mainnetFeeWallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name} - {wallet.address}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nile testnet fee collection wallet</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={settings["fee_collection_wallet_id_trc20_nile"] ?? ""}
            onChange={(event) =>
              setSettings({ ...settings, fee_collection_wallet_id_trc20_nile: event.target.value })
            }
          >
            <option value="">No Nile fee wallet selected</option>
            {nileFeeWallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name} - {wallet.address}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-lg border p-3 md:col-span-2">
          <p className="font-medium">Fee Collection</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Accounting fees are accrued in the ledger. On-chain sweep is separate and only possible
            when a signing-capable source wallet exists. No fake TXID is created.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Metric label="Legacy Wallet" value={selectedWallet?.name ?? "None"} />
            <Metric label="Mainnet Wallet" value={selectedMainnetFeeWallet?.name ?? "None"} />
            <Metric label="Nile Wallet" value={selectedNileFeeWallet?.name ?? "None"} />
            <Metric label="Mainnet Address" value={selectedMainnetFeeWallet?.address ?? "-"} />
            <Metric label="Nile Address" value={selectedNileFeeWallet?.address ?? "-"} />
            <Metric
              label="Balance"
              value={`${Number(
                selectedMainnetFeeWallet?.onchain_usdt_balance ?? 0,
              )} USDT / ${Number(selectedMainnetFeeWallet?.onchain_trx_balance ?? 0)} TRX`}
            />
            <Metric label="Pending Fee Liability" value={`${pendingFees.toLocaleString()} USDT`} />
          </div>
          <div className="mt-4 flex flex-col gap-2 md:flex-row">
            <Input
              type="number"
              min="0.000001"
              step="0.000001"
              value={sweepAmount}
              onChange={(event) => setSweepAmount(event.target.value)}
              placeholder={`${pendingFees || 0}`}
              className="mono"
            />
            <Button type="button" variant="secondary" disabled={pending} onClick={submitSweep}>
              Create Manual Sweep
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Manual sweep records an auditable request. Actual broadcast remains gated by signer
            health, custody capability, and server-only signing flags.
          </p>
        </div>
        <div className="rounded-lg border p-3 md:col-span-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-medium">GasFree</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Address discovery is separate. Real GasFree transfers stay disabled until provider
                environment, limits and kill switches are deliberately configured.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={gasfreeTestPending}
              onClick={testGasFreeConnection}
            >
              {gasfreeTestPending ? "Testing..." : "Test Connection"}
            </Button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <ToggleInput
              label="GasFree transfers enabled"
              checked={settings["gasfree_transfer_enabled"] === "true"}
              onChange={(checked) =>
                setSettings({ ...settings, gasfree_transfer_enabled: String(checked) })
              }
            />
            <ToggleInput
              label="Emergency kill switch"
              checked={settings["gasfree_kill_switch"] !== "false"}
              onChange={(checked) =>
                setSettings({ ...settings, gasfree_kill_switch: String(checked) })
              }
            />
            <ToggleInput
              label="Mainnet enabled"
              checked={settings["gasfree_mainnet_enabled"] === "true"}
              onChange={(checked) =>
                setSettings({ ...settings, gasfree_mainnet_enabled: String(checked) })
              }
            />
            <SettingInput
              label="Provider"
              value={settings["gasfree_provider"] ?? "gasfree_open_api"}
              onChange={(value) => setSettings({ ...settings, gasfree_provider: value })}
            />
            <SettingInput
              label="Per transaction max USDT"
              value={settings["gasfree_per_tx_max_usdt"] ?? "0"}
              onChange={(value) => setSettings({ ...settings, gasfree_per_tx_max_usdt: value })}
            />
            <SettingInput
              label="Per-user daily max USDT"
              value={settings["gasfree_user_daily_max_usdt"] ?? "0"}
              onChange={(value) => setSettings({ ...settings, gasfree_user_daily_max_usdt: value })}
            />
            <SettingInput
              label="Global daily max USDT"
              value={settings["gasfree_global_daily_max_usdt"] ?? "0"}
              onChange={(value) =>
                setSettings({ ...settings, gasfree_global_daily_max_usdt: value })
              }
            />
            <SettingInput
              label="Provider fee policy"
              value={settings["gasfree_provider_fee_policy"] ?? "provider_quote"}
              onChange={(value) => setSettings({ ...settings, gasfree_provider_fee_policy: value })}
            />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Metric label="Mainnet Provider" value={gasfreeTest?.mainnet.message ?? "Not tested"} />
            <Metric
              label="Mainnet Credentials"
              value={gasfreeTest?.mainnet.credentialState ?? "Missing"}
            />
            <Metric label="Mainnet Env" value="GASFREE_PROVIDER_BASE_URL / GASFREE_API_KEY" />
            <Metric label="Nile Provider" value={gasfreeTest?.nile.message ?? "Not tested"} />
            <Metric
              label="Nile Credentials"
              value={gasfreeTest?.nile.credentialState ?? "Missing"}
            />
            <Metric
              label="Nile Env"
              value="GASFREE_NILE_PROVIDER_BASE_URL / GASFREE_NILE_API_KEY"
            />
            <Metric
              label="Mainnet Service Provider"
              value={gasfreeTest?.mainnet.serviceProvider ?? "Auto-discovered / pinned"}
            />
            <Metric
              label="Nile Service Provider"
              value={gasfreeTest?.nile.serviceProvider ?? "Auto-discovered / pinned"}
            />
            <Metric label="Supported Network" value="Mainnet production / Nile diagnostics" />
            <Metric label="Supported Asset" value="USDT TRC20" />
            <Metric
              label="GasFree Transfer"
              value={
                settings["gasfree_transfer_enabled"] === "true" &&
                settings["gasfree_kill_switch"] === "false"
                  ? "Enabled"
                  : "Disabled"
              }
            />
            <Metric
              label="Readiness"
              value={gasfreeTest?.productionReadiness?.replaceAll("_", " ") ?? "Not tested"}
            />
            <Metric
              label="Last Provider Request"
              value={gasfreeTest?.lastProviderRequest?.providerRequestId ?? "-"}
            />
            <Metric
              label="Last Provider Error"
              value={gasfreeTest?.lastProviderRequest?.failureReason ?? "-"}
            />
            <Metric label="Secrets" value="GASFREE_API_KEY / GASFREE_API_SECRET: server env only" />
            {gasfreeTest?.mainnet.providerAddress ? (
              <Metric
                label="Mainnet Provider Address"
                value={gasfreeTest.mainnet.providerAddress}
              />
            ) : null}
            {gasfreeTest?.nile.providerAddress ? (
              <Metric label="Nile Provider Address" value={gasfreeTest.nile.providerAddress} />
            ) : null}
            {gasfreeTest?.mainnet.tokenAddress ? (
              <Metric label="Mainnet Token Contract" value={gasfreeTest.mainnet.tokenAddress} />
            ) : null}
            {gasfreeTest?.nile.tokenAddress ? (
              <Metric label="Nile Token Contract" value={gasfreeTest.nile.tokenAddress} />
            ) : null}
          </div>
        </div>
        <Button className="md:col-span-2" disabled={pending}>
          Save Settings
        </Button>
      </form>
    </div>
  );
}

function SettingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ToggleInput({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-medium">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mono mt-1 break-all text-sm">{value}</p>
    </div>
  );
}
