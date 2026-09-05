import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ChevronDown,
  CircleCheck,
  CircleX,
  Copy,
  ChevronLeft,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  QrCode,
  ScanLine,
  Share2,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { V17Avatar } from "@/components/v17-avatar";
import {
  GasFreeIcon,
  MiniIcons,
  TronIcon,
  UsdtIcon,
  type MiniIcon,
} from "@/components/mini-app/crypto-icons";
import { qrToDataUrl } from "@/lib/mini-app-qr";
import {
  formatUsdt,
  isTronAddress,
  networkConfig,
  shortenHash,
  type ChainNetwork,
} from "@/lib/chain";
import { networkLabelForMini, technicalTextDirection, type MiniT } from "@/lib/mini-i18n";
import {
  extractTronAddressFromQrPayload,
  gasfreeCapabilityNeedsCheck,
  gasfreeCapabilityStatus,
  paymentMethodDisplay,
} from "@/lib/mini-wallet-ui";
import { onChainSendEnabled, walletDisplayBalance } from "@/lib/wallet-state";
import type {
  DepositRow,
  DirectSellOrderRow,
  DirectSellPaymentItemRow,
  GasFreeReadiness,
  GasFreeTransferResult,
  MiniScreen,
  OrderRow,
  PaymentMethodRow,
  ProfileSummary,
  ReceiveAsset,
  StandardTransferPreview,
  TransactionRow,
  VendorListingRow,
  WalletHistoryAssetFilter,
  WalletHistoryDirectionFilter,
  WalletResourceSnapshot,
  WalletRow,
} from "@/routes/mini-app";

interface TelegramWebApp {
  showScanQrPopup?: (
    params: { text?: string },
    callback: (payload: string) => boolean | void,
  ) => void;
  closeScanQrPopup?: () => void;
  onEvent?: (eventType: "scanQrPopupClosed", handler: () => void) => void;
  offEvent?: (eventType: "scanQrPopupClosed", handler: () => void) => void;
}

