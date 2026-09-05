import { Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MiniIcons, TronIcon, UsdtIcon, type MiniIcon } from "@/components/mini-app/crypto-icons";
import {
  V17EmptyLine,
  V17MetricGrid,
  V17Screen,
  V17Section,
  V17StatusPill,
  V17Surface,
} from "@/components/mini-app/shared/v17-primitives";
import { v17Money } from "@/components/mini-app/shared/v17-format";
import { networkLabelForMini, technicalTextDirection, type MiniT } from "@/lib/mini-i18n";
import { shortenHash } from "@/lib/chain";
import { walletDisplayBalance } from "@/lib/wallet-state";

export interface MiniWalletRow {
  id: string;
  name?: string | null;
  address?: string | null;
  network?: "trc20-mainnet" | "trc20-nile" | string | null;
  wallet_type?: string | null;
  onchain_balance?: number | string | null;
  onchain_usdt_balance?: number | string | null;
  onchain_trx_balance?: number | string | null;
  backup_status?: string | null;
  gas_sponsorship_status?: string | null;
  is_default?: boolean | null;
  created_at?: string | null;
}

type WalletTargetScreen =
  "wallet-create" | "wallet-import" | "wallet-detail" | "wallet-receive" | "send" | "wallet-backup";

function gasfreeStatusLabel(status: string | null | undefined, t: MiniT) {
  const normalized = String(status ?? "unavailable").toLowerCase();
  if (normalized === "available") return t("available");
  if (normalized === "limited") return t("limited");
  if (normalized === "enabled") return t("enabled");
  if (normalized === "check_failed") return t("checkFailed");
  if (normalized === "unknown") return t("statusUnavailable");
  return t("unavailable");
}

function TokenMetric({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-[14px] border border-[#222837] bg-white/5 p-3">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[11px] font-semibold">{label}</p>
      </div>
      <p className="mono mt-2 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-[10px] text-slate-500">{sub}</p>
    </div>
  );
}

function NetworkBadge({ wallet, t }: { wallet: MiniWalletRow; t: MiniT }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
      <TronIcon className="h-4 w-4" />
      {networkLabelForMini(wallet.network, t)} {(wallet.wallet_type ?? "standard").toUpperCase()}
    </span>
  );
}

function preservedNetworkLabel(wallet: MiniWalletRow, t: MiniT) {
  if (!wallet.network) return "Legacy / Unclassified Network";
  return networkLabelForMini(wallet.network, t);
}

function formatWalletDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function PreservedWalletCard({ wallet, t }: { wallet: MiniWalletRow; t: MiniT }) {
  const created = formatWalletDate(wallet.created_at);
  return (
    <div className="rounded-[17px] border border-[#222837] bg-[#0f1219] p-[14px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-slate-100">{wallet.name ?? "Wallet"}</p>
          <p
            className="mono mt-1 break-all text-[10px] leading-snug text-slate-500"
            dir={technicalTextDirection()}
            title={wallet.address ?? undefined}
          >
            {wallet.address ?? "Address unavailable"}
          </p>
        </div>
        <V17StatusPill label="READ ONLY" tone="muted" />
      </div>
      <V17MetricGrid
        items={[
          ["Original network", preservedNetworkLabel(wallet, t)],
          [t("walletType"), (wallet.wallet_type ?? "standard").toUpperCase()],
          ["USDT balance", `${v17Money(walletDisplayBalance(wallet))} USDT`],
          ["TRX balance", `${v17Money(Number(wallet.onchain_trx_balance ?? 0), "TRX")} TRX`],
          ...(created ? ([["Created", created]] as [string, string][]) : []),
        ]}
      />
      <p className="mt-3 text-[10.5px] leading-relaxed text-slate-500">
        Preserved wallet data is visible for your records, but it is not eligible for Mainnet send,
        receive, P2P, GasFree, or active-wallet selection.
      </p>
    </div>
  );
}