interface TelegramWindow extends Window {
  Telegram?: { WebApp?: TelegramWebApp };
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): {
    detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
  };
  getSupportedFormats?: () => Promise<string[]>;
}
function money(value: unknown, currency = "USDT") {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return currency === "INR" ? "INR 0.00" : formatUsdt(0);
  if (currency === "INR") {
    return `INR ${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  return formatUsdt(number);
}

function safeAddress(address?: string | null) {
  return address && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address) ? address : "";
}

function supportedWalletNetwork(network: string | null | undefined): ChainNetwork {
  return network === "trc20-nile" ? "trc20-nile" : "trc20-mainnet";
}

function copyText(value: string, label = "Copied") {
  if (!value) return;
  void navigator.clipboard.writeText(value).then(() => toast.success(label));
}

type QrScanErrorCode = "denied" | "unsupported" | "invalid" | "cancelled";

class QrScanError extends Error {
  code: QrScanErrorCode;

  constructor(code: QrScanErrorCode) {
    super(code);
    this.code = code;
  }
}

function qrScanErrorMessage(error: unknown) {
  const code = error instanceof QrScanError ? error.code : "unsupported";
  if (code === "denied") return "Camera access was denied. Paste the address instead.";
  if (code === "invalid") return "QR code does not contain a valid TRON address.";
  if (code === "cancelled") return "QR scan cancelled.";
  return "QR scanning is not supported on this device. Paste the address instead.";
}

async function scanRecipientQrWithTelegram(webApp: TelegramWebApp) {
  const showScanQrPopup = webApp.showScanQrPopup;
  if (!showScanQrPopup) throw new QrScanError("unsupported");
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      webApp.offEvent?.("scanQrPopupClosed", onClosed);
      window.clearTimeout(timeout);
    };
    const onClosed = () => {
      cleanup();
      reject(new QrScanError("cancelled"));
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      webApp.closeScanQrPopup?.();
      reject(new QrScanError("cancelled"));
    }, 60_000);
    webApp.onEvent?.("scanQrPopupClosed", onClosed);
    showScanQrPopup({ text: "Scan recipient TRON address" }, (payload) => {
      const address = extractTronAddressFromQrPayload(payload);
      if (!address) {
        cleanup();
        webApp.closeScanQrPopup?.();
        reject(new QrScanError("invalid"));
        return true;
      }
      cleanup();
      resolve(address);
      return true;
    });
  });
}

async function scanRecipientQrWithCamera() {
  const detectorConstructor = (
    window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
  ).BarcodeDetector;
  if (!navigator.mediaDevices?.getUserMedia || !detectorConstructor) {
    throw new QrScanError("unsupported");
  }
  const supported = detectorConstructor.getSupportedFormats
    ? await detectorConstructor.getSupportedFormats().catch(() => [])
    : ["qr_code"];
  if (!supported.includes("qr_code")) throw new QrScanError("unsupported");

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch {
    throw new QrScanError("denied");
  }

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  video.style.cssText =
    "position:fixed;inset:0;z-index:9999;width:100vw;height:100vh;object-fit:cover;background:#000;";
  document.body.appendChild(video);

  const stop = () => {
    stream.getTracks().forEach((track) => track.stop());
    video.remove();
  };

  try {
    await video.play();
    const detector = new detectorConstructor({ formats: ["qr_code"] });
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30_000) {
      const codes = await detector.detect(video).catch(() => []);
      for (const code of codes) {
        const address = extractTronAddressFromQrPayload(code.rawValue ?? "");
        if (address) return address;
      }
      if (codes.length > 0) throw new QrScanError("invalid");
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    throw new QrScanError("cancelled");
  } finally {
    stop();
  }
}

async function scanRecipientQr() {
  const webApp = typeof window !== "undefined" ? (window as TelegramWindow).Telegram?.WebApp : null;
  if (webApp?.showScanQrPopup) return await scanRecipientQrWithTelegram(webApp);
  return await scanRecipientQrWithCamera();
}

function shareText(value: string) {
  if (!value) return;
  if (navigator.share) {
    void navigator.share({ text: value }).catch(() => undefined);
    return;
  }
  copyText(value, "Receipt copied");
}

function receiptShareText(input: {
  title: string;
  asset?: string | null;
  amount?: unknown;
  from?: string | null;
  to?: string | null;
  network?: string | null;
  txid?: string | null;
  status?: string | null;
}) {
  return [
    input.title,
    `Asset: ${input.asset ?? "USDT"}`,
    `Amount: ${money(input.amount, input.asset ?? "USDT")} ${input.asset ?? "USDT"}`,
    `From: ${input.from ?? "Not available"}`,
    `To: ${input.to ?? "Not available"}`,
    `Network: ${input.network ?? "TRON"}`,
    `Status: ${input.status ?? "Pending"}`,
    input.txid ? `TXID: ${input.txid}` : "TXID: Not broadcast",
  ].join("\n");
}

function gasfreeStatusLabel(status: string | null | undefined, t: MiniT) {
  const normalized = String(status ?? "unavailable").toLowerCase();
  if (normalized === "available") return t("available");
  if (normalized === "limited") return t("limited");
  if (normalized === "enabled") return t("enabled");
  if (normalized === "check_failed") return t("checkFailed");
  if (normalized === "unknown") return t("statusUnavailable");
  return t("unavailable");
}

function isConfirmedTransferStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();
  return ["confirmed", "completed", "success", "succeed"].includes(normalized);
}

function cleanTransferStatusLabel(status: string | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();
  if (isConfirmedTransferStatus(status)) return "Successful";
  if (["failed", "rejected", "cancelled", "canceled"].includes(normalized)) return "Failed";
  if (["broadcast", "broadcasting", "confirming", "pending", "submitted"].includes(normalized)) {
    return "Processing";
  }
  return status ? String(status).replaceAll("_", " ") : "Processing";
}

function friendlyMiniError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  const parsed = (() => {
    try {
      return JSON.parse(message) as { error?: { code?: string; message?: string } } | unknown[];
    } catch {
      return null;
    }
  })();
  if (Array.isArray(parsed)) return fallback;
  const code = parsed && !Array.isArray(parsed) ? (parsed.error?.code ?? "") : "";
  if (
    lower.includes("invalid_type") ||
    lower.includes("too_big") ||
    lower.includes("zod") ||
    lower.includes('"path"')
  ) {
    return fallback;
  }
  if (code === "INSUFFICIENT_BALANCE" || lower.includes("insufficient_trx")) {
    return "Insufficient TRX balance to cover the transfer fee.";
  }
  if (lower.includes("insufficient_usdt")) {
    return "Insufficient USDT balance for this transfer.";
  }
  if (lower.includes("tron_signer_not_authorized")) {
    return "This wallet is not authorized to sign this transaction.";
  }
  if (lower.includes("gasfree_provider_cost_too_high")) {
    return "Transfers are temporarily unavailable.";
  }
  if (lower.includes("another send is already active")) {
    return "A previous transfer is still being processed. Please wait while its status is confirmed.";
  }
  if (lower.includes("transfers_temporarily_unavailable")) {
    return "Transfers are temporarily unavailable.";
  }
  if (lower.includes("transfers_unavailable_for_account")) {
    return "Transfers are unavailable for this account.";
  }
  if (lower.includes("fee_collection_wallet_not_configured")) {
    return "Transfer fee collection is not configured for this network.";
  }
  if (
    lower.includes("duplicate key") ||
    lower.includes("user_wallets_address_key") ||
    lower.includes("user_wallets_address_network_key") ||
    lower.includes("violates unique constraint")
  ) {
    return "Wallet already exists. Existing wallet opened.";
  }
  if (lower.includes("temporarily locked")) return "Too many failed attempts. Try again later.";
  if (
    lower.includes("supabase") ||
    lower.includes("postgres") ||
    lower.includes("rpc") ||
    lower.includes("trongrid") ||
    lower.includes("stack")
  ) {
    return fallback;
  }
  return message || fallback;
}

export function WalletDetailScreen({
  vendorMode,
  wallet,
  gasfreeWallet,
  wallets,
  transactions,
  resources,
  resourcesCheckedAt,
  busy,
  t,
  onNavigate,
  onSelectWallet,
  onCreateWallet,
  onImportWallet,
  onManageWallets,
  onSelectAsset,
  onSelectTransaction,
  onRefresh,
  onSetDefault,
}: {
  vendorMode?: boolean;
  wallet: WalletRow | null;
  gasfreeWallet: WalletRow | null;
  wallets: WalletRow[];
  transactions: TransactionRow[];
  resources: WalletResourceSnapshot | null;
  resourcesCheckedAt: string;
  busy: boolean;
  t: MiniT;
  onNavigate: (screen: MiniScreen) => Promise<void>;
  onSelectWallet: (wallet: WalletRow) => void;
  onCreateWallet: () => void;
  onImportWallet: () => void;
  onManageWallets: () => void;
  onSelectAsset: (asset: ReceiveAsset) => void;
  onSelectTransaction: (transaction: TransactionRow, backTo?: MiniScreen) => void;
  onRefresh: () => void;
  onSetDefault: () => void;
}) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  if (!wallet)
    return (
      <Screen title={t("walletDetail")} subtitle={t("selectWalletFirst")}>
        <EmptyLine>{t("noWalletSelected")}</EmptyLine>
      </Screen>
    );
  const balance = walletDisplayBalance(wallet);
  const isGasfreeWallet = wallet.wallet_type === "gasfree" || wallet.wallet_role === "gasfree";
  const typeLabel = (wallet.wallet_type ?? "standard").toUpperCase();
  const gasReady = Boolean(gasfreeWallet?.address);
  const gasStatus = gasReady
    ? t("gasfreeWalletReady")
    : gasfreeStatusLabel(wallet.gas_sponsorship_status, t);
  const recentRows = transactions.slice(0, 4);
  const address = safeAddress(wallet.address);
  const resourceState = walletResourceDisplay(resources);
  return (
    <Screen title={t("wallet")} subtitle={t("selfCustodyWallet")} compact>
      <section className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <button
            className="flex min-w-0 items-center gap-3 text-left"
            onClick={() => setSelectorOpen(true)}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/12">
              <Wallet className="h-5 w-5 text-primary" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-lg font-semibold leading-tight">
                <span className="truncate">{wallet.name ?? t("wallet")}</span>
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {networkLabelForMini(wallet.network, t)} / {typeLabel}
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <IconButton
              icon={QrCode}
              label={t("receive")}
              onClick={() => onNavigate("wallet-receive")}
            />
            <IconButton
              icon={MoreHorizontal}
              label={t("more")}
              onClick={() => onNavigate("wallet-more")}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            className="flex min-w-0 items-center gap-2 text-sm text-slate-300"
            dir={technicalTextDirection()}
            onClick={() => copyText(address, t("addressCopied"))}
          >
            <span className="truncate">{shortenHash(address, 9)}</span>
            <Copy className="h-4 w-4 text-primary" />
          </button>
          <button
            className="flex shrink-0 items-center gap-2 text-sm text-slate-300"
            onClick={() => onNavigate("wallet-gasfree")}
          >
            <span>GasFree</span>
            <StatusPill
              label={gasStatus}
              tone={gasReady || wallet.gas_sponsorship_status === "available" ? "success" : "muted"}
            />
            <ChevronDown className="h-3 w-3 -rotate-90 text-slate-500" />
          </button>
        </div>

        <div className="py-2">
          <p className="text-xs text-slate-500">{t("portfolioBalance")}</p>
          <div className="mt-2 space-y-1">
            {busy ? (
              <SkeletonLine className="h-10 w-44" />
            ) : (
              <>
                <p className="text-2xl font-semibold tracking-normal tabular-nums">
                  {money(balance)} USDT
                </p>
                {!isGasfreeWallet ? (
                  <p className="text-base text-slate-400 tabular-nums">
                    {money(wallet.onchain_trx_balance ?? 0, "TRX")} TRX
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <QuickAction
            icon={MiniIcons.send}
            label={t("send")}
            onClick={() => onNavigate(isGasfreeWallet ? "wallet-gasfree" : "send")}
          />
          <QuickAction
            icon={MiniIcons.receive}
            label={t("receive")}
            onClick={() => onNavigate("wallet-receive")}
          />
          {vendorMode ? (
            <QuickAction icon={MiniIcons.trade} label="Sell" onClick={() => onNavigate("trade")} />
          ) : (
            <QuickAction icon={MiniIcons.p2p} label="Buy" onClick={() => onNavigate("p2p")} />
          )}
          <QuickAction
            icon={MiniIcons.history}
            label={t("history")}
            onClick={() => onNavigate("wallet-history")}
          />
        </div>

        <Surface className="p-4">
          <SectionHeader
            title={t("resources")}
            action={busy ? t("refreshing") : t("refresh")}
            onAction={onRefresh}
          />
          {resources ? (
            <div className="mt-3 grid gap-3">
              <ResourceBar
                label={t("energy")}
                used={resourceState.energyUsed}
                limit={resourceState.energyLimit}
              />
              <ResourceBar
                label={t("bandwidth")}
                used={resourceState.bandwidthUsed}
                limit={resourceState.bandwidthLimit}
              />
              <p className="text-[11px] text-slate-500">
                {resourcesCheckedAt
                  ? `${t("lastUpdated")} ${new Date(resourcesCheckedAt).toLocaleTimeString()}`
                  : ""}
              </p>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/4 px-3 py-2">
              <span className="text-xs text-slate-500">{t("resourceUnavailable")}</span>
              <button className="text-xs text-primary" onClick={() => onRefresh()}>
                {t("refresh")}
              </button>
            </div>
          )}
        </Surface>
      </section>
      <Section title={t("tokens")} action="+" onAction={onRefresh}>
        <AssetRow
          icon={<UsdtIcon />}
          symbol="USDT"
          name={t("tetherUsd")}
          network="TRC20"
          amount={`${money(balance)} USDT`}
          onClick={() => onSelectAsset("USDT")}
        />
        {!isGasfreeWallet ? (
          <AssetRow
            icon={<TronIcon />}
            symbol="TRX"
            name="TRON"
            network="TRON"
            amount={`${money(wallet.onchain_trx_balance ?? 0, "TRX")} TRX`}
            onClick={() => onSelectAsset("TRX")}
          />
        ) : null}
      </Section>
      <TransactionList
        title={t("recentWalletActivity")}
        rows={recentRows}
        empty={t("noOnchainWalletActivity")}
        t={t}
        onSelect={(transaction) => onSelectTransaction(transaction)}
        action={t("viewAll")}
        onAction={() => onNavigate("wallet-history")}
      />
      {busy ? <p className="text-center text-xs text-slate-500">{t("refreshing")}</p> : null}
      {selectorOpen ? (
        <WalletSelectorSheet
          wallets={wallets}
          selectedWalletId={wallet.id}
          t={t}
          onClose={() => setSelectorOpen(false)}
          onCreate={() => {
            setSelectorOpen(false);
            onCreateWallet();
          }}
          onImport={() => {
            setSelectorOpen(false);
            onImportWallet();
          }}
          onManage={() => {
            setSelectorOpen(false);
            onManageWallets();
          }}
          onSelect={(nextWallet) => {
            onSelectWallet(nextWallet);
            setSelectorOpen(false);
          }}
        />
      ) : null}
    </Screen>
  );
}

function filterWalletTransactions(
  rows: TransactionRow[],
  asset: WalletHistoryAssetFilter,
  direction: WalletHistoryDirectionFilter,
) {
  return rows.filter((row) => {
    const currency = String(row.currency ?? "").toUpperCase();
    const rowDirection = String(row.direction ?? "");
    return (
      (asset === "ALL" || currency === asset) && (direction === "ALL" || rowDirection === direction)
    );
  });
}

export function WalletHistoryScreen({
  wallet,
  rows,
  assetFilter,
  setAssetFilter,
  directionFilter,
  setDirectionFilter,
  hasMore,
  busy,
  t,
  onLoadMore,
  onSelectTransaction,
}: {
  wallet: WalletRow | null;
  rows: TransactionRow[];
  assetFilter: WalletHistoryAssetFilter;
  setAssetFilter: (filter: WalletHistoryAssetFilter) => void;
  directionFilter: WalletHistoryDirectionFilter;
  setDirectionFilter: (filter: WalletHistoryDirectionFilter) => void;
  hasMore: boolean;
  busy: boolean;
  t: MiniT;
  onLoadMore: () => void;
  onSelectTransaction: (transaction: TransactionRow) => void;
}) {
  const isGasfreeWallet = wallet?.wallet_type === "gasfree" || wallet?.wallet_role === "gasfree";
  const effectiveAssetFilter = isGasfreeWallet && assetFilter === "TRX" ? "USDT" : assetFilter;
  const filtered = useMemo(
    () => filterWalletTransactions(rows, effectiveAssetFilter, directionFilter),
    [rows, effectiveAssetFilter, directionFilter],
  );
  return (
    <Screen title={t("walletHistory")} subtitle={wallet?.name ?? t("selectedWalletSubtitle")}>
      {wallet ? (
        <Surface className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{wallet.name ?? "Wallet"}</p>
              <p className="mono truncate text-xs text-slate-400" dir={technicalTextDirection()}>
                {wallet.address}
              </p>
            </div>
            <NetworkBadge wallet={wallet} t={t} />
          </div>
        </Surface>
      ) : null}
      <Tabs
        value={effectiveAssetFilter}
        setValue={(value) => setAssetFilter(value as WalletHistoryAssetFilter)}
        items={
          isGasfreeWallet
            ? [
                ["ALL", t("all")],
                ["USDT", "USDT"],
              ]
            : [
                ["ALL", t("all")],
                ["USDT", "USDT"],
                ["TRX", "TRX"],
              ]
        }
      />
      <Tabs
        value={directionFilter}
        setValue={(value) => setDirectionFilter(value as WalletHistoryDirectionFilter)}
        items={[
          ["ALL", t("all")],
          ["in", t("received")],
          ["out", t("sent")],
        ]}
      />
      <WalletTransactionRows rows={filtered} t={t} onSelect={onSelectTransaction} />
      {hasMore ? (
        <Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={busy}
          onClick={onLoadMore}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t("loadMore")}
        </Button>
      ) : null}
    </Screen>
  );
}

export function WalletAssetDetailScreen({
  wallet,
  asset,
  rows,
  t,
  onSend,
  onReceive,
  onSelectTransaction,
}: {
  wallet: WalletRow | null;
  asset: ReceiveAsset;
  rows: TransactionRow[];
  t: MiniT;
  onSend: () => void;
  onReceive: () => void;
  onSelectTransaction: (transaction: TransactionRow) => void;
}) {
  const balance =
    asset === "USDT" ? walletDisplayBalance(wallet) : Number(wallet?.onchain_trx_balance ?? 0);
  const assetRows = useMemo(
    () => rows.filter((row) => String(row.currency ?? "").toUpperCase() === asset),
    [rows, asset],
  );
  const Icon = asset === "USDT" ? UsdtIcon : TronIcon;
  return (
    <Screen title={asset} subtitle={asset === "USDT" ? `${t("tetherUsd")} / TRC20` : "TRON"}>
      <Surface className="p-4 text-center">
        <Icon className="mx-auto h-14 w-14" />
        <p className="mt-3 text-xl font-semibold">{asset}</p>
        <p className="text-sm text-slate-500">
          {asset === "USDT" ? `${t("tetherUsd")} / TRC20` : "TRON"}
        </p>
        <p className="mt-5 text-2xl font-semibold tabular-nums">
          {money(balance, asset)} {asset}
        </p>
        <p className="mt-1 text-xs text-slate-500">{networkLabelForMini(wallet?.network, t)}</p>
      </Surface>
      <div className="grid grid-cols-2 gap-3">
        <QuickAction icon={MiniIcons.send} label={t("send")} onClick={onSend} />
        <QuickAction icon={MiniIcons.receive} label={t("receive")} onClick={onReceive} />
      </div>
      <Section title={`${asset} ${t("transactions")}`}>
        <WalletTransactionRows rows={assetRows} t={t} onSelect={onSelectTransaction} />
      </Section>
    </Screen>
  );
}

export function WalletTransactionDetailScreen({
  wallet,
  transaction,
  t,
}: {
  wallet: WalletRow | null;
  transaction: TransactionRow | null;
  t: MiniT;
}) {
  if (!wallet || !transaction) {
    return (
      <Screen title={t("transactionDetail")} subtitle={t("walletActivity")}>
        <EmptyLine>{t("selectTransactionFirst")}</EmptyLine>
      </Screen>
    );
  }
  const network = networkConfig(supportedWalletNetwork(wallet.network));
  const direction = transaction.direction === "in" ? t("received") : t("sent");
  const counterparty = safeAddress(transaction.counterparty_address);
  const from = transaction.direction === "in" ? counterparty : safeAddress(wallet.address);
  const to = transaction.direction === "in" ? safeAddress(wallet.address) : counterparty;
  const statusLabel = cleanTransferStatusLabel(transaction.status);
  const confirmed = isConfirmedTransferStatus(transaction.status);
  return (
    <Screen
      title={`${direction} ${transaction.currency ?? "USDT"}`}
      subtitle={networkLabelForMini(wallet.network, t)}
    >
      <Surface className="p-4 text-center">
        {String(transaction.currency ?? "").toUpperCase() === "TRX" ? (
          <TronIcon className="mx-auto h-12 w-12" />
        ) : (
          <UsdtIcon className="mx-auto h-12 w-12" />
        )}
        <p className="mono mt-4 text-2xl font-semibold">
          {transaction.direction === "in" ? "+" : "-"}
          {money(transaction.amount, transaction.currency ?? "USDT")}{" "}
          {transaction.currency ?? "USDT"}
        </p>
        <StatusBadge status={statusLabel} />
      </Surface>
      <MetricGrid
        items={[
          [t("status"), statusLabel],
          [t("transactionDetail"), direction],
          [t("network"), networkLabelForMini(wallet.network, t)],
          [t("from"), from ? shortenHash(from, 8) : "-"],
          [t("to"), to ? shortenHash(to, 8) : "-"],
          [t("fee"), money(transaction.fee ?? 0, transaction.currency ?? "USDT")],
          [t("block"), "-"],
          [t("confirmations"), confirmed ? "Confirmed" : "Pending"],
          [
            t("date"),
            transaction.created_at ? new Date(transaction.created_at).toLocaleString() : "-",
          ],
        ]}
      />
      <Surface className="p-4">
        <p className="text-xs text-slate-400">{t("txid")}</p>
        <p className="mono mt-1 break-all text-xs" dir={technicalTextDirection()}>
          {transaction.txid ?? "-"}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            disabled={!transaction.txid}
            onClick={() => transaction.txid && copyText(transaction.txid, t("copied"))}
          >
            <Copy className="mr-2 h-4 w-4" />
            {t("txid")}
          </Button>
          <Button
            variant="secondary"
            disabled={!counterparty}
            onClick={() => counterparty && copyText(counterparty, t("addressCopied"))}
          >
            <Copy className="mr-2 h-4 w-4" />
            {t("copyAddress")}
          </Button>
        </div>
        {transaction.txid ? (
          <Button
            className="mt-3 w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() =>
              window.open(
                network.explorerTx(transaction.txid ?? ""),
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            {t("viewOnTronscan")}
          </Button>
        ) : null}
      </Surface>
    </Screen>
  );
}

export function WalletMoreScreen({
  wallet,
  onNavigate,
  onSetDefault,
  t,
}: {
  wallet: WalletRow | null;
  onNavigate: (screen: MiniScreen) => void | Promise<void>;
  onSetDefault: () => void;
  t: MiniT;
}) {
  if (!wallet) {
    return (
      <Screen title={t("more")} subtitle={t("selectedWallet")}>
        <EmptyLine>{t("noWalletSelected")}</EmptyLine>
      </Screen>
    );
  }
  const network = networkConfig(supportedWalletNetwork(wallet.network));
  const address = safeAddress(wallet.address);
  return (
    <Screen title={t("more")} subtitle={wallet.name ?? t("selectedWallet")}>
      <Surface className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{wallet.name ?? "Wallet"}</p>
            <p className="mono truncate text-xs text-slate-400" dir={technicalTextDirection()}>
              {address}
            </p>
          </div>
          <NetworkBadge wallet={wallet} t={t} />
        </div>
        <MetricGrid
          items={[
            [t("network"), networkLabelForMini(wallet.network, t)],
            [t("walletType"), (wallet.wallet_type ?? "standard").toUpperCase()],
            [t("default"), wallet.is_default ? t("active") : "-"],
            [t("gasSponsorship"), gasfreeStatusLabel(wallet.gas_sponsorship_status, t)],
          ]}
        />
      </Surface>
      <Section title={t("more")}>
        <SettingRow
          icon={MiniIcons.backup}
          title={t("backup")}
          body={wallet.backup_status ?? "not_backed_up"}
          onClick={() => onNavigate("wallet-backup")}
        />
        <SettingRow
          icon={MiniIcons.security}
          title={t("security")}
          body={t("transactionPasswordProtected")}
          onClick={() => onNavigate("security")}
        />
        <SettingRow
          icon={MiniIcons.wallet}
          title={t("setDefault")}
          body={wallet.is_default ? t("alreadyActive") : t("makeActiveWallet")}
          onClick={onSetDefault}
        />
        <SettingRow
          icon={ExternalLink}
          title={t("explorer")}
          body={t("openSelectedWalletAddress")}
          onClick={() => {
            window.open(network.explorerAddress(address), "_blank", "noopener,noreferrer");
          }}
        />
      </Section>
      <Section title={t("walletInformation")}>
        <button
          className="mono w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left text-xs"
          dir={technicalTextDirection()}
          onClick={() => copyText(address, t("addressCopied"))}
        >
          {address}
        </button>
      </Section>
    </Screen>
  );
}

export function WalletGasFreeScreen({
  wallet,
  gasfreeWallet,
  transactions,
  readiness,
  busy,
  t,
  onCheck,
  onDiscover,
  onReceive,
  onSend,
  onSelectTransaction,
}: {
  wallet: WalletRow | null;
  gasfreeWallet: WalletRow | null;
  transactions: TransactionRow[];
  readiness: GasFreeReadiness | null;
  busy: boolean;
  t: MiniT;
  onCheck: () => void;
  onDiscover: () => void;
  onReceive: () => void;
  onSend: () => void;
  onSelectTransaction: (transaction: TransactionRow) => void;
}) {
  if (!wallet) {
    return (
      <Screen title="GasFree" subtitle={t("gasfreeCapability")}>
        <EmptyLine>{t("noWalletSelected")}</EmptyLine>
      </Screen>
    );
  }
  const discovered = Boolean(gasfreeWallet?.address);
  const walletAddress = safeAddress(gasfreeWallet?.address);
  const accountState = readiness?.accountStatus ?? (discovered ? "DISCOVERED" : "ERROR");
  const activationState = readiness?.activationState ?? null;
  const status =
    accountState === "READY"
      ? t("gasfreeWalletReady")
      : accountState === "ACTIVE" || readiness?.accountActive === true
        ? "GasFree Wallet Active"
        : accountState === "ACTIVATION_REQUIRED" || activationState === "ACTIVATION_REQUIRED"
          ? "Activation Required"
          : discovered
            ? "GasFree Wallet Discovered"
            : t("notDiscovered");
  const transferStatus = readiness?.status ?? (discovered ? "NOT_CONFIGURED" : "DISABLED");
  const productDisabled = readiness?.productTransferAllowed === false;
  const gasfreeSendEnabled =
    !productDisabled &&
    (transferStatus === "AVAILABLE" || transferStatus === "ACTIVATION_REQUIRED");
  const transferLabel =
    transferStatus === "AVAILABLE" && accountState === "READY"
      ? "Transfers Ready"
      : productDisabled
        ? "Transfers Disabled by Admin"
        : transferStatus === "NOT_CONFIGURED"
          ? "Setup Required"
          : transferStatus === "PROVIDER_ERROR"
            ? "Provider Unavailable"
            : transferStatus === "LIMIT_REACHED"
              ? "Insufficient Test Funds"
              : transferStatus === "PENDING"
                ? "Pending"
                : accountState === "ACTIVATION_REQUIRED" || transferStatus === "ACTIVATION_REQUIRED"
                  ? "Activation Required"
                  : transferStatus === "DISABLED"
                    ? "Transfers Unavailable"
                    : "Transfers Unavailable";
  const rawStatus = discovered
    ? "available"
    : gasfreeCapabilityStatus(wallet.gas_sponsorship_status);
  const needsCheck = gasfreeCapabilityNeedsCheck(
    wallet.gas_sponsorship_status,
    wallet.gasfree_capability_checked_at,
  );
  const checkedAt = gasfreeWallet?.onchain_checked_at
    ? new Date(gasfreeWallet.onchain_checked_at).toLocaleString()
    : wallet.gasfree_capability_checked_at
      ? new Date(wallet.gasfree_capability_checked_at).toLocaleString()
      : t("notCheckedYet");
  const pillTone =
    rawStatus === "available" || rawStatus === "limited" || rawStatus === "enabled"
      ? "success"
      : rawStatus === "check_failed" || rawStatus === "unknown" || needsCheck
        ? "warning"
        : "muted";
  const transferTone =
    transferStatus === "AVAILABLE" && accountState === "READY"
      ? "success"
      : transferStatus === "NOT_CONFIGURED" || transferStatus === "PROVIDER_ERROR"
        ? "warning"
        : "muted";
  const disabledReason = productDisabled
    ? (readiness?.productTransferReason ?? "Send unavailable: transfers are disabled by Admin.")
    : transferStatus === "DISABLED"
      ? "Send unavailable: GasFree transfers are currently unavailable."
      : transferStatus === "NOT_CONFIGURED"
        ? "Send unavailable: Mainnet GasFree transfers are currently disabled by WTRON."
        : accountState === "ACTIVATION_REQUIRED"
          ? "Send unavailable: GasFree account activation is required first."
          : transferStatus === "PROVIDER_ERROR"
            ? "Send unavailable: GasFree provider is currently unavailable."
            : readiness?.reason;
  const explanation = discovered
    ? (disabledReason ?? t("gasfreeTransferSetupRequired"))
    : t("gasfreeUnavailableConfirmedMessage");
  const usdtBalance = walletDisplayBalance(gasfreeWallet);
  const trxBalance = Number(gasfreeWallet?.onchain_trx_balance ?? 0);
  const providerName =
    readiness?.provider && readiness.provider !== "gasfree_open_api"
      ? readiness.provider
      : "GasFree";
  return (
    <Screen title={t("gasfreeWallet")} subtitle={networkLabelForMini(wallet.network, t)}>
      <section className="space-y-5">
        <div className="flex items-center gap-3">
          <GasFreeIcon className="h-10 w-10" />
          <div className="min-w-0">
            <p className="text-base font-semibold">{t("gasfreeWallet")}</p>
            <p className="text-xs text-slate-500">{wallet.name ?? t("mainWallet")}</p>
          </div>
          <div className="ml-auto">
            <StatusPill label={status} tone={pillTone} />
          </div>
        </div>

        {discovered ? (
          <button
            type="button"
            className="mono w-full break-all border-y border-white/10 py-3 text-left text-xs text-slate-300"
            dir={technicalTextDirection()}
            onClick={() => copyText(walletAddress, t("addressCopied"))}
          >
            {walletAddress}
          </button>
        ) : null}

        <div>
          <p className="text-xs text-slate-500">{t("portfolioBalance")}</p>
          <p className="mt-2 text-3xl font-semibold tracking-normal tabular-nums">
            {money(usdtBalance)} USDT
          </p>
          <p className="mt-1 text-sm text-slate-400 tabular-nums">{money(trxBalance, "TRX")} TRX</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <QuickAction icon={MiniIcons.receive} label={t("receive")} onClick={onReceive} />
          <QuickAction icon={MiniIcons.history} label={t("history")} onClick={onCheck} />
          <QuickAction
            icon={MiniIcons.send}
            label={t("send")}
            disabled={!gasfreeSendEnabled}
            onClick={onSend}
          />
        </div>

        <section className="space-y-2">
          <SectionTitle>{t("serviceStatus")}</SectionTitle>
          <div className="divide-y divide-white/10 border-y border-white/10 text-sm">
            <StatusRow label={t("walletStatus")} value={discovered ? status : t("notDiscovered")} />
            <StatusRow label="Activation state" value={activationState ?? accountState} />
            <StatusRow
              label={t("gasfreeTransfers")}
              value={<StatusPill label={transferLabel} tone={transferTone} />}
            />
            <StatusRow label="Nonce" value={readiness?.accountNonce ?? "-"} mono />
            <StatusRow label={t("supportedAssets")} value="USDT" />
            <StatusRow label={t("provider")} value={providerName} />
            <StatusRow label={t("lastChecked")} value={checkedAt} mono />
          </div>
        </section>

        {discovered ? (
          <Section title={t("assets")}>
            <AssetRow
              icon={<UsdtIcon />}
              symbol="USDT"
              name={t("tetherUsd")}
              network="TRC20"
              amount={`${money(usdtBalance)} USDT`}
            />
            <AssetRow
              icon={<TronIcon />}
              symbol="TRX"
              name="TRON"
              network="TRON"
              amount={`${money(trxBalance, "TRX")} TRX`}
            />
          </Section>
        ) : null}

        {wallet.gasfree_capability_error ? (
          <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">
            {t("gasfreeCheckFailedMessage")}
          </p>
        ) : null}
        <button
          type="button"
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
          onClick={onDiscover}
          disabled={busy}
        >
          {busy
            ? t("refreshing")
            : discovered
              ? t("gasfreeWalletDiscovered")
              : t("discoverGasfreeWallet")}
        </button>
        <button
          type="button"
          className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-100 disabled:opacity-60"
          onClick={onCheck}
          disabled={busy}
        >
          {busy
            ? t("refreshing")
            : rawStatus === "check_failed"
              ? t("retry")
              : t("checkAvailability")}
        </button>
      </section>
      <CompactEmpty title={transferLabel} body={explanation} />
      <Section title={t("recentGasfreeTransactions")}>
        {transactions.length ? (
          <WalletTransactionRows rows={transactions} t={t} onSelect={onSelectTransaction} />
        ) : (
          <CompactEmpty title={t("noTransactionsYet")} body={t("gasfreeTransactionsEmpty")} />
        )}
      </Section>
    </Screen>
  );
}

export function ReceiveScreen({
  wallet,
  asset,
  setAsset,
  qr,
  t,
}: {
  wallet: WalletRow | null;
  asset: ReceiveAsset;
  setAsset: (asset: ReceiveAsset) => void;
  qr: string;
  t: MiniT;
}) {
  const address = safeAddress(wallet?.address);
  const isGasfreeWallet = wallet?.wallet_type === "gasfree" || wallet?.wallet_role === "gasfree";
  const displayAsset = isGasfreeWallet ? "USDT" : asset;
  return (
    <Screen title={t("personalWalletReceive")} subtitle={t("receiveSubtitle")}>
      {!isGasfreeWallet ? (
        <SegmentedControl
          value={asset}
          setValue={(value) => setAsset(value as ReceiveAsset)}
          items={[
            ["USDT", "USDT"],
            ["TRX", "TRX"],
          ]}
        />
      ) : null}
      <Surface className="p-4 text-center">
        <div className="mx-auto grid h-56 w-56 max-w-full place-items-center rounded-xl bg-white p-2.5">
          {qr ? (
            <img src={qr} alt="Receive QR" className="h-full w-full" />
          ) : (
            <MiniIcons.upi className="h-10 w-10 text-slate-400" />
          )}
        </div>
        <p className="mt-4 text-sm font-semibold text-white">
          {displayAsset === "USDT" ? "USDT / TRC20" : "TRX / TRON Network"}
        </p>
        <p className="mono mt-2 break-all text-sm text-slate-300" dir={technicalTextDirection()}>
          {address || t("noWalletSelected")}
        </p>
      </Surface>
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => copyText(address, t("addressCopied"))}
        >
          <Copy className="mr-2 h-4 w-4" />
          {t("copyAddress")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigator.share?.({ text: address }).catch(() => copyText(address))}
        >
          {t("share")}
        </Button>
      </div>
      <p className="rounded-2xl bg-red-500/10 p-3 text-sm text-red-100">
        {asset === "USDT" ? t("receiveUsdtWarning") : t("receiveTrxWarning")}
      </p>
    </Screen>
  );
}

export function BackupScreen({
  wallet,
  password,
  setPassword,
  revealedPhrase,
  busy,
  t,
  onSubmit,
}: {
  wallet: WalletRow | null;
  password: string;
  setPassword: (value: string) => void;
  revealedPhrase: string;
  busy: boolean;
  t: MiniT;
  onSubmit: (event: FormEvent) => void;
}) {
  const words = revealedPhrase.trim().split(/\s+/).filter(Boolean);
  const [phraseQr, setPhraseQr] = useState("");
  useEffect(() => {
    let active = true;
    if (!revealedPhrase) {
      setPhraseQr("");
      return;
    }
    void qrToDataUrl(`wtron://${revealedPhrase}`).then((url) => {
      if (active) setPhraseQr(url);
    });
    return () => {
      active = false;
      setPhraseQr("");
    };
  }, [revealedPhrase]);
  return (
    <Screen title={t("backup")} subtitle={wallet?.name ?? t("selectedWallet")}>
      <p className="rounded-2xl bg-red-500/10 p-3 text-sm text-red-100">
        Never share your recovery phrase. Anyone with this phrase can control the wallet.
      </p>
      {!words.length ? (
        <form className="space-y-3" onSubmit={onSubmit}>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("transactionPassword")}
          />
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy}
          >
            {t("recoveryPhrase")}
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {words.map((word, index) => (
              <div
                key={`${word}-${index}`}
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-sm"
                dir={technicalTextDirection()}
              >
                <span className="mr-2 text-slate-500">{index + 1}</span>
                {word}
              </div>
            ))}
          </div>
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => copyText(revealedPhrase, t("copied"))}
          >
            {t("copyAddress")}
          </Button>
          {phraseQr ? (
            <div className="rounded-2xl border border-white/10 bg-white p-3 text-slate-950">
              <div className="mx-auto h-52 w-52 max-w-full">
                <img src={phraseQr} alt="Recovery phrase QR" />
              </div>
              <p className="mt-3 text-xs font-semibold text-red-700">
                Anyone who scans this QR can control this wallet.
              </p>
            </div>
          ) : null}
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => toast.success("Backup confirmed")}
          >
            I Have Saved It
          </Button>
        </div>
      )}
      <p className="text-xs text-slate-500">
        The phrase is shown only in this Mini App screen after transaction-password verification. It
        is not sent to Telegram chat or Admin UI.
      </p>
    </Screen>
  );
}

function DepositCard({ deposit }: { deposit: DepositRow }) {
  return (
    <Surface className="p-4">
      <div className="flex items-center justify-between">
        <p className="mono text-sm">{deposit.order_ref ?? shortenHash(deposit.id)}</p>
        <StatusBadge status={String(deposit.status ?? "waiting")} />
      </div>
      <p className="mt-2 text-sm text-slate-400">
        {money(deposit.received_amount ?? deposit.expected_amount)} / {deposit.confirmations ?? 0}{" "}
        confirmations
      </p>
    </Surface>
  );
}

export function PlatformDepositScreen({
  amount,
  setAmount,
  address,
  deposits,
  qr,
  busy,
  onSubmit,
}: {
  amount: string;
  setAmount: (value: string) => void;
  address: { address?: string; network?: string } | null;
  deposits: DepositRow[];
  qr: string;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
}) {
  const companyAddress = safeAddress(address?.address);
  return (
    <Screen
      title="Deposit to WTRON"
      subtitle="Funds platform/P2P balance through the existing company-controlled listener"
    >
      <form
        className="space-y-3 rounded-2xl border border-white/10 bg-white/6 p-3"
        onSubmit={onSubmit}
      >
        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="USDT amount"
        />
        <Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={busy}
        >
          Create Deposit
        </Button>
      </form>
      {companyAddress ? (
        <div className="rounded-2xl border border-white/10 bg-white p-3 text-slate-950">
          <div className="mx-auto h-52 w-52 max-w-full">
            {qr ? <img src={qr} alt="Platform deposit QR" /> : null}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase text-slate-500">
            WTRON Deposit Address
          </p>
          <p className="mono mt-1 break-all text-sm">{companyAddress}</p>
          <p className="mt-2 text-sm">Network: TRON (TRC20)</p>
          <Button
            className="mt-3 w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => copyText(companyAddress)}
          >
            Copy Company Address
          </Button>
        </div>
      ) : (
        <EmptyLine>Platform deposits are temporarily unavailable.</EmptyLine>
      )}
      <Section title="Deposit Requests">
        {deposits.length ? (
          deposits.slice(0, 5).map((deposit) => <DepositCard key={deposit.id} deposit={deposit} />)
        ) : (
          <EmptyLine>No platform deposit requests yet.</EmptyLine>
        )}
      </Section>
    </Screen>
  );
}