function WalletCard({
  wallet,
  active,
  t,
  onSelect,
  onOpen,
}: {
  wallet: MiniWalletRow;
  active: boolean;
  t: MiniT;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      className={`min-w-[74%] snap-center rounded-2xl border p-3 text-left ${active ? "border-primary bg-primary/12" : "border-white/10 bg-white/6"}`}
      onClick={() => {
        onSelect();
        onOpen();
      }}
    >
      <div className="flex items-center justify-between">
        <NetworkBadge wallet={wallet} t={t} />
        <TronIcon />
      </div>
      <p className="mt-4 text-base font-semibold">{wallet.name ?? "Wallet"}</p>
      <p className="mono mt-1 break-all text-xs text-slate-400">
        {shortenHash(wallet.address, 10)}
      </p>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-xs text-slate-400">USDT</p>
          <p className="mono text-xl font-semibold">{v17Money(walletDisplayBalance(wallet))}</p>
        </div>
        {wallet.is_default ? (
          <span className="rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
            {t("active")}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        {t("gasSponsorship")}: {gasfreeStatusLabel(wallet.gas_sponsorship_status, t)}
      </p>
    </button>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: MiniIcon;
  label: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button className="text-center" onClick={() => void onClick()}>
      <span className="mx-auto grid h-[45px] w-[45px] place-items-center rounded-[14px] border border-[#222837] bg-[#10131a] text-[#7ba0ff]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="mt-2 block text-[11px] font-normal text-slate-300">{label}</span>
    </button>
  );
}

function WalletSummary({
  wallet,
  t,
  onReceive,
  onSend,
  onBackup,
}: {
  wallet: MiniWalletRow | null;
  t: MiniT;
  onReceive: () => void;
  onSend: () => void;
  onBackup: () => void;
}) {
  return wallet ? (
    <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
      <p className="font-semibold">{wallet.name}</p>
      <p className="mono mt-1 break-all text-xs text-slate-400" dir={technicalTextDirection()}>
        {wallet.address}
      </p>
      <V17MetricGrid
        items={[
          [t("walletType"), (wallet.wallet_type ?? "standard").toUpperCase()],
          [t("network"), networkLabelForMini(wallet.network, t)],
          [t("backup"), wallet.backup_status ?? "not_backed_up"],
          [t("gasSponsorship"), gasfreeStatusLabel(wallet.gas_sponsorship_status, t)],
        ]}
      />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button size="sm" onClick={onReceive}>
          {t("receive")}
        </Button>
        <Button size="sm" variant="secondary" onClick={onSend}>
          {t("send")}
        </Button>
        <Button size="sm" variant="secondary" onClick={onBackup}>
          {t("backup")}
        </Button>
      </div>
    </div>
  ) : (
    <V17EmptyLine>{t("noWalletSelected")}</V17EmptyLine>
  );
}

export default function WalletScreen({
  wallets,
  preservedWallets = [],
  selectedWallet,
  t,
  onNavigate,
  onSelect,
}: {
  wallets: MiniWalletRow[];
  preservedWallets?: MiniWalletRow[];
  selectedWallet: MiniWalletRow | null;
  t: MiniT;
  onNavigate: (screen: WalletTargetScreen) => Promise<void>;
  onSelect: (wallet: MiniWalletRow) => void;
}) {
  const total = wallets.reduce((sum, wallet) => sum + walletDisplayBalance(wallet), 0);
  const totalTrx = wallets.reduce(
    (sum, wallet) => sum + Number(wallet.onchain_trx_balance ?? 0),
    0,
  );
  if (!wallets.length) {
    return (
      <V17Screen title={t("walletSelector")} subtitle={t("selfCustodyWallet")}>
        <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4 text-center">
          <Wallet className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 text-xl font-semibold tracking-normal">{t("createWallet")}</h2>
          <p className="mt-2 text-sm text-slate-400">{t("selfCustodyWallet")}</p>
          <div className="mt-5 grid gap-2">
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => onNavigate("wallet-create")}
            >
              {t("createWallet")}
            </Button>
            <Button variant="secondary" onClick={() => onNavigate("wallet-import")}>
              {t("importExistingWallet")}
            </Button>
          </div>
        </div>
        {preservedWallets.length ? (
          <V17Section title="Preserved / Historical Wallets">
            <div className="mb-3 rounded-[17px] border border-[#22304a] bg-[#101722] p-[14px] text-[11px] leading-relaxed text-slate-400">
              Your previous wallet data is preserved below. Create/import a Mainnet wallet to use
              current WTRON transfers.
            </div>
            <div className="space-y-3">
              {preservedWallets.map((wallet) => (
                <PreservedWalletCard key={wallet.id} wallet={wallet} t={t} />
              ))}
            </div>
          </V17Section>
        ) : null}
      </V17Screen>
    );
  }
  return (
    <V17Screen title={t("walletSelector")} subtitle={t("selfCustodyWallet")}>
      <V17Surface className="p-3">
        <p className="text-xs font-semibold uppercase text-slate-500">{t("portfolioBalance")}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <TokenMetric
            icon={<UsdtIcon />}
            label="USDT"
            value={v17Money(total)}
            sub="TRC20 on TRON"
          />
          <TokenMetric
            icon={<TronIcon />}
            label="TRX"
            value={v17Money(totalTrx, "TRX")}
            sub="TRON native"
          />
        </div>
      </V17Surface>
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => onNavigate("wallet-create")}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("createWallet")}
        </Button>
        <Button variant="secondary" onClick={() => onNavigate("wallet-import")}>
          {t("importWallet")}
        </Button>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2">
        {wallets.map((wallet) => (
          <WalletCard
            key={wallet.id}
            wallet={wallet}
            active={wallet.id === selectedWallet?.id}
            t={t}
            onSelect={() => onSelect(wallet)}
            onOpen={() => onNavigate("wallet-detail")}
          />
        ))}
      </div>
      <V17Section title={t("selectedWallet")}>
        <WalletSummary
          wallet={selectedWallet}
          t={t}
          onReceive={() => onNavigate("wallet-receive")}
          onSend={() => onNavigate("send")}
          onBackup={() => onNavigate("wallet-backup")}
        />
      </V17Section>
      {preservedWallets.length ? (
        <V17Section title="Preserved / Historical Wallets">
          <div className="mb-3 rounded-[17px] border border-[#22304a] bg-[#101722] p-[14px] text-[11px] leading-relaxed text-slate-400">
            These wallets remain visible for records only. They are excluded from Mainnet portfolio
            totals and cannot be used for current WTRON transfers.
          </div>
          <div className="space-y-3">
            {preservedWallets.map((wallet) => (
              <PreservedWalletCard key={wallet.id} wallet={wallet} t={t} />
            ))}
          </div>
        </V17Section>
      ) : null}
    </V17Screen>
  );
}