export function SendScreen({
  wallet,
  mode,
  readiness,
  asset,
  setAsset,
  address,
  setAddress,
  amount,
  setAmount,
  transactionPassword,
  setTransactionPassword,
  standardTransactionPassword,
  setStandardTransactionPassword,
  standardPreview,
  standardPreviewError,
  standardSubmitState,
  standardResult,
  submitState,
  result,
  busy,
  t,
  onSubmitStandard,
  onSubmitGasfree,
}: {
  wallet: WalletRow | null;
  mode: "standard" | "gasfree";
  readiness: GasFreeReadiness | null;
  asset: ReceiveAsset;
  setAsset: (asset: ReceiveAsset) => void;
  address: string;
  setAddress: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  transactionPassword: string;
  setTransactionPassword: (value: string) => void;
  standardTransactionPassword: string;
  setStandardTransactionPassword: (value: string) => void;
  standardPreview: StandardTransferPreview | null;
  standardPreviewError: string;
  standardSubmitState: "idle" | "submitting" | "submitted" | "failed";
  standardResult: Record<string, unknown> | null;
  submitState:
    "idle" | "preparing" | "awaiting_password" | "submitting" | "pending" | "confirmed" | "failed";
  result: GasFreeTransferResult | null;
  busy: boolean;
  t: MiniT;
  onSubmitStandard: (event: FormEvent) => void;
  onSubmitGasfree: (event: FormEvent) => void;
}) {
  const [sendStep, setSendStep] = useState<"recipient" | "amount" | "confirm">("recipient");
  const [scanBusy, setScanBusy] = useState(false);
  const enabled = onChainSendEnabled(wallet);
  const network = networkConfig(supportedWalletNetwork(wallet?.network));
  const available =
    asset === "USDT" ? walletDisplayBalance(wallet) : Number(wallet?.onchain_trx_balance ?? 0);
  const gasfreeMode = mode === "gasfree" && wallet?.wallet_role === "gasfree";
  const amountNumber = Number(amount);
  const previewAmount = Number.isFinite(amountNumber) && amountNumber > 0 ? amountNumber : 0;
  const wtronFee = Number(readiness?.platformFee ?? 0);
  const totalRequired = previewAmount + wtronFee;
  const recipientValid = isTronAddress(address);
  const canSubmitGasfree =
    gasfreeMode &&
    (readiness?.status === "AVAILABLE" || readiness?.status === "ACTIVATION_REQUIRED") &&
    recipientValid &&
    previewAmount > 0 &&
    Boolean(transactionPassword) &&
    !busy &&
    submitState !== "submitting";
  const providerRequestId = result?.submitted?.id ?? result?.request?.provider_request_id ?? null;
  const txid = result?.submitted?.txId ?? result?.submitted?.txid ?? result?.request?.txid ?? null;
  const providerStatus =
    result?.submitted?.state ?? result?.request?.status ?? result?.status ?? null;
  const standardRecipientValid = isTronAddress(address);
  const standardCapabilityReady = Boolean(
    standardPreview?.signingEnabled &&
    standardPreview?.mainnetSigningEnabled &&
    standardPreview?.signerReady &&
    standardPreview?.transactionPasswordConfigured &&
    !standardPreview?.transactionPasswordLocked &&
    !standardPreview?.blocked,
  );
  const standardSufficient =
    standardPreview?.availableBalance == null
      ? false
      : asset === "USDT"
        ? Number(standardPreview.availableBalance) >= previewAmount &&
          Number(standardPreview.availableTrxBalance ?? 0) >=
            Number(standardPreview.customerFeeTrx ?? standardPreview.customerFee ?? 0)
        : Number(standardPreview.availableBalance) >= Number(standardPreview.totalDebit ?? 0);
  const canContinueStandard =
    enabled &&
    standardRecipientValid &&
    previewAmount > 0 &&
    Boolean(standardPreview) &&
    standardCapabilityReady &&
    !busy &&
    standardSubmitState !== "submitting";
  const standardFeeCurrency = standardPreview?.customerFeeCurrency ?? asset;
  const standardFeeLabel = standardPreview
    ? `${money(Number(standardPreview.customerFee ?? 0), standardFeeCurrency)} ${standardFeeCurrency}`
    : "Checking...";
  const standardTotalDebitLabel = standardPreview
    ? asset === "USDT"
      ? `${money(previewAmount, "USDT")} USDT + ${money(
          Number(standardPreview.customerFeeTrx ?? standardPreview.customerFee ?? 0),
          "TRX",
        )} TRX`
      : `${money(Number(standardPreview.totalDebit ?? 0), asset)} ${asset}`
    : "Checking...";
  const standardStatusMessage = !enabled
    ? t("sendUnavailable")
    : standardPreviewError
      ? standardPreviewError
      : !standardRecipientValid && address
        ? "Enter a valid TRON address"
        : standardPreview?.blocked
          ? friendlyMiniError(standardPreview.blockCode, t("sendUnavailable"))
          : standardPreview?.transactionPasswordLocked
            ? "Transaction password is temporarily locked."
            : standardPreview && !standardPreview.signerReady
              ? "This wallet is not ready to send."
              : standardPreview && !standardPreview.signingEnabled
                ? "Transfers are temporarily unavailable."
                : standardPreview && !standardPreview.mainnetSigningEnabled
                  ? "Transfers are temporarily unavailable."
                  : standardPreview && !standardPreview.transactionPasswordConfigured
                    ? "Set a transaction password before sending."
                    : standardPreview && !standardSufficient
                      ? asset === "USDT"
                        ? "Insufficient USDT amount or TRX fee balance."
                        : "Insufficient balance for amount plus transfer fee."
                      : "";
  const standardResultStatus = String(standardResult?.["status"] ?? "Submitted");
  const standardResultConfirmed = isConfirmedTransferStatus(standardResultStatus);
  const nextStep = () => setSendStep(sendStep === "recipient" ? "amount" : "confirm");
  const scanRecipient = async () => {
    if (scanBusy) return;
    setScanBusy(true);
    try {
      const scanned = await scanRecipientQr();
      setAddress(scanned);
      toast.success("Recipient address added");
    } catch (error) {
      const message = qrScanErrorMessage(error);
      if (!(error instanceof QrScanError) || error.code !== "cancelled") toast.error(message);
    } finally {
      setScanBusy(false);
    }
  };
  const submitStandardStep = (event: FormEvent) => {
    if (sendStep !== "confirm") {
      event.preventDefault();
      nextStep();
      return;
    }
    onSubmitStandard(event);
  };
  const submitGasfreeStep = (event: FormEvent) => {
    if (sendStep !== "confirm") {
      event.preventDefault();
      nextStep();
      return;
    }
    onSubmitGasfree(event);
  };
  if (gasfreeMode) {
    return (
      <Screen title="Send" subtitle="GasFree Wallet">
        <form className="space-y-4" onSubmit={submitGasfreeStep}>
          <Surface className="p-4">
            <p className="rounded-xl bg-white/6 p-3 text-sm text-slate-300">
              GasFree wallet supports USDT transfers.
            </p>
            <div className="mt-4 space-y-3">
              {sendStep === "recipient" ? (
                <FormField label={t("toAddress")}>
                  <div className="flex items-center gap-2">
                    <Input
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      placeholder={t("recipientAddressPlaceholder")}
                      aria-invalid={address.length > 0 && !recipientValid}
                    />
                    <button
                      type="button"
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/6"
                      disabled={scanBusy}
                      onClick={() => void scanRecipient()}
                      aria-label="Scan recipient QR"
                    >
                      {scanBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                      ) : (
                        <ScanLine className="h-4 w-4 text-slate-300" />
                      )}
                    </button>
                  </div>
                </FormField>
              ) : null}
              {sendStep === "amount" ? (
                <>
                  <FormField label={t("available")}>
                    <p className="text-sm font-semibold tabular-nums">{money(available)} USDT</p>
                  </FormField>
                  <FormField label={t("amount")}>
                    <div className="flex items-center gap-2">
                      <Input
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder={t("amount")}
                        inputMode="decimal"
                      />
                      <button
                        type="button"
                        className="rounded-xl bg-white/6 px-3 py-2 text-xs font-semibold text-primary"
                        onClick={() => setAmount(String(Math.max(available - wtronFee, 0)))}
                      >
                        {t("max")}
                      </button>
                    </div>
                  </FormField>
                  <MetricGrid
                    items={[
                      ["Fee", `${money(wtronFee)} USDT`],
                      ["Total", `${money(totalRequired)} USDT`],
                    ]}
                  />
                </>
              ) : null}
              {sendStep === "confirm" ? (
                <>
                  <MetricGrid
                    items={[
                      ["Asset", "USDT"],
                      ["Amount", `${money(previewAmount)} USDT`],
                      ["From", wallet?.address ? shortenHash(wallet.address, 6) : "Not available"],
                      [
                        "To",
                        recipientValid ? shortenHash(address, 6) : "Enter a valid TRON address",
                      ],
                      [t("network"), networkLabelForMini(wallet?.network, t)],
                      ["Fee", `${money(wtronFee)} USDT`],
                      ["Total", `${money(totalRequired)} USDT`],
                    ]}
                  />
                  <FormField label={t("transactionPassword")}>
                    <Input
                      type="password"
                      value={transactionPassword}
                      onChange={(event) => setTransactionPassword(event.target.value)}
                      placeholder={t("transactionPassword")}
                      autoComplete="current-password"
                    />
                  </FormField>
                </>
              ) : null}
            </div>
          </Surface>

          {readiness?.status !== "AVAILABLE" ? (
            <p className="rounded-2xl bg-yellow-500/10 p-3 text-sm text-yellow-100">
              {readiness?.reason ?? t("gasfreeTransferSetupRequired")}
            </p>
          ) : null}

          {result ? (
            <TransferResultReceipt
              title={
                submitState === "failed"
                  ? "Transaction Failed"
                  : submitState === "confirmed"
                    ? "Transaction Successful"
                    : "Transaction Submitted"
              }
              success={submitState !== "failed"}
              asset="USDT"
              amount={previewAmount}
              from={wallet?.address ?? ""}
              to={address}
              networkLabel={networkLabelForMini(wallet?.network, t)}
              network={network}
              fee={`${money(wtronFee)} USDT`}
              totalCharged={`${money(totalRequired)} USDT`}
              txid={txid}
              status={cleanTransferStatusLabel(String(providerStatus ?? "Pending"))}
              referenceId={providerRequestId ?? result.request?.id ?? null}
              reason={result.request?.failure_reason ?? null}
            />
          ) : null}

          <Button
            className="w-full"
            disabled={
              sendStep === "recipient"
                ? !recipientValid
                : sendStep === "amount"
                  ? previewAmount <= 0
                  : !canSubmitGasfree
            }
          >
            {sendStep !== "confirm"
              ? sendStep === "recipient"
                ? "Next"
                : "Review"
              : submitState === "preparing"
                ? "Preparing"
                : submitState === "submitting"
                  ? "Submitting"
                  : submitState === "pending"
                    ? "Provider accepted"
                    : "Confirm"}
          </Button>
        </form>
      </Screen>
    );
  }
  return (
    <Screen title="Send" subtitle="Normal TRON Wallet">
      <form className="space-y-4" onSubmit={submitStandardStep}>
        <Surface className="p-4">
          <div className="mt-4 space-y-3">
            {sendStep === "recipient" ? (
              <FormField label={t("toAddress")}>
                <div className="flex items-center gap-2">
                  <Input
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder={t("recipientAddressPlaceholder")}
                    aria-invalid={address.length > 0 && !standardRecipientValid}
                  />
                  <button
                    type="button"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/6"
                    disabled={scanBusy}
                    onClick={() => void scanRecipient()}
                    aria-label="Scan recipient QR"
                  >
                    {scanBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                    ) : (
                      <ScanLine className="h-4 w-4 text-slate-300" />
                    )}
                  </button>
                </div>
              </FormField>
            ) : null}
            {sendStep === "amount" ? (
              <>
                <SegmentedControl
                  value={asset}
                  setValue={(value) => setAsset(value as ReceiveAsset)}
                  items={[
                    ["USDT", "USDT"],
                    ["TRX", "TRX"],
                  ]}
                />
                <FormField label={t("available")}>
                  <p className="text-sm font-semibold tabular-nums">
                    {money(available, asset)} {asset}
                  </p>
                </FormField>
                <FormField label={t("amount")}>
                  <div className="flex items-center gap-2">
                    <Input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder={t("amount")}
                      inputMode="decimal"
                    />
                    <button
                      type="button"
                      className="rounded-xl bg-white/6 px-3 py-2 text-xs font-semibold text-primary"
                      onClick={() => setAmount(String(available || ""))}
                    >
                      {t("max")}
                    </button>
                  </div>
                </FormField>
                <MetricGrid
                  items={[
                    ["Network Fee", standardFeeLabel],
                    [asset === "USDT" ? "USDT debit" : "Total", standardTotalDebitLabel],
                  ]}
                />
              </>
            ) : null}
            {sendStep === "confirm" ? (
              <>
                <MetricGrid
                  items={[
                    ["Asset", asset],
                    ["Amount", `${money(previewAmount, asset)} ${asset}`],
                    ["From", wallet?.address ? shortenHash(wallet.address, 6) : "Not available"],
                    [
                      "To",
                      standardRecipientValid
                        ? shortenHash(address, 6)
                        : "Enter a valid TRON address",
                    ],
                    [t("network"), networkLabelForMini(wallet?.network, t)],
                    ["Network Fee", standardFeeLabel],
                    ["Total", standardTotalDebitLabel],
                  ]}
                />
                <FormField label={t("transactionPassword")}>
                  <Input
                    type="password"
                    value={standardTransactionPassword}
                    onChange={(event) => setStandardTransactionPassword(event.target.value)}
                    placeholder={t("transactionPassword")}
                    autoComplete="current-password"
                  />
                </FormField>
              </>
            ) : null}
          </div>
        </Surface>
        {standardStatusMessage ? (
          <p className="rounded-2xl bg-yellow-500/10 p-3 text-sm text-yellow-100">
            {standardStatusMessage}
          </p>
        ) : null}
        {standardResult ? (
          <TransferResultReceipt
            title={
              standardSubmitState === "failed"
                ? "Transaction Failed"
                : standardResultConfirmed
                  ? "Transaction Successful"
                  : "Transaction Submitted"
            }
            success={standardSubmitState !== "failed"}
            asset={String(standardResult["asset"] ?? asset)}
            amount={standardResult["amount"] ?? previewAmount}
            from={String(standardResult["from_address"] ?? wallet?.address ?? "")}
            to={String(standardResult["to_address"] ?? address)}
            networkLabel={networkLabelForMini(wallet?.network, t)}
            network={network}
            fee={standardFeeLabel}
            totalCharged={standardTotalDebitLabel}
            txid={typeof standardResult["txid"] === "string" ? standardResult["txid"] : null}
            status={cleanTransferStatusLabel(standardResultStatus)}
            referenceId={String(standardResult["id"] ?? "")}
            reason={
              typeof standardResult["safe_failure_message"] === "string"
                ? standardResult["safe_failure_message"]
                : null
            }
          />
        ) : null}
        <Button
          className="w-full"
          disabled={
            sendStep === "recipient"
              ? !standardRecipientValid
              : sendStep === "amount"
                ? previewAmount <= 0 || Boolean(standardPreviewError)
                : !canContinueStandard
          }
        >
          {sendStep !== "confirm"
            ? sendStep === "recipient"
              ? "Next"
              : "Review"
            : standardSubmitState === "submitting"
              ? "Submitting"
              : "Confirm"}
        </Button>
      </form>
    </Screen>
  );
}

function TransferResultReceipt({
  title,
  success,
  asset,
  amount,
  from,
  to,
  networkLabel,
  network,
  fee,
  totalCharged,
  txid,
  status,
  referenceId,
  reason,
}: {
  title: string;
  success: boolean;
  asset: string;
  amount: unknown;
  from: string;
  to: string;
  networkLabel: string;
  network: ReturnType<typeof networkConfig>;
  fee: string;
  totalCharged: string;
  txid?: string | null;
  status: string;
  referenceId?: string | null;
  reason?: string | null;
}) {
  const sharePayload = receiptShareText({
    title,
    asset,
    amount,
    from,
    to,
    network: networkLabel,
    txid: txid ?? null,
    status,
  });
  return (
    <Surface className="space-y-4 p-4">
      <div className="text-center">
        {success ? (
          <CircleCheck className="mx-auto h-12 w-12 text-primary" />
        ) : (
          <CircleX className="mx-auto h-12 w-12 text-red-300" />
        )}
        <p className="mt-3 text-lg font-semibold">{title}</p>
        <p className="text-sm text-slate-400">
          {txid ? "Broadcast to TRON." : success ? "Waiting for broadcast." : "Not broadcast"}
        </p>
      </div>
      <MetricGrid
        items={[
          ["Asset", asset],
          ["Amount", `${money(amount, asset)} ${asset}`],
          ["Network", networkLabel],
          ["Fee", fee],
          ["Total", totalCharged],
          ["Status", status],
          ["Date/time", new Date().toLocaleString()],
        ]}
      />
      <StatusRow label="From" value={from ? shortenHash(from, 8) : "Not available"} mono />
      <StatusRow label="To" value={to ? shortenHash(to, 8) : "Not available"} mono />
      <StatusRow label="Reference" value={referenceId || "Not available"} mono />
      <StatusRow label="TXID" value={txid || "Not broadcast"} mono />
      {reason ? (
        <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-100">
          {friendlyMiniError(reason, "The transfer could not be completed.")}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <Button
          type="button"
          variant="secondary"
          disabled={!txid}
          onClick={() =>
            txid && window.open(network.explorerTx(txid), "_blank", "noopener,noreferrer")
          }
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          View on TronScan
        </Button>
        <Button type="button" variant="secondary" onClick={() => shareText(sharePayload)}>
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>
        <Button type="button" variant="secondary" onClick={() => window.history.back()}>
          Done
        </Button>
      </div>
    </Surface>
  );
}

function Screen({
  title,
  subtitle,
  compact,
  children,
}: {
  title: string;
  subtitle: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="space-y-4 pb-[86px]">
      <div className={compact ? "sr-only" : undefined}>
        <h1 className="text-[22px] font-semibold leading-tight tracking-normal">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
      </div>
      {children}
    </main>
  );
}
function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex items-center gap-1 text-sm font-normal text-slate-300"
      onClick={onClick}
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
function IconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: MiniIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-[35px] w-[35px] place-items-center rounded-[11px] border border-[#222837] bg-[#10131a] text-slate-200"
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
function AssetCard({ total, profile }: { total: number; profile: ProfileSummary | null }) {
  return (
    <div className="rounded-[17px] bg-primary p-4 text-primary-foreground shadow-[0_12px_34px_rgba(29,55,130,.16)] hover:bg-primary/90">
      <p className="text-xs font-medium uppercase text-primary-foreground">Total Assets</p>
      <p className="mono mt-2 text-2xl font-semibold">{money(total)}</p>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <MiniMetric label="Available" value={money(profile?.balance)} />
        <MiniMetric label="Locked" value={money(profile?.locked_balance)} />
        <MiniMetric label="Pending" value={money(profile?.pending_balance)} />
      </div>
    </div>
  );
}
function MiniMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-t border-white/8 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-[#222837] bg-[#10131a] p-3">
      <p className="text-[9px] text-slate-500">{label}</p>
      <p className="mt-1 text-[17px] font-semibold tracking-[-0.03em] tabular-nums">{value}</p>
    </div>
  );
}
function Surface({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      data-v17-surface
      className={`rounded-[17px] border border-[#222837] bg-[#10131a] ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string | undefined;
  onAction?: (() => void | Promise<void>) | undefined;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <h2 className="text-[15px] font-medium">{title}</h2>
      {action ? (
        <button className="text-xs font-medium text-primary" onClick={() => void onAction?.()}>
          {action}
        </button>
      ) : null}
    </div>
  );
}

function Action({
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
        <Icon className="h-5 w-5" />
      </span>
      <span className="mt-2 block text-[11px] text-slate-200">{label}</span>
    </button>
  );
}
function QuickAction({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: MiniIcon;
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <button
      className="text-center disabled:opacity-45"
      disabled={disabled}
      onClick={() => void onClick()}
    >
      <span className="mx-auto grid h-[45px] w-[45px] place-items-center rounded-[14px] border border-[#222837] bg-[#10131a] text-[#7ba0ff]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="mt-2 block text-[11px] font-normal text-slate-300">{label}</span>
    </button>
  );
}
function Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string | undefined;
  onAction?: (() => void | Promise<void>) | undefined;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader title={title} action={action} onAction={onAction} />
      {children}
    </section>
  );
}
function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-y border-[#222837] py-3 text-center text-sm text-slate-400">{children}</p>
  );
}
function CompactEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-y border-[#222837] py-3 text-center">
      <p className="text-sm font-medium text-slate-200">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{body}</p>
    </div>
  );
}
function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: MiniIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[70vh] place-items-center text-center">
      <div>
        <Icon className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-4 text-2xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-2 text-sm text-slate-400">{body}</p>
        {action}
      </div>
    </div>
  );
}
function Tabs({
  value,
  setValue,
  items,
}: {
  value: string;
  setValue: (value: string) => void;
  items: Array<[string, string]>;
}) {
  return (
    <div className="flex gap-5 overflow-x-auto border-b border-[#222837]">
      {items.map(([key, label]) => (
        <button
          key={key}
          className={`relative shrink-0 py-[9px] pb-[11px] text-[11px] ${
            value === key
              ? "font-semibold text-white after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-primary"
              : "text-slate-500"
          }`}
          onClick={() => setValue(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
function SegmentedControl({
  value,
  setValue,
  items,
}: {
  value: string;
  setValue: (value: string) => void;
  items: Array<[string, string]>;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-[13px] border border-[#222837] bg-[#151925] p-1">
      {items.map(([key, label]) => (
        <button
          key={key}
          className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${
            value === key
              ? "bg-[#10131a] text-white shadow-[0_4px_12px_rgba(0,0,0,.12)]"
              : "text-slate-400"
          }`}
          onClick={() => setValue(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
function PaymentMethodSummary({ method }: { method: PaymentMethodRow | null | undefined }) {
  if (!method) return <EmptyLine>No payout method selected.</EmptyLine>;
  const display = paymentMethodDisplay(method);
  return (
    <div className="rounded-xl border border-white/10 bg-white/6 p-3">
      <p className="text-sm font-semibold">{display.title}</p>
      <div className="mt-2 space-y-1 text-xs text-slate-400">
        {display.lines.map((line) => (
          <p
            key={line}
            dir={line.includes("@") || /\d/.test(line) ? technicalTextDirection() : undefined}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
function PaymentMethodPicker({
  methods,
  selectedId,
  setSelectedId,
}: {
  methods: PaymentMethodRow[];
  selectedId: string;
  setSelectedId: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {methods.map((method) => {
        const display = paymentMethodDisplay(method);
        return (
          <button
            key={method.id}
            type="button"
            className={`w-full rounded-xl border p-3 text-left ${
              selectedId === method.id
                ? "border-primary bg-primary/12"
                : "border-white/10 bg-white/6"
            }`}
            onClick={() => setSelectedId(method.id)}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{display.title}</p>
              {method.is_default ? <span className="text-xs text-primary">Default</span> : null}
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-400">
              {display.lines.map((line) => (
                <p
                  key={line}
                  dir={line.includes("@") || /\d/.test(line) ? technicalTextDirection() : undefined}
                >
                  {line}
                </p>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
function SourceWalletPicker({
  wallets,
  selectedId,
  setSelectedId,
  availability,
}: {
  wallets: WalletRow[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  availability: Record<string, number>;
}) {
  if (!wallets.length) {
    return (
      <CompactEmpty
        title="Fund a personal wallet first"
        body="P2P seller flows reserve USDT from an eligible Mainnet wallet."
      />
    );
  }
  return (
    <FormField label="Source wallet">
      <select
        aria-label="P2P sell source wallet"
        className="h-11 w-full rounded-xl border border-white/10 bg-white/6 px-3 text-sm text-white outline-none"
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
      >
        {wallets.map((wallet) => (
          <option key={wallet.id} className="bg-slate-950" value={wallet.id}>
            {wallet.name ?? "Wallet"} -{" "}
            {money(availability[wallet.id] ?? walletDisplayBalance(wallet))} USDT available
          </option>
        ))}
      </select>
    </FormField>
  );
}
function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Surface className="space-y-3 p-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </Surface>
  );
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
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <p className="mono mt-2 text-lg font-semibold">{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function ResourcePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-300">{value}</p>
    </div>
  );
}

function walletResourceDisplay(resources: WalletResourceSnapshot | null) {
  return {
    energyLimit: resources?.energyLimit ?? 0,
    energyUsed: resources?.energyUsed ?? 0,
    bandwidthLimit: (resources?.freeBandwidthLimit ?? 0) + (resources?.bandwidthLimit ?? 0),
    bandwidthUsed: (resources?.freeBandwidthUsed ?? 0) + (resources?.bandwidthUsed ?? 0),
  };
}

function ResourceBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-500 tabular-nums">
          {Number.isFinite(used) ? used : 0} / {Number.isFinite(limit) ? limit : 0}
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white/8">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusPill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "muted" | "success" | "warning" | "danger" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
      : tone === "info"
        ? "border border-primary/20 bg-primary/10 text-[#7ba0ff]"
        : tone === "warning"
          ? "border border-amber-400/20 bg-amber-500/12 text-amber-300"
          : tone === "danger"
            ? "border border-red-400/20 bg-red-500/12 text-red-300"
            : "border border-[#222837] bg-white/8 text-slate-400";
  return (
    <span
      className={`inline-flex rounded-full px-[7px] py-[5px] text-[8.5px] font-semibold ${toneClass}`}
    >
      {label}
    </span>
  );
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-white/10 ${className}`} />;
}

function WalletSelectorSheet({
  wallets,
  selectedWalletId,
  t,
  onSelect,
  onClose,
  onCreate,
  onImport,
  onManage,
}: {
  wallets: WalletRow[];
  selectedWalletId: string;
  t: MiniT;
  onSelect: (wallet: WalletRow) => void;
  onClose: () => void;
  onCreate?: () => void;
  onImport?: () => void;
  onManage?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/65 p-3" onClick={onClose}>
      <div
        className="mx-auto max-h-[82vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#111111] p-3 shadow-[0_18px_50px_-35px_rgba(0,0,0,0.9)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("walletSelector")}</h2>
          <button className="text-sm text-slate-400" onClick={onClose}>
            {t("cancel")}
          </button>
        </div>
        <div className="space-y-2">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              className={`w-full rounded-xl p-3 text-left ${
                wallet.id === selectedWalletId ? "bg-primary/12" : "bg-white/5"
              }`}
              onClick={() => onSelect(wallet)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{wallet.name ?? t("wallet")}</p>
                  <p
                    className="mono truncate text-xs text-slate-400"
                    dir={technicalTextDirection()}
                  >
                    {shortenHash(wallet.address, 8)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {networkLabelForMini(wallet.network, t)} /{" "}
                    {(wallet.wallet_type ?? "standard").toUpperCase()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {money(walletDisplayBalance(wallet))} USDT
                  </p>
                  <p className="text-xs text-slate-400 tabular-nums">
                    {money(wallet.onchain_trx_balance ?? 0, "TRX")} TRX
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    GasFree {gasfreeStatusLabel(wallet.gas_sponsorship_status, t)}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onCreate}
          >
            {t("createWallet")}
          </Button>
          <Button size="sm" variant="secondary" onClick={onImport}>
            {t("importWallet")}
          </Button>
          <Button size="sm" variant="secondary" onClick={onManage}>
            {t("more")}
          </Button>
        </div>
      </div>
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
  wallet: WalletRow;
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
        {wallet.wallet_type === "gasfree" ? <GasFreeIcon /> : <TronIcon />}
      </div>
      <p className="mt-4 text-base font-semibold">{wallet.name ?? "Wallet"}</p>
      <p className="mono mt-1 break-all text-xs text-slate-400">
        {shortenHash(wallet.address, 10)}
      </p>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-xs text-slate-400">USDT</p>
          <p className="mono text-xl font-semibold">{money(walletDisplayBalance(wallet))}</p>
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
function NetworkBadge({ wallet, t }: { wallet: WalletRow; t?: MiniT }) {
  const network = t
    ? networkLabelForMini(wallet.network, t)
    : networkConfig(supportedWalletNetwork(wallet.network)).label;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
      <TronIcon className="h-4 w-4" />
      {network} {(wallet.wallet_type ?? "standard").toUpperCase()}
    </span>
  );
}
function WalletSummary({
  wallet,
  t,
  onReceive,
  onSend,
  onBackup,
}: {
  wallet: WalletRow | null;
  t: MiniT;
  onReceive: () => void;
  onSend: () => void;
  onBackup: () => void;
}) {
  return wallet ? (
    <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
      <p className="font-semibold">{wallet.name}</p>
      <p className="mono mt-1 break-all text-xs text-slate-400">{wallet.address}</p>
      <MetricGrid
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
    <EmptyLine>{t("noWalletSelected")}</EmptyLine>
  );
}
function AssetRow({
  icon,
  symbol,
  name,
  network,
  amount,
  onClick,
}: {
  icon: React.ReactNode;
  symbol: string;
  name: string;
  network: string;
  amount: string;
  onClick?: () => void;
}) {
  const Element = onClick ? "button" : "div";
  return (
    <Element
      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/6 p-3 text-left"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="font-semibold">{symbol}</p>
          <p className="text-xs text-slate-400">
            {name} / {network}
          </p>
        </div>
      </div>
      <p className="mono text-sm font-semibold">{amount}</p>
    </Element>
  );
}
function ListRow({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: MiniIcon;
  title: string;
  body: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left"
      onClick={() => void onClick()}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/6">
        <Icon className="h-5 w-5 text-primary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-slate-500">{body}</span>
      </span>
      <ChevronDown className="h-4 w-4 -rotate-90 text-slate-600" />
    </button>
  );
}
function SettingRow({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: MiniIcon;
  title: string;
  body: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left"
      onClick={() => void onClick()}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/6">
        <Icon className="h-5 w-5 text-primary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-slate-400">{body}</span>
      </span>
    </button>
  );
}
function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="text-sm font-medium text-slate-200">{children}</p>;
}
function StatusRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={`min-w-0 text-right text-sm text-slate-200 ${mono ? "mono truncate" : ""}`}
        dir={mono ? technicalTextDirection() : undefined}
      >
        {value}
      </span>
    </div>
  );
}
function MetricGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(([label, value]) => (
        <MiniMetric key={label} label={label} value={value} />
      ))}
    </div>
  );
}
export function DirectSellDetailScreen(props: {
  order: DirectSellOrderRow | null;
  items: DirectSellPaymentItemRow[];
  paymentMethod: PaymentMethodRow | null | undefined;
  qr: string;
  busy: boolean;
  onCopy: (value: string, label?: string) => void;
  onConfirm: (itemId: string) => void;
  onDispute: (itemId: string) => void;
}) {
  const order = props.order;
  const address = safeAddress(order?.assigned_company_address);
  const confirmed = props.items
    .filter((item) => ["confirmed", "auto_approved"].includes(String(item.status)))
    .reduce((sum, item) => sum + Number(item.amount_inr ?? 0), 0);
  const sent = props.items
    .filter((item) =>
      ["sent", "confirmed", "auto_approved", "disputed"].includes(String(item.status)),
    )
    .reduce((sum, item) => sum + Number(item.amount_inr ?? 0), 0);
  const disputed = props.items
    .filter((item) => item.status === "disputed")
    .reduce((sum, item) => sum + Number(item.amount_inr ?? 0), 0);
  const expected = Number(order?.expected_inr ?? 0);
  const remaining = Math.max(0, expected - confirmed);
  const status = String(order?.status ?? "waiting_for_usdt");
  const usdtReceived =
    Number(order?.received_usdt ?? 0) > 0 ? order?.received_usdt : order?.expected_usdt;
  const blockchainSteps = [
    ["WAITING", ["waiting_for_usdt", "created", "waiting"]],
    ["DETECTED", ["usdt_detected", "detected"]],
    ["CONFIRMING", ["usdt_confirming", "confirming"]],
    [
      "CONFIRMED",
      [
        "usdt_confirmed",
        "inr_payment_pending",
        "payment_assigned",
        "inr_payment_sent",
        "payment_verifying",
        "manual_review",
        "completed",
      ],
    ],
  ] as const;
  const currentStep = blockchainSteps.findIndex(([, values]) =>
    values.some((value) => value === status),
  );

  return (
    <Screen title="Direct Sell Order" subtitle={order?.order_ref ?? "WTRON company sell"}>
      {!order ? (
        <EmptyLine>No direct sell order selected.</EmptyLine>
      ) : (
        <>
          <div className="space-y-3 rounded-2xl border border-red-500/25 bg-red-500/10 p-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-red-100">Send exactly</p>
              <p className="mono mt-1 text-2xl font-semibold text-white">
                {money(order.expected_usdt)} USDT
              </p>
            </div>
            <MetricGrid
              items={[
                ["Network", "TRON / TRC20"],
                ["Rate", money(order.locked_rate_inr, "INR")],
                ["Expected INR", money(order.expected_inr, "INR")],
                [
                  "Confirmations",
                  `${order.confirmations ?? 0}/${order.required_confirmations ?? 0}`,
                ],
              ]}
            />
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">To WTRON address</p>
              <p className="mono mt-1 break-all text-sm text-white">{address || "Assigning..."}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={!address}
                onClick={() => props.onCopy(address, "Address copied")}
              >
                Copy Address
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={!order.expected_usdt}
                onClick={() => props.onCopy(String(order.expected_usdt ?? ""), "Amount copied")}
              >
                Copy Amount
              </Button>
            </div>
            {props.qr ? (
              <div className="rounded-xl bg-white p-2.5">
                <img src={props.qr} alt="Direct sell address QR" className="mx-auto h-52 w-52" />
              </div>
            ) : null}
          </div>

          <Section title="Selected Payout Method">
            <PaymentMethodSummary method={props.paymentMethod} />
          </Section>

          <Section title="Blockchain Status">
            <div className="grid grid-cols-4 gap-2">
              {blockchainSteps.map(([label], index) => (
                <div
                  key={label}
                  className={`rounded-2xl border p-2 text-center text-[11px] ${
                    index <= Math.max(0, currentStep)
                      ? "border-primary/40 bg-primary/15 text-primary-foreground"
                      : "border-white/10 bg-white/6 text-slate-500"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
            <MetricGrid
              items={[
                ["Status", status.replaceAll("_", " ")],
                ["TXID", order.txid ? shortenHash(order.txid, 8) : "Waiting"],
                ["USDT received", money(usdtReceived)],
                [
                  "Deposit request",
                  order.deposit_request_id ? shortenHash(order.deposit_request_id) : "-",
                ],
              ]}
            />
          </Section>

          <Section title="INR Receivable">
            <MetricGrid
              items={[
                ["Expected INR", money(expected, "INR")],
                ["INR Sent", money(sent, "INR")],
                ["INR Confirmed", money(confirmed, "INR")],
                ["INR Disputed", money(disputed, "INR")],
                ["INR Remaining", money(remaining, "INR")],
              ]}
            />
          </Section>

          <Section title="INR Payments">
            {props.items.length ? (
              props.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-white/6 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="mono text-sm">{money(item.amount_inr, "INR")}</p>
                    <StatusBadge status={String(item.status ?? "sent")} />
                  </div>
                  <MetricGrid
                    items={[
                      ["UTR", item.utr_reference ?? "-"],
                      ["Sent", item.created_at ? new Date(item.created_at).toLocaleString() : "-"],
                      [
                        "Deadline",
                        item.confirmation_deadline
                          ? new Date(item.confirmation_deadline).toLocaleString()
                          : "-",
                      ],
                      ["Proof", item.proof_path ? "Attached" : "-"],
                    ]}
                  />
                  {item.status === "sent" ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                        disabled={props.busy}
                        onClick={() => props.onConfirm(item.id)}
                      >
                        Confirm Received
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={props.busy}
                        onClick={() => props.onDispute(item.id)}
                      >
                        Dispute
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyLine>INR payments will appear here after WTRON sends payout.</EmptyLine>
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}

function TransactionList({
  title,
  rows,
  empty,
  t,
  onSelect,
  action,
  onAction,
}: {
  title: string;
  rows: TransactionRow[];
  empty: string;
  t?: MiniT;
  onSelect?: (transaction: TransactionRow) => void;
  action?: string;
  onAction?: () => void | Promise<void>;
}) {
  const filtered = useMemo(() => rows.slice(0, 8), [rows]);
  return (
    <Section title={title} action={action} onAction={onAction}>
      {filtered.length ? (
        <WalletTransactionRows
          rows={filtered}
          {...(t ? { t } : {})}
          {...(onSelect ? { onSelect } : {})}
        />
      ) : (
        <EmptyLine>{empty}</EmptyLine>
      )}
    </Section>
  );
}

function WalletTransactionRows({
  rows,
  t,
  onSelect,
}: {
  rows: TransactionRow[];
  t?: MiniT;
  onSelect?: ((transaction: TransactionRow) => void) | undefined;
}) {
  if (!rows.length)
    return <EmptyLine>{t ? t("noTransactionsYet") : "No transactions yet."}</EmptyLine>;
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const currency = String(row.currency ?? "USDT").toUpperCase();
        const incoming = row.direction === "in";
        const Icon = currency === "TRX" ? TronIcon : UsdtIcon;
        return (
          <button
            key={row.id}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/6 p-3 text-left"
            onClick={() => onSelect?.(row)}
          >
            <Icon className="h-9 w-9 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                {t ? (incoming ? t("received") : t("sent")) : incoming ? "Received" : "Sent"}{" "}
                {currency}
              </span>
              <span
                className="block truncate text-xs text-slate-400"
                dir={technicalTextDirection()}
              >
                {row.counterparty_address
                  ? shortenHash(row.counterparty_address, 8)
                  : row.txid
                    ? shortenHash(row.txid, 8)
                    : t
                      ? t("onchainTransaction")
                      : "On-chain transaction"}
              </span>
              <span className="block text-[11px] text-slate-500" dir={technicalTextDirection()}>
                {row.created_at ? new Date(row.created_at).toLocaleString() : ""}
              </span>
            </span>
            <span className="text-right">
              <span
                className={`mono block text-sm font-semibold ${
                  incoming ? "text-primary" : "text-white"
                }`}
              >
                {incoming ? "+" : "-"}
                {money(row.amount, currency)} {currency}
              </span>
              <span className="block text-[11px] capitalize text-slate-500">
                {row.status ?? "completed"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
