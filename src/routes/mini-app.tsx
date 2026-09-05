import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  ChevronLeft,
  ChevronDown,
  CircleCheck,
  CircleDollarSign,
  CircleX,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  LogOut,
  MoreHorizontal,
  Plus,
  QrCode,
  ScanLine,
  ShieldCheck,
  Share2,
  UserRound,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import HomeScreen from "@/components/mini-app/screens/home-screen";
import {
  GasFreeIcon,
  MiniIcons,
  TronIcon,
  UsdtIcon,
  V17NavIcon,
  WtronMark,
  type MiniIcon,
  type V17NavIconName,
} from "@/components/mini-app/crypto-icons";
import { supabase } from "@/integrations/supabase/client";
import {
  createTelegramDeposit,
  createTelegramMiniAppSession,
  fetchTelegramDeposits,
  fetchTelegramHome,
  fetchTelegramP2p,
  fetchTelegramWallet,
  loginTelegramMiniApp,
  logoutTelegramMiniApp,
  registerTelegramMiniApp,
  verifyTelegramMiniApp,
} from "@/lib/telegram.functions";
import { createDirectSellOrder, createVendorDirectSellOrder } from "@/lib/direct-sell.functions";
import {
  confirmDirectSellPaymentItem,
  disputeDirectSellPaymentItem,
} from "@/lib/direct-sell-admin.functions";
import {
  createP2pAd,
  createP2pAvatarUpload,
  createP2pOrderFromAd,
  getP2pAvatarViewUrl,
  registerP2pAvatar,
} from "@/lib/p2p.functions";
import {
  createWallet,
  checkWalletGasFreeCapability,
  createGasFreeTransfer,
  discoverWalletGasFreeAddress,
  getGasFreeSendReadiness,
  importWallet,
  previewTransfer,
  getWalletSecurityStatus,
  refreshWalletBalance,
  revealRecoveryPhrase,
  sendTransfer,
  setDefaultWallet,
  setWalletTransactionPassword,
} from "@/lib/wallets.functions";
import {
  deletePaymentMethod,
  listPaymentMethods,
  saveBankMethod,
  saveUpiMethod,
  setDefaultPaymentMethod,
} from "@/lib/payment-methods.functions";
import { createVendorOrder, fetchVendorMarketplace } from "@/lib/vendor-trade.functions";
import {
  fetchReferralSummary,
  fetchTradeHistory,
  fetchUserAnalytics,
} from "@/lib/user-product.functions";
import {
  fetchVendorPortal,
  saveVendorAccount,
  updateVendorAccountState,
} from "@/lib/vendor.functions";
import {
  formatUsdt,
  isTronAddress,
  networkConfig,
  shortenHash,
  type ChainNetwork,
} from "@/lib/chain";
import {
  createMiniT,
  isMiniRtl,
  MINI_LOCALE_LABELS,
  MINI_LOCALE_STORAGE_KEY,
  normalizeMiniLocale,
  networkLabelForMini,
  technicalTextDirection,
  type MiniLocale,
  type MiniT,
} from "@/lib/mini-i18n";
import { createMiniAppClientId, isMiniAppSessionError } from "@/lib/mini-app-runtime";
import {
  miniAppPersonalWalletTotals,
  visibleMiniAppMainnetWallets,
} from "@/lib/mini-app-wallet-rendering";
import { qrToDataUrl } from "@/lib/mini-app-qr";
import { clearBrowserAuthState } from "@/lib/auth-session";
import {
  miniAppEntryState,
  type VendorApprovalStatus,
  type WtronAccountType,
} from "@/lib/role-auth-policy";
import {
  gasfreeCapabilityNeedsCheck,
  gasfreeCapabilityStatus,
  extractTronAddressFromQrPayload,
  paymentMethodDisplay,
  resolveMiniTheme,
  type MiniThemePreference,
} from "@/lib/mini-wallet-ui";
import { onChainSendEnabled, selectActiveWallet, walletDisplayBalance } from "@/lib/wallet-state";
import { V17Avatar } from "@/components/v17-avatar";
import { V17LoadingState } from "@/components/mini-app/shared/v17-primitives";

const AnalyticsScreen = lazy(() => import("@/components/mini-app/screens/analytics-screen"));
const AuthScreen = lazy(() => import("@/components/mini-app/screens/auth-screen"));
const BankAccountsScreen = lazy(() => import("@/components/mini-app/screens/bank-accounts-screen"));
const HistoryScreen = lazy(() => import("@/components/mini-app/screens/history-screen"));
const MoreScreen = lazy(() => import("@/components/mini-app/screens/more-screen"));
const NotificationsScreen = lazy(
  () => import("@/components/mini-app/screens/notifications-screen"),
);
const OrdersScreen = lazy(() => import("@/components/mini-app/screens/orders-screen"));
const P2pScreen = lazy(() => import("@/components/mini-app/screens/p2p-screen"));
const PendingVendorScreen = lazy(
  () => import("@/components/mini-app/screens/pending-vendor-screen"),
);
const ProfileScreen = lazy(() => import("@/components/mini-app/screens/profile-screen"));
const ReferralScreen = lazy(() => import("@/components/mini-app/screens/referral-screen"));
const SecurityScreen = lazy(() => import("@/components/mini-app/screens/security-screen"));
const TradeScreen = lazy(() => import("@/components/mini-app/screens/trade-screen"));
const WalletScreen = lazy(() => import("@/components/mini-app/screens/wallet-screen"));
const WalletCreateScreen = lazy(() => import("@/components/mini-app/screens/wallet-create-screen"));
const WalletImportScreen = lazy(() => import("@/components/mini-app/screens/wallet-import-screen"));
const WalletDetailScreen = lazy(() =>
  import("@/components/mini-app/screens/wallet-subflows-screen").then((module) => ({
    default: module.WalletDetailScreen,
  })),
);
const WalletHistoryScreen = lazy(() =>
  import("@/components/mini-app/screens/wallet-subflows-screen").then((module) => ({
    default: module.WalletHistoryScreen,
  })),
);
const WalletAssetDetailScreen = lazy(() =>
  import("@/components/mini-app/screens/wallet-subflows-screen").then((module) => ({
    default: module.WalletAssetDetailScreen,
  })),
);
const WalletTransactionDetailScreen = lazy(() =>
  import("@/components/mini-app/screens/wallet-subflows-screen").then((module) => ({
    default: module.WalletTransactionDetailScreen,
  })),
);
const WalletMoreScreen = lazy(() =>
  import("@/components/mini-app/screens/wallet-subflows-screen").then((module) => ({
    default: module.WalletMoreScreen,
  })),
);
const WalletGasFreeScreen = lazy(() =>
  import("@/components/mini-app/screens/wallet-subflows-screen").then((module) => ({
    default: module.WalletGasFreeScreen,
  })),
);
const ReceiveScreen = lazy(() =>
  import("@/components/mini-app/screens/wallet-subflows-screen").then((module) => ({
    default: module.ReceiveScreen,
  })),
);
const BackupScreen = lazy(() =>
  import("@/components/mini-app/screens/wallet-subflows-screen").then((module) => ({
    default: module.BackupScreen,
  })),
);
const PlatformDepositScreen = lazy(() =>
  import("@/components/mini-app/screens/wallet-subflows-screen").then((module) => ({
    default: module.PlatformDepositScreen,
  })),
);
const SendScreen = lazy(() =>
  import("@/components/mini-app/screens/wallet-subflows-screen").then((module) => ({
    default: module.SendScreen,
  })),
);
const DirectSellDetailScreen = lazy(() =>
  import("@/components/mini-app/screens/wallet-subflows-screen").then((module) => ({
    default: module.DirectSellDetailScreen,
  })),
);

const MINI_THEME_STORAGE_KEY = "wtron-mini-theme";
const PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

function validateProfilePhoto(file: File) {
  if (!PROFILE_PHOTO_TYPES.has(file.type)) {
    throw new Error("Upload a JPEG, PNG, WebP or GIF image.");
  }
  if (file.size <= 0) throw new Error("Choose a valid image file.");
  if (file.size > PROFILE_PHOTO_MAX_BYTES) {
    throw new Error("Profile photo must be 2 MB or smaller.");
  }
}

export const Route = createFileRoute("/mini-app")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab:
      search["tab"] === "p2p" ||
      search["tab"] === "trade" ||
      search["tab"] === "wallet" ||
      search["tab"] === "more"
        ? search["tab"]
        : "home",
    auth: search["auth"] === "register" ? "register" : "login",
    handoff: typeof search["handoff"] === "string" ? search["handoff"].slice(0, 256) : undefined,
  }),
  head: () => ({ meta: [{ title: "WTRON Mini App" }] }),
  component: TelegramMiniApp,
});

export type PrimaryTab = "home" | "p2p" | "trade" | "wallet" | "more";
export type VendorPrimaryTab = "home" | "trade" | "wallet" | "orders" | "more";
export type MiniScreen =
  | PrimaryTab
  | "wallet-create"
  | "wallet-import"
  | "wallet-detail"
  | "wallet-history"
  | "wallet-transaction-detail"
  | "wallet-asset-detail"
  | "wallet-receive"
  | "wallet-backup"
  | "wallet-more"
  | "wallet-gasfree"
  | "platform-deposit"
  | "direct-sell-detail"
  | "send"
  | "orders"
  | "analytics"
  | "bank-accounts"
  | "history"
  | "profile"
  | "notifications"
  | "security"
  | "referral";
type P2pTab = "buy" | "sell" | "myAds" | "myOrders";
type TradeTab = "sell" | "buy";
export type ReceiveAsset = "USDT" | "TRX";
export type WalletHistoryAssetFilter = "ALL" | ReceiveAsset;
export type WalletHistoryDirectionFilter = "ALL" | "in" | "out";
type P2pFilters = {
  bestRate: boolean;
  verified: boolean;
  upi: boolean;
  highCompletion: boolean;
};

interface TelegramWebApp {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  showScanQrPopup?: (
    params: { text?: string },
    callback: (payload: string) => boolean | void,
  ) => void;
  closeScanQrPopup?: () => void;
  onEvent?: (eventType: "scanQrPopupClosed", handler: () => void) => void;
  offEvent?: (eventType: "scanQrPopupClosed", handler: () => void) => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (handler: () => void) => void;
    offClick: (handler: () => void) => void;
  };
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

export interface ProfileSummary {
  id?: string | null;
  balance?: number | string | null;
  locked_balance?: number | string | null;
  pending_balance?: number | string | null;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  avatar_path?: string | null;
  avatar_updated_at?: string | null;
}

interface Overview {
  profile?: ProfileSummary | null;
  activeOrders?: OrderRow[];
  orders?: OrderRow[];
  directSellOrders?: DirectSellOrderRow[];
  directSellPaymentItems?: DirectSellPaymentItemRow[];
  transactions?: TransactionRow[];
  notifications?: NotificationRow[];
  wallets?: WalletRow[];
}

export interface OrderRow {
  id: string;
  order_ref?: string | null;
  side?: string | null;
  status?: string | null;
  usdt_amount?: number | string | null;
  total_inr?: number | string | null;
  payment_deadline?: string | null;
  created_at?: string | null;
}

export interface TransactionRow {
  id: string;
  wallet_id?: string | null;
  entry_type?: string | null;
  direction?: string | null;
  kind?: string | null;
  currency?: string | null;
  amount?: number | string | null;
  fee?: number | string | null;
  bucket?: string | null;
  network?: string | null;
  reference_id?: string | null;
  txid?: string | null;
  status?: string | null;
  memo?: string | null;
  counterparty_address?: string | null;
  created_at?: string | null;
}

interface NotificationRow {
  id: string;
  title?: string | null;
  body?: string | null;
  severity?: string | null;
  read_at?: string | null;
  created_at?: string | null;
}

interface AdRow {
  id: string;
  side: "buy" | "sell";
  price_inr: number | string;
  available_usdt: number | string;
  min_order_inr: number | string;
  max_order_inr: number | string;
  payment_methods: string[] | null;
  terms?: string | null;
  merchants?: {
    display_name?: string | null;
    completed_orders?: number | null;
    total_orders?: number | null;
    status?: string | null;
  } | null;
}

export interface DepositRow {
  id: string;
  order_ref?: string | null;
  expected_amount?: number | string | null;
  received_amount?: number | string | null;
  status?: string | null;
  txid?: string | null;
  confirmations?: number | null;
  required_confirmations?: number | null;
  wallets?: { address?: string | null } | null;
  wallet_address?: string | null;
  network?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
}

export interface DirectSellOrderRow {
  id: string;
  order_ref?: string | null;
  deposit_request_id?: string | null;
  payment_method_id?: string | null;
  payment_assignment?: Record<string, unknown> | null;
  actor_type?: string | null;
  payout_account_source?: string | null;
  vendor_id?: string | null;
  vendor_payment_account_id?: string | null;
  expected_usdt?: number | string | null;
  received_usdt?: number | string | null;
  expected_inr?: number | string | null;
  locked_rate_inr?: number | string | null;
  status?: string | null;
  assigned_company_address?: string | null;
  txid?: string | null;
  confirmations?: number | null;
  required_confirmations?: number | null;
  expires_at?: string | null;
  created_at?: string | null;
}

export interface DirectSellPaymentItemRow {
  id: string;
  direct_sell_order_id: string;
  amount_inr?: number | string | null;
  utr_reference?: string | null;
  proof_path?: string | null;
  status?: string | null;
  confirmation_deadline?: string | null;
  confirmed_at?: string | null;
  disputed_at?: string | null;
  created_at?: string | null;
}

interface DirectSellOrderCreated {
  order_id: string;
  order_ref: string;
  deposit_request_id: string;
  wallet_address: string;
  expected_inr: number | string;
  locked_rate_inr?: number | string;
  network?: string;
  actor_type?: string;
  payout_account_source?: string;
  payout_account_id?: string;
  vendor_id?: string | null;
  amount_usdt?: number;
}

export interface WalletRow {
  id: string;
  name?: string | null;
  address?: string | null;
  network?: ChainNetwork | null;
  balance?: number | string | null;
  onchain_balance?: number | string | null;
  onchain_trx_balance?: number | string | null;
  onchain_checked_at?: string | null;
  is_default?: boolean | null;
  custody?: string | null;
  wallet_type?: string | null;
  backup_status?: string | null;
  gas_sponsorship_status?: string | null;
  gasfree_capability_checked_at?: string | null;
  gasfree_capability_error?: string | null;
  gasfree_capability_metadata?: unknown;
  wallet_role?: string | null;
  parent_wallet_id?: string | null;
  wallet_group_id?: string | null;
}

export interface WalletResourceSnapshot {
  freeBandwidthLimit: number;
  freeBandwidthUsed: number;
  bandwidthLimit: number;
  bandwidthUsed: number;
  energyLimit: number;
  energyUsed: number;
}

export interface GasFreeReadiness {
  provider: string;
  status: string;
  reason: string;
  network: ChainNetwork;
  asset: string;
  configured: boolean;
  serviceProviderConfigured: boolean;
  apiKeyConfigured: boolean;
  apiSecretConfigured: boolean;
  accountStatus?: string | null;
  activationState?: string | null;
  accountActive?: boolean | null;
  accountAllowSubmit?: boolean | null;
  accountNonce?: string | null;
  quoteAvailable?: boolean | null;
  transferFee?: number | null;
  activateFee?: number | null;
  platformFee?: number | null;
  productTransferAllowed?: boolean | null;
  productTransferBlockedBy?: string | null;
  productTransferReason?: string | null;
}

export interface GasFreeTransferResult {
  ok?: boolean;
  status?: string;
  message?: string;
  idempotent?: boolean;
  request?: {
    id?: string | null;
    status?: string | null;
    provider_request_id?: string | null;
    txid?: string | null;
    failure_reason?: string | null;
  } | null;
  submitted?: {
    id?: string | null;
    state?: string | null;
    txId?: string | null;
    txid?: string | null;
  } | null;
}

export interface StandardTransferPreview {
  asset: ReceiveAsset;
  customerFee: number;
  customerFeeCurrency: ReceiveAsset;
  totalDebit: number;
  estimatedEnergy?: number | null;
  provider?: string | null;
  providerCostUsdt?: number | null;
  providerCostTrx?: number | null;
  networkCostTrx?: number | null;
  customerFeeTrx?: number | null;
  wtronRevenueUsdt?: number | null;
  wtronRevenueTrx?: number | null;
  blocked?: boolean | null;
  blockCode?: string | null;
  signingEnabled?: boolean | null;
  mainnetSigningEnabled?: boolean | null;
  energyRouteEnabled?: boolean | null;
  signerReady?: boolean | null;
  transactionPasswordConfigured?: boolean | null;
  transactionPasswordLocked?: boolean | null;
  availableBalance?: number | null;
  availableTrxBalance?: number | null;
}

export interface PaymentMethodRow {
  id: string;
  kind: "upi" | "bank";
  upi_id?: string | null;
  holder_name?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc?: string | null;
  label?: string | null;
  supported_rails?: string[] | null;
  status?: string | null;
  is_default?: boolean | null;
  verified?: boolean | null;
  min_inr?: number | string | null;
  max_inr?: number | string | null;
  daily_limit_inr?: number | string | null;
  daily_used_inr?: number | string | null;
  daily_remaining_inr?: number | string | null;
  frozen?: boolean | null;
}

export interface VendorListingRow {
  id: string;
  rate_inr: number | string;
  available_usdt: number | string;
  min_order_inr: number | string;
  max_order_inr: number | string;
  payment_rails: string[];
  trading_vendors?: {
    name?: string | null;
    success_rate?: number | string | null;
    completed_orders?: number | null;
    status?: string | null;
  } | null;
}

interface VendorPaymentAccountRow {
  id: string;
  rail: "upi" | "imps" | "neft" | "rtgs" | string;
  supported_rails?: string[] | null;
  label?: string | null;
  account_ref?: string | null;
  holder_name?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc?: string | null;
  archived_at?: string | null;
  min_inr?: number | string | null;
  max_inr?: number | string | null;
  daily_limit_inr?: number | string | null;
  daily_used_inr?: number | string | null;
  daily_remaining_inr?: number | string | null;
  daily_usage_business_date?: string | null;
  status?: string | null;
  enabled?: boolean | null;
  frozen?: boolean | null;
  is_default?: boolean | null;
}

interface AnalyticsSummary {
  totalUsdtVolume: number;
  totalInrVolume: number;
  p2pBuyVolume: number;
  p2pSellVolume: number;
  companyTradeVolume: number;
  feesPaid: number;
  completedOrders: number;
  disputes: number;
  chart: { date: string; usdt: number; inr: number }[];
}

interface ReferralSummary {
  referralCode: string;
  referralLink: string;
  invitedUsers: { id: string; status: string; created_at: string }[];
  qualifiedReferrals: number;
  pendingEarnings: number;
  paidEarnings: number;
  totalReferralEarnings?: number;
  eligibleTradeVolume?: number;
  settings?: { key: string; value: unknown }[];
  rewards?: {
    id?: string;
    amount: number | string;
    currency?: string | null;
    status: string;
    source_type?: string | null;
    source_order_id?: string | null;
    trade_amount_usdt?: number | string | null;
    rate_percent?: number | string | null;
    created_at?: string | null;
  }[];
}

function tabForScreen(screen: MiniScreen): PrimaryTab {
  if (screen.startsWith("wallet")) return "wallet";
  if (
    [
      "orders",
      "analytics",
      "bank-accounts",
      "history",
      "profile",
      "notifications",
      "security",
      "referral",
    ].includes(screen)
  ) {
    return "more";
  }
  if (screen === "platform-deposit" || screen === "direct-sell-detail" || screen === "send")
    return "home";
  return screen as PrimaryTab;
}

function backScreenFor(screen: MiniScreen, transactionBackScreen: MiniScreen): MiniScreen {
  if (screen === "wallet-transaction-detail") return transactionBackScreen;
  if (screen === "wallet-history" || screen === "wallet-asset-detail") return "wallet-detail";
  if (screen === "wallet-detail" || screen === "wallet-create" || screen === "wallet-import")
    return "wallet";
  if (
    screen === "wallet-receive" ||
    screen === "wallet-backup" ||
    screen === "wallet-more" ||
    screen === "wallet-gasfree"
  )
    return "wallet-detail";
  return tabForScreen(screen);
}

async function getTelegramLaunch() {
  if (typeof window === "undefined") return { initData: "", sdkPresent: false };
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const webApp = (window as TelegramWindow).Telegram?.WebApp;
    webApp?.ready?.();
    webApp?.expand?.();
    if (webApp?.initData) return { initData: webApp.initData, sdkPresent: true };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const webApp = (window as TelegramWindow).Telegram?.WebApp;
  webApp?.ready?.();
  webApp?.expand?.();
  return { initData: webApp?.initData ?? "", sdkPresent: Boolean(webApp) };
}

function clearHandoffFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("handoff")) return;
  url.searchParams.delete("handoff");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function money(value: unknown, currency = "USDT") {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return currency === "INR" ? "INR 0.00" : formatUsdt(0);
  if (currency === "INR") {
    return `INR ${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  return formatUsdt(number);
}

function vendorAccountAsPaymentMethod(account: VendorPaymentAccountRow): PaymentMethodRow {
  const isUpi = account.rail === "upi";
  return {
    id: account.id,
    kind: isUpi ? "upi" : "bank",
    label: account.label ?? (isUpi ? "Vendor UPI" : "Vendor Bank"),
    holder_name: account.holder_name ?? null,
    upi_id: isUpi ? (account.account_ref ?? null) : null,
    bank_name: isUpi ? null : (account.bank_name ?? account.rail.toUpperCase()),
    account_number: isUpi ? null : (account.account_number ?? account.account_ref ?? null),
    ifsc: account.ifsc ?? null,
    supported_rails: (account.supported_rails?.length ? account.supported_rails : [account.rail])
      .filter(Boolean)
      .map((rail) => String(rail).toUpperCase()),
    status: account.status ?? "active",
    is_default: account.is_default ?? false,
    verified: true,
    min_inr: account.min_inr ?? null,
    max_inr: account.max_inr ?? null,
    daily_limit_inr: account.daily_limit_inr ?? null,
    daily_used_inr: account.daily_used_inr ?? null,
    daily_remaining_inr: account.daily_remaining_inr ?? null,
    frozen: account.frozen ?? false,
  };
}

function vendorSupportedRails(method: PaymentMethodRow) {
  if (method.kind === "upi") return ["upi"];
  const rails = (method.supported_rails ?? []).map((rail) => String(rail).toLowerCase());
  return rails.length ? rails : ["imps", "neft", "rtgs"];
}

function directSellAssignmentValue(order: DirectSellOrderRow | null | undefined, key: string) {
  const assignment = order?.payment_assignment;
  if (!assignment || typeof assignment !== "object") return null;
  const value = assignment[key];
  return typeof value === "string" && value ? value : null;
}

function completionRate(ad: AdRow) {
  const completed = Number(ad.merchants?.completed_orders ?? 0);
  const total = Number(ad.merchants?.total_orders ?? 0);
  if (!total) return "New";
  return `${Math.round((completed / total) * 100)}%`;
}

function completionRateNumber(ad: AdRow) {
  const completed = Number(ad.merchants?.completed_orders ?? 0);
  const total = Number(ad.merchants?.total_orders ?? 0);
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

function isVerifiedSeller(ad: AdRow) {
  return ad.merchants?.status === "verified" || Number(ad.merchants?.completed_orders ?? 0) > 0;
}

function applyP2pFilters(ads: AdRow[], filters: P2pFilters) {
  const rows = ads
    .filter((ad) => ad.side === "sell")
    .filter((ad) => !filters.verified || isVerifiedSeller(ad))
    .filter((ad) => !filters.upi || (ad.payment_methods ?? []).includes("upi"))
    .filter((ad) => !filters.highCompletion || completionRateNumber(ad) >= 95);
  return filters.bestRate
    ? [...rows].sort((a, b) => Number(a.price_inr ?? 0) - Number(b.price_inr ?? 0))
    : rows;
}

function personalSpendWallets(wallets: WalletRow[]) {
  return wallets.filter(
    (wallet) => wallet.wallet_role !== "gasfree" && wallet.wallet_type !== "gasfree",
  );
}

function safeAddress(address?: string | null) {
  return address && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address) ? address : "";
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

async function scanRecoveryPhraseQrWithTelegram(webApp: TelegramWebApp) {
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
    showScanQrPopup({ text: "Scan WTRON recovery phrase QR" }, (payload) => {
      const phrase = normalizeRecoveryPhrase(payload);
      if (!phrase) {
        cleanup();
        webApp.closeScanQrPopup?.();
        reject(new QrScanError("invalid"));
        return true;
      }
      cleanup();
      resolve(phrase);
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

async function scanRecoveryPhraseQrWithCamera() {
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
        const phrase = normalizeRecoveryPhrase(code.rawValue ?? "");
        if (phrase) return phrase;
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

function normalizeRecoveryPhrase(payload: string) {
  const value = payload
    .replace(/^wtron:\/\//i, "")
    .replace(/^mnemonic:/i, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const words = value.split(" ").filter(Boolean);
  return [12, 15, 18, 21, 24].includes(words.length) ? words.join(" ") : "";
}

async function scanRecoveryPhraseQr() {
  const webApp = typeof window !== "undefined" ? (window as TelegramWindow).Telegram?.WebApp : null;
  if (webApp?.showScanQrPopup) return await scanRecoveryPhraseQrWithTelegram(webApp);
  return await scanRecoveryPhraseQrWithCamera();
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

function screenTitle(screen: MiniScreen, t: MiniT) {
  const titles: Partial<Record<MiniScreen, string>> = {
    home: t("home"),
    p2p: t("p2p"),
    trade: t("trade"),
    wallet: t("wallet"),
    more: t("more"),
    "wallet-create": t("createWallet"),
    "wallet-import": t("importWallet"),
    "wallet-detail": t("wallet"),
    "wallet-history": t("walletHistory"),
    "wallet-transaction-detail": t("transactionDetail"),
    "wallet-asset-detail": t("assets"),
    "wallet-receive": t("receive"),
    "wallet-backup": t("backup"),
    "wallet-more": t("walletInformation"),
    "wallet-gasfree": "GasFree",
    "platform-deposit": "Deposit",
    "direct-sell-detail": t("directSell"),
    send: t("send"),
    orders: t("orders"),
    analytics: "Analytics",
    "bank-accounts": t("payments"),
    history: t("history"),
    profile: t("profile"),
    notifications: t("notifications"),
    security: t("security"),
    referral: "Referral",
  };
  return titles[screen] ?? "WTRON";
}

function TelegramMiniApp() {
  const search = Route.useSearch();
  const verifyLaunch = useServerFn(verifyTelegramMiniApp);
  const loginTelegram = useServerFn(loginTelegramMiniApp);
  const registerTelegram = useServerFn(registerTelegramMiniApp);
  const createTelegramSession = useServerFn(createTelegramMiniAppSession);
  const logoutTelegram = useServerFn(logoutTelegramMiniApp);
  const loadHome = useServerFn(fetchTelegramHome);
  const loadWallet = useServerFn(fetchTelegramWallet);
  const loadP2p = useServerFn(fetchTelegramP2p);
  const loadDeposits = useServerFn(fetchTelegramDeposits);
  const createDeposit = useServerFn(createTelegramDeposit);
  const takeP2pAd = useServerFn(createP2pOrderFromAd);
  const createSellAd = useServerFn(createP2pAd);
  const createDirectSell = useServerFn(createDirectSellOrder);
  const createVendorDirectSell = useServerFn(createVendorDirectSellOrder);
  const confirmDirectSellItem = useServerFn(confirmDirectSellPaymentItem);
  const disputeDirectSellItem = useServerFn(disputeDirectSellPaymentItem);
  const createPersonalWallet = useServerFn(createWallet);
  const importPersonalWallet = useServerFn(importWallet);
  const setMiniDefaultWallet = useServerFn(setDefaultWallet);
  const setMiniTransactionPassword = useServerFn(setWalletTransactionPassword);
  const revealPhrase = useServerFn(revealRecoveryPhrase);
  const loadWalletSecurityStatus = useServerFn(getWalletSecurityStatus);
  const refreshBalance = useServerFn(refreshWalletBalance);
  const checkGasfreeCapability = useServerFn(checkWalletGasFreeCapability);
  const discoverGasfreeWallet = useServerFn(discoverWalletGasFreeAddress);
  const loadGasfreeReadiness = useServerFn(getGasFreeSendReadiness);
  const submitGasfreeTransfer = useServerFn(createGasFreeTransfer);
  const loadTransferPreview = useServerFn(previewTransfer);
  const submitStandardTransfer = useServerFn(sendTransfer);
  const loadPaymentMethods = useServerFn(listPaymentMethods);
  const loadVendorPortal = useServerFn(fetchVendorPortal);
  const saveVendorPayout = useServerFn(saveVendorAccount);
  const updateVendorPayoutState = useServerFn(updateVendorAccountState);
  const saveUpi = useServerFn(saveUpiMethod);
  const saveBank = useServerFn(saveBankMethod);
  const makePaymentDefault = useServerFn(setDefaultPaymentMethod);
  const removePaymentMethod = useServerFn(deletePaymentMethod);
  const loadVendors = useServerFn(fetchVendorMarketplace);
  const reserveVendor = useServerFn(createVendorOrder);
  const loadAnalytics = useServerFn(fetchUserAnalytics);
  const loadTradeHistory = useServerFn(fetchTradeHistory);
  const loadReferral = useServerFn(fetchReferralSummary);
  const createAvatarUpload = useServerFn(createP2pAvatarUpload);
  const registerAvatar = useServerFn(registerP2pAvatar);
  const loadAvatarUrl = useServerFn(getP2pAvatarViewUrl);

  const [screen, setScreen] = useState<MiniScreen>((search.tab as PrimaryTab) ?? "home");
  const [locale, setLocale] = useState<MiniLocale>(() => {
    if (typeof window === "undefined") return "en";
    return normalizeMiniLocale(window.localStorage.getItem(MINI_LOCALE_STORAGE_KEY));
  });
  const [theme, setTheme] = useState<MiniThemePreference>(() => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem(MINI_THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  });
  const [authMode, setAuthMode] = useState<"login" | "register">(
    search.auth as "login" | "register",
  );
  const [authNotice, setAuthNotice] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [accountType, setAccountType] = useState<"trader" | "vendor">("trader");
  const [initData, setInitData] = useState("");
  const [handoffToken, setHandoffToken] = useState(search.handoff ?? "");
  const [launchChecked, setLaunchChecked] = useState(false);
  const [linked, setLinked] = useState(false);
  const [linkedAccountType, setLinkedAccountType] = useState<WtronAccountType | "admin" | null>(
    null,
  );
  const [vendorStatus, setVendorStatus] = useState<VendorApprovalStatus | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bootstrapError, setBootstrapError] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [depositAddress, setDepositAddress] = useState<{
    address?: string;
    network?: string;
  } | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [vendorListings, setVendorListings] = useState<VendorListingRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [tradeHistory, setTradeHistory] = useState<unknown[]>([]);
  const [referral, setReferral] = useState<ReferralSummary | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<TransactionRow[]>([]);
  const [walletResources, setWalletResources] = useState<WalletResourceSnapshot | null>(null);
  const [gasfreeReadiness, setGasfreeReadiness] = useState<GasFreeReadiness | null>(null);
  const [walletResourcesCheckedAt, setWalletResourcesCheckedAt] = useState("");
  const [selectedDirectSellId, setSelectedDirectSellId] = useState("");
  const [createdDirectSell, setCreatedDirectSell] = useState<DirectSellOrderCreated | null>(null);
  const [walletTransactionHasMore, setWalletTransactionHasMore] = useState(false);
  const [walletHistoryAsset, setWalletHistoryAsset] = useState<WalletHistoryAssetFilter>("ALL");
  const [walletHistoryDirection, setWalletHistoryDirection] =
    useState<WalletHistoryDirectionFilter>("ALL");
  const [selectedWalletAsset, setSelectedWalletAsset] = useState<ReceiveAsset>("USDT");
  const [selectedWalletTransactionId, setSelectedWalletTransactionId] = useState("");
  const [transactionBackScreen, setTransactionBackScreen] = useState<MiniScreen>("wallet-history");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [receiveAsset, setReceiveAsset] = useState<ReceiveAsset>("USDT");
  const [walletQr, setWalletQr] = useState("");
  const [depositQr, setDepositQr] = useState("");
  const [directSellQr, setDirectSellQr] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [p2pAmount, setP2pAmount] = useState("");
  const [p2pTab, setP2pTab] = useState<P2pTab>("buy");
  const [p2pFilters, setP2pFilters] = useState<P2pFilters>({
    bestRate: true,
    verified: false,
    upi: false,
    highCompletion: false,
  });
  const [p2pWalletAvailability, setP2pWalletAvailability] = useState<Record<string, number>>({});
  const [tradeTab, setTradeTab] = useState<TradeTab>("sell");
  const [directSellAmount, setDirectSellAmount] = useState("");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [vendorPaymentAccounts, setVendorPaymentAccounts] = useState<VendorPaymentAccountRow[]>([]);
  const [selectedVendorPaymentAccountId, setSelectedVendorPaymentAccountId] = useState("");
  const [vendorAmount, setVendorAmount] = useState("");
  const [vendorRail, setVendorRail] = useState<"upi" | "imps" | "neft" | "rtgs">("upi");
  const [createWalletName, setCreateWalletName] = useState("Main Wallet");
  const [walletPassword, setWalletPassword] = useState("");
  const [walletCurrentPassword, setWalletCurrentPassword] = useState("");
  const [walletPasswordConfirm, setWalletPasswordConfirm] = useState("");
  const [transactionPasswordEnabled, setTransactionPasswordEnabled] = useState(false);
  const [transactionPasswordChangeOpen, setTransactionPasswordChangeOpen] = useState(false);
  const [importPhrase, setImportPhrase] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [revealedPhrase, setRevealedPhrase] = useState("");
  const [sendAsset, setSendAsset] = useState<ReceiveAsset>("USDT");
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendMode, setSendMode] = useState<"standard" | "gasfree">("standard");
  const [standardTransferPassword, setStandardTransferPassword] = useState("");
  const [standardTransferPreview, setStandardTransferPreview] =
    useState<StandardTransferPreview | null>(null);
  const [standardTransferPreviewError, setStandardTransferPreviewError] = useState("");
  const [standardTransferSubmitState, setStandardTransferSubmitState] = useState<
    "idle" | "submitting" | "submitted" | "failed"
  >("idle");
  const [standardTransferResult, setStandardTransferResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [standardTransferIdempotencyKey, setStandardTransferIdempotencyKey] = useState(() =>
    createMiniAppClientId("standard-send"),
  );
  const [gasfreeSendPassword, setGasfreeSendPassword] = useState("");
  const [gasfreeSubmitState, setGasfreeSubmitState] = useState<
    "idle" | "preparing" | "awaiting_password" | "submitting" | "pending" | "confirmed" | "failed"
  >("idle");
  const [gasfreeSendIdempotencyKey, setGasfreeSendIdempotencyKey] = useState(() =>
    createMiniAppClientId("gasfree-send"),
  );
  const [gasfreeTransferResult, setGasfreeTransferResult] = useState<GasFreeTransferResult | null>(
    null,
  );
  const [sellAd, setSellAd] = useState({ amount: "", rate: "", min: "", max: "", terms: "" });
  const [sellAdSourceWalletId, setSellAdSourceWalletId] = useState("");
  const [upiForm, setUpiForm] = useState({ upiId: "", holderName: "", label: "" });
  const [bankForm, setBankForm] = useState({
    accountHolder: "",
    accountNumber: "",
    ifsc: "",
    bankName: "",
    label: "",
  });
  const [vendorBankRail, setVendorBankRail] = useState<"all" | "imps" | "neft" | "rtgs">("all");
  const [vendorAccountLimits, setVendorAccountLimits] = useState({
    minInr: "500",
    maxInr: "50000",
    dailyLimitInr: "100000",
  });
  const screenRef = useRef<MiniScreen>(screen);
  const refreshRealtimeDataRef = useRef<
    (reasons: Set<"deposit" | "ledger" | "p2p">) => Promise<void>
  >(async () => undefined);
  const dataLoadedRef = useRef({
    home: false,
    wallet: false,
    deposits: false,
    paymentMethods: false,
    security: false,
    p2p: false,
    vendorListings: false,
    vendorPortal: false,
    analytics: false,
    history: false,
    referral: false,
  });
  type MiniDataset = keyof typeof dataLoadedRef.current;
  const inFlightDataRef = useRef<Partial<Record<MiniDataset, Promise<void>>>>({});
  const realtimeRefreshTimerRef = useRef<number | null>(null);
  const realtimeRefreshReasonsRef = useRef<Set<"deposit" | "ledger" | "p2p">>(new Set());

  const profile = overview?.profile ?? null;
  const wallets = visibleMiniAppMainnetWallets(overview?.wallets ?? []);
  const selectedWallet = selectActiveWallet(wallets, selectedWalletId);
  const selectedGasfreeWallet =
    selectedWallet?.wallet_role === "gasfree"
      ? selectedWallet
      : wallets.find(
          (wallet) =>
            wallet.wallet_role === "gasfree" &&
            wallet.parent_wallet_id === selectedWallet?.id &&
            wallet.network === selectedWallet?.network,
        );
  const selectedAddress = safeAddress(selectedWallet?.address);
  const selectedWalletTransaction =
    walletTransactions.find((row) => row.id === selectedWalletTransactionId) ?? null;
  const primaryTab = tabForScreen(screen);
  const t = useMemo(() => createMiniT(locale), [locale]);
  const isRtl = isMiniRtl(locale);
  const appliedTheme = useMemo(() => {
    const systemDark =
      typeof window === "undefined"
        ? true
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
    return resolveMiniTheme(theme, systemDark);
  }, [theme]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    let active = true;
    if (!profile?.avatar_path || loading) {
      setAvatarUrl("");
      return;
    }
    const timer = window.setTimeout(() => {
      void loadAvatarUrl({ data: { avatarPath: profile.avatar_path } })
        .then((result) => {
          if (active) setAvatarUrl(result.url);
        })
        .catch(() => {
          if (active) setAvatarUrl("");
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadAvatarUrl, loading, profile?.avatar_path, profile?.avatar_updated_at]);

  async function uploadProfilePhoto(file: File) {
    setAvatarUploading(true);
    try {
      validateProfilePhoto(file);
      const upload = await createAvatarUpload({
        data: {
          fileName: file.name || "profile.jpg",
          contentType: file.type as never,
          sizeBytes: file.size,
        },
      });
      const { error } = await supabase.storage
        .from("user-avatars")
        .uploadToSignedUrl(upload.path, upload.token, file);
      if (error) throw error;
      await registerAvatar({
        data: {
          fileName: file.name || "profile.jpg",
          contentType: file.type as never,
          sizeBytes: file.size,
          storagePath: upload.path,
        },
      });
      const view = await loadAvatarUrl({ data: { avatarPath: upload.path } });
      setAvatarUrl(view.url);
      setOverview((current) => ({
        ...(current ?? {}),
        profile: {
          ...(current?.profile ?? profile ?? {}),
          avatar_path: upload.path,
          avatar_updated_at: new Date().toISOString(),
        },
      }));
      toast.success("Profile photo updated");
    } catch (error) {
      toast.error(friendlyMiniError(error, "Could not upload profile photo"));
    } finally {
      setAvatarUploading(false);
    }
  }

  useEffect(() => {
    if (screen !== "send" || sendMode !== "standard" || !selectedWallet?.id) {
      setStandardTransferPreview(null);
      setStandardTransferPreviewError("");
      return;
    }
    const amount = Number(sendAmount);
    const recipient = sendAddress.trim();
    if (!isTronAddress(recipient) || !Number.isFinite(amount) || amount <= 0) {
      setStandardTransferPreview(null);
      setStandardTransferPreviewError("");
      return;
    }
    let stale = false;
    const timer = window.setTimeout(() => {
      void loadTransferPreview({
        data: {
          walletId: selectedWallet.id,
          asset: sendAsset,
          toAddress: recipient,
          amount,
        },
      })
        .then((preview) => {
          if (stale) return;
          setStandardTransferPreview(preview as StandardTransferPreview);
          setStandardTransferPreviewError("");
        })
        .catch((error) => {
          if (stale) return;
          setStandardTransferPreview(null);
          setStandardTransferPreviewError(friendlyMiniError(error, "Could not prepare send"));
        });
    }, 300);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [
    loadTransferPreview,
    screen,
    selectedWallet?.id,
    sendAddress,
    sendAmount,
    sendAsset,
    sendMode,
  ]);

  const platformBalance = Number(profile?.balance ?? 0);
  const lockedBalance = Number(profile?.locked_balance ?? 0);
  const pendingBalance = Number(profile?.pending_balance ?? 0);
  const personalTotals = miniAppPersonalWalletTotals(wallets);
  const totalAssets = personalTotals.usdt;
  const latestDeposit = deposits[0];
  const directSellOrders = overview?.directSellOrders ?? [];
  const directSellPaymentItems = overview?.directSellPaymentItems ?? [];
  const activeUpiMethods = paymentMethods.filter(
    (method) => method.kind === "upi" && (method.status ?? "active") === "active",
  );
  const activePayoutMethods = paymentMethods.filter(
    (method) =>
      ["upi", "bank"].includes(String(method.kind ?? "")) &&
      (method.status ?? "active") === "active",
  );
  const activeVendorPaymentAccounts = vendorPaymentAccounts.filter(
    (account) =>
      account.status === "active" &&
      account.enabled !== false &&
      account.frozen !== true &&
      !account.archived_at,
  );
  const vendorPayoutMethods = vendorPaymentAccounts.map(vendorAccountAsPaymentMethod);
  const activeVendorPayoutMethods = activeVendorPaymentAccounts.map(vendorAccountAsPaymentMethod);
  const selectedActiveVendorPayout =
    activeVendorPaymentAccounts.find((method) => method.id === selectedVendorPaymentAccountId) ??
    activeVendorPaymentAccounts.find((method) => method.is_default) ??
    activeVendorPaymentAccounts[0] ??
    null;
  const selectedVendorPayoutDisplay = selectedActiveVendorPayout
    ? vendorAccountAsPaymentMethod(selectedActiveVendorPayout)
    : null;
  const selectedDirectSell =
    directSellOrders.find((order) => order.id === selectedDirectSellId) ??
    (createdDirectSell
      ? ({
          id: createdDirectSell.order_id,
          order_ref: createdDirectSell.order_ref,
          deposit_request_id: createdDirectSell.deposit_request_id,
          payment_method_id:
            createdDirectSell.payout_account_source === "payment_methods"
              ? (createdDirectSell.payout_account_id ?? null)
              : null,
          vendor_payment_account_id:
            createdDirectSell.payout_account_source === "vendor_payment_accounts"
              ? (createdDirectSell.payout_account_id ?? null)
              : null,
          vendor_id: createdDirectSell.vendor_id ?? null,
          actor_type: createdDirectSell.actor_type ?? null,
          payout_account_source: createdDirectSell.payout_account_source ?? null,
          payment_assignment: {
            actor_type: createdDirectSell.actor_type ?? null,
            payout_account_source: createdDirectSell.payout_account_source ?? null,
            payout_account_id: createdDirectSell.payout_account_id ?? null,
            vendor_id: createdDirectSell.vendor_id ?? null,
          },
          expected_usdt: createdDirectSell.amount_usdt ?? directSellAmount,
          expected_inr: createdDirectSell.expected_inr,
          locked_rate_inr: createdDirectSell.locked_rate_inr ?? null,
          assigned_company_address: createdDirectSell.wallet_address,
          status: "waiting_for_usdt",
        } satisfies DirectSellOrderRow)
      : null);
  const defaultPaymentMethod =
    paymentMethods.find((method) => method.id === selectedPaymentMethodId) ??
    paymentMethods.find((method) => method.is_default) ??
    paymentMethods[0] ??
    null;
  const selectedActivePayout =
    activePayoutMethods.find((method) => method.id === selectedPaymentMethodId) ??
    activePayoutMethods.find((method) => method.is_default) ??
    activePayoutMethods[0] ??
    null;
  const selectedActiveUpi =
    activeUpiMethods.find((method) => method.id === selectedPaymentMethodId) ??
    activeUpiMethods.find((method) => method.is_default) ??
    activeUpiMethods[0] ??
    null;
  const activeSellWallets = personalSpendWallets(wallets).filter(
    (wallet) => walletDisplayBalance(wallet) > 0,
  );
  const selectedSellAdWallet =
    activeSellWallets.find((wallet) => wallet.id === sellAdSourceWalletId) ??
    activeSellWallets.find((wallet) => wallet.id === selectedWallet?.id) ??
    activeSellWallets[0] ??
    null;

  async function loadP2pWalletAvailability(walletRows = activeSellWallets) {
    if (!walletRows.length) {
      setP2pWalletAvailability({});
      return;
    }
    const entries = await Promise.all(
      walletRows.map(async (wallet) => {
        try {
          const { data, error } = await supabase.rpc(
            "personal_wallet_available_usdt_for_wallet" as never,
            { _wallet_id: wallet.id } as never,
          );
          if (error) throw error;
          return [wallet.id, Number(data ?? 0)] as const;
        } catch {
          return [wallet.id, walletDisplayBalance(wallet)] as const;
        }
      }),
    );
    setP2pWalletAvailability(Object.fromEntries(entries));
  }

  function applyWalletResult(
    result: Overview & {
      deposits?: DepositRow[];
      depositAddress?: { address?: string; network?: string } | null;
    },
  ) {
    setOverview((current) => ({ ...(current ?? {}), ...result }));
    setDeposits(result.deposits ?? []);
    setDepositAddress(result.depositAddress ?? null);
  }

  function runDatasetLoader(key: MiniDataset, load: () => Promise<void>) {
    const pending = inFlightDataRef.current[key];
    if (pending) return pending;
    const request = load().finally(() => {
      delete inFlightDataRef.current[key];
    });
    inFlightDataRef.current[key] = request;
    return request;
  }

  async function loadHomeData(launch = initData, force = false) {
    if (!launch || (dataLoadedRef.current.home && !force)) return;
    await runDatasetLoader("home", async () => {
      const home = (await loadHome({ data: { initData: launch } })) as unknown as Overview;
      setOverview(home);
      dataLoadedRef.current.home = true;
    });
  }

  async function loadWalletData(launch = initData, force = false) {
    if (!launch || (dataLoadedRef.current.wallet && !force)) return;
    await runDatasetLoader("wallet", async () => {
      const wallet = (await loadWallet({ data: { initData: launch } })) as unknown as Overview & {
        deposits?: DepositRow[];
        depositAddress?: { address?: string; network?: string } | null;
      };
      applyWalletResult(wallet);
      dataLoadedRef.current.wallet = true;
      dataLoadedRef.current.deposits = true;
    });
  }

  async function loadDepositsData(launch = initData, force = false) {
    if (!launch || (dataLoadedRef.current.deposits && !force)) return;
    await runDatasetLoader("deposits", async () => {
      const depositData = await loadDeposits({ data: { initData: launch } });
      setDeposits((depositData.deposits ?? []) as DepositRow[]);
      setDepositAddress(
        depositData.depositAddress as { address?: string; network?: string } | null,
      );
      dataLoadedRef.current.deposits = true;
    });
  }

  async function loadDirectSellPaymentItemsData(force = false, orderId = selectedDirectSellId) {
    const directSellId = orderId;
    if (!directSellId) return;
    const { data, error } = await supabase
      .from("direct_sell_payment_items" as never)
      .select(
        "id, direct_sell_order_id, amount_inr, utr_reference, proof_path, status, confirmation_deadline, confirmed_at, disputed_at, created_at",
      )
      .eq("direct_sell_order_id", directSellId as never)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Could not load payout items");
      return;
    }
    setOverview((current) => ({
      ...(current ?? {}),
      directSellPaymentItems: (data ?? []) as unknown as DirectSellPaymentItemRow[],
    }));
  }

  async function loadPaymentMethodsData(force = false) {
    if (dataLoadedRef.current.paymentMethods && !force) return;
    await runDatasetLoader("paymentMethods", async () => {
      const rows = ((await loadPaymentMethods()) ?? []) as PaymentMethodRow[];
      setPaymentMethods(rows);
      setSelectedPaymentMethodId(
        (current) => current || rows.find((row) => row.is_default)?.id || rows[0]?.id || "",
      );
      dataLoadedRef.current.paymentMethods = true;
    });
  }

  async function loadSecurityData(force = false) {
    if (dataLoadedRef.current.security && !force) return;
    await runDatasetLoader("security", async () => {
      const status = await loadWalletSecurityStatus();
      setTransactionPasswordEnabled(Boolean(status.transactionPasswordEnabled));
      setTransactionPasswordChangeOpen(false);
      dataLoadedRef.current.security = true;
    });
  }

  async function loadP2pData(launch = initData, force = false) {
    if (!launch || (dataLoadedRef.current.p2p && !force)) return;
    await runDatasetLoader("p2p", async () => {
      const p2p = await loadP2p({ data: { initData: launch } });
      setAds((p2p.marketplace ?? []) as AdRow[]);
      setOverview((current) => ({ ...(current ?? {}), orders: (p2p.orders ?? []) as OrderRow[] }));
      dataLoadedRef.current.p2p = true;
    });
  }

  async function loadVendorListingsData(force = false) {
    if (dataLoadedRef.current.vendorListings && !force) return;
    await runDatasetLoader("vendorListings", async () => {
      const vendorsResult = await loadVendors();
      setVendorListings((vendorsResult ?? []) as VendorListingRow[]);
      dataLoadedRef.current.vendorListings = true;
    });
  }

  async function loadVendorPortalData(force = false) {
    const isVendorApp = linkedAccountType === "vendor" && vendorStatus === "approved";
    if (!isVendorApp) {
      setVendorPaymentAccounts([]);
      setSelectedVendorPaymentAccountId("");
      dataLoadedRef.current.vendorPortal = false;
      return;
    }
    if (dataLoadedRef.current.vendorPortal && !force) return;
    await runDatasetLoader("vendorPortal", async () => {
      const portal = (await loadVendorPortal()) as unknown as {
        accounts?: VendorPaymentAccountRow[];
      };
      const vendorAccounts = portal.accounts ?? [];
      const activeVendorAccounts = vendorAccounts.filter(
        (account) =>
          account.status === "active" &&
          account.enabled !== false &&
          account.frozen !== true &&
          !account.archived_at,
      );
      setVendorPaymentAccounts(vendorAccounts);
      setSelectedVendorPaymentAccountId((current) => {
        if (current && activeVendorAccounts.some((row) => row.id === current)) return current;
        return (
          activeVendorAccounts.find((row) => row.is_default)?.id ||
          activeVendorAccounts[0]?.id ||
          ""
        );
      });
      dataLoadedRef.current.vendorPortal = true;
    });
  }

  async function loadAnalyticsData(force = false) {
    if (dataLoadedRef.current.analytics && !force) return;
    await runDatasetLoader("analytics", async () => {
      const analyticsResult = await loadAnalytics({ data: { range: "30d" } });
      setAnalytics(analyticsResult as AnalyticsSummary);
      dataLoadedRef.current.analytics = true;
    });
  }

  async function loadHistoryData(force = false) {
    if (dataLoadedRef.current.history && !force) return;
    await runDatasetLoader("history", async () => {
      const historyResult = await loadTradeHistory();
      setTradeHistory(historyResult as unknown[]);
      dataLoadedRef.current.history = true;
    });
  }

  async function loadReferralData(force = false) {
    if (dataLoadedRef.current.referral && !force) return;
    await runDatasetLoader("referral", async () => {
      const referralResult = await loadReferral();
      setReferral(referralResult as ReferralSummary);
      dataLoadedRef.current.referral = true;
    });
  }

  async function loadScreenData(nextScreen: MiniScreen, launch = initData, force = false) {
    const requests: Array<Promise<void>> = [];
    const primary = tabForScreen(nextScreen);
    if (primary === "wallet") requests.push(loadWalletData(launch, force));
    if (nextScreen === "platform-deposit" || nextScreen === "direct-sell-detail") {
      requests.push(loadDepositsData(launch, force));
    }
    if (nextScreen === "direct-sell-detail") {
      requests.push(loadDirectSellPaymentItemsData(force));
    }
    if (
      ["trade", "bank-accounts", "send", "profile", "security"].includes(nextScreen) ||
      primary === "p2p" ||
      nextScreen === "direct-sell-detail"
    ) {
      requests.push(loadPaymentMethodsData(force));
    }
    if (nextScreen === "send" || nextScreen === "security" || nextScreen === "wallet-backup") {
      requests.push(loadSecurityData(force));
    }
    if (primary === "p2p") requests.push(loadP2pData(launch, force));
    if (primary === "p2p") requests.push(loadP2pWalletAvailability(activeSellWallets));
    if (primary === "trade") requests.push(loadVendorListingsData(force));
    if (nextScreen === "bank-accounts" || linkedAccountType === "vendor") {
      requests.push(loadVendorPortalData(force));
    }
    if (nextScreen === "analytics") requests.push(loadAnalyticsData(force));
    if (nextScreen === "history") requests.push(loadHistoryData(force));
    if (nextScreen === "referral") requests.push(loadReferralData(force));
    await Promise.all(requests);
  }

  async function refreshRealtimeData(reasons: Set<"deposit" | "ledger" | "p2p">) {
    const currentScreen = screenRef.current;
    const requests: Array<Promise<void>> = [];
    if (reasons.has("deposit") || reasons.has("ledger") || reasons.has("p2p")) {
      requests.push(loadHomeData(initData, true));
    }
    if (
      reasons.has("deposit") &&
      ["platform-deposit", "direct-sell-detail"].includes(currentScreen)
    ) {
      requests.push(loadDepositsData(initData, true));
    }
    if (reasons.has("ledger") && tabForScreen(currentScreen) === "wallet") {
      requests.push(loadWalletData(initData, true));
    }
    if (
      reasons.has("p2p") &&
      (tabForScreen(currentScreen) === "p2p" || currentScreen === "orders")
    ) {
      requests.push(loadP2pData(initData, true));
    }
    await Promise.all(requests);
  }
  refreshRealtimeDataRef.current = refreshRealtimeData;

  async function refresh(
    nextScreen: MiniScreen = screen,
    launch = initData,
    handoff = handoffToken,
  ) {
    if (!launch) return;
    const blockingBootstrap = !launchChecked || !hasSession;
    if (blockingBootstrap) setLoading(true);
    try {
      const verified = await verifyLaunch({ data: { initData: launch } });
      setBootstrapError("");
      setLinked(Boolean(verified.linked));
      setLinkedAccountType((verified.accountType ?? null) as WtronAccountType | "admin" | null);
      setVendorStatus((verified.vendorStatus ?? null) as VendorApprovalStatus | null);
      if (verified.accountType === "trader" || verified.accountType === "vendor") {
        setAccountType(verified.accountType);
        setAuthMode("login");
      }
      const entryState = miniAppEntryState({
        linked: Boolean(verified.linked),
        accountType: (verified.accountType ?? null) as WtronAccountType | "admin" | null,
        vendorStatus: (verified.vendorStatus ?? null) as VendorApprovalStatus | null,
      });
      const safeNextScreen =
        entryState === "vendor_app" && nextScreen === "p2p" ? "trade" : nextScreen;
      if (safeNextScreen !== nextScreen) setScreen(safeNextScreen);
      if (entryState === "vendor_pending") {
        setHasSession(false);
        return;
      }
      if (verified.linked && (handoff || verified.authorized)) {
        const session = await createTelegramSession({
          data: { initData: launch, handoff: handoff || undefined },
        });
        await supabase.auth.setSession({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
        });
        if (handoff) {
          setHandoffToken("");
          clearHandoffFromUrl();
        }
        setHasSession(true);
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session && !verified.authorized) await supabase.auth.signOut();
        setHasSession(Boolean(sessionData.session && verified.authorized));
      }
      if (!verified.linked || !verified.authorized) return;
      await loadHomeData(launch, true);
      await loadScreenData(safeNextScreen, launch);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Telegram verification failed";
      console.info("[telegram-mini] secure launch diagnostics", {
        sdkInitialized: true,
        initDataPresent: Boolean(launch),
        initDataLength: launch.length,
        handoffPresent: Boolean(handoff),
        validationResult: "failed",
      });
      if (isMiniAppSessionError(message)) {
        setBootstrapError("Session expired");
        setLinked(false);
        setLinkedAccountType(null);
        setVendorStatus(null);
        setHasSession(false);
      } else {
        toast.error(message);
      }
    } finally {
      if (blockingBootstrap) setLoading(false);
    }
  }

  async function retryBootstrap() {
    setBootstrapError("");
    setLoading(true);
    const launch = await getTelegramLaunch();
    setInitData(launch.initData);
    setLaunchChecked(true);
    if (!launch.initData) {
      setLoading(false);
      return;
    }
    await refresh("home", launch.initData, handoffToken || search.handoff);
    setScreen("home");
  }

  async function logoutMiniAppSession() {
    if (!initData) {
      toast.error("Open WTRON from Telegram to close this Mini App session.");
      return;
    }
    setBusy(true);
    try {
      await logoutTelegram({ data: { initData } });
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      clearBrowserAuthState();
      setHasSession(false);
      setLinked(false);
      setLinkedAccountType(null);
      setVendorStatus(null);
      setOverview(null);
      setAds([]);
      setDeposits([]);
      setDepositAddress(null);
      setPaymentMethods([]);
      setVendorListings([]);
      setVendorPaymentAccounts([]);
      setAnalytics(null);
      setTradeHistory([]);
      setReferral(null);
      setWalletTransactions([]);
      setWalletResources(null);
      setGasfreeReadiness(null);
      setSelectedWalletId("");
      setSelectedDirectSellId("");
      setCreatedDirectSell(null);
      dataLoadedRef.current = {
        home: false,
        wallet: false,
        deposits: false,
        paymentMethods: false,
        security: false,
        p2p: false,
        vendorListings: false,
        vendorPortal: false,
        analytics: false,
        history: false,
        referral: false,
      };
      setScreen("home");
      toast.success("Logged out from Telegram Mini App.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not log out");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getTelegramLaunch().then((launch) => {
      if (cancelled) return;
      console.info("[telegram-mini] secure launch diagnostics", {
        sdkInitialized: launch.sdkPresent,
        initDataPresent: Boolean(launch.initData),
        initDataLength: launch.initData.length,
        handoffPresent: Boolean(search.handoff),
        validationResult: launch.initData ? "pending" : "missing_init_data",
      });
      setInitData(launch.initData);
      setLaunchChecked(true);
      void refresh((search.tab as MiniScreen) ?? "home", launch.initData, search.handoff);
      if (!launch.initData) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MINI_LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MINI_THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const visualViewport = window.visualViewport;
    const updateKeyboardState = () => {
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      setKeyboardOpen(window.innerHeight - viewportHeight > 120);
    };
    const scrollFocusedControl = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        window.setTimeout(() => {
          target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        }, 80);
      }
    };
    updateKeyboardState();
    visualViewport?.addEventListener("resize", updateKeyboardState);
    visualViewport?.addEventListener("scroll", updateKeyboardState);
    window.addEventListener("focusin", scrollFocusedControl);
    window.addEventListener("focusout", updateKeyboardState);
    return () => {
      visualViewport?.removeEventListener("resize", updateKeyboardState);
      visualViewport?.removeEventListener("scroll", updateKeyboardState);
      window.removeEventListener("focusin", scrollFocusedControl);
      window.removeEventListener("focusout", updateKeyboardState);
    };
  }, []);

  useEffect(() => {
    if (!initData || !linked) return;
    if (linkedAccountType === "vendor" && vendorStatus !== "approved") return;
    const renew = async () => {
      const { error } = await supabase.auth.refreshSession();
      if (!error) {
        setHasSession(true);
        return;
      }
      try {
        const session = await createTelegramSession({ data: { initData } });
        await supabase.auth.setSession({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
        });
        setHasSession(true);
        setBootstrapError("");
      } catch {
        setBootstrapError("Session expired");
      }
    };
    const timer = window.setInterval(() => void renew(), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [createTelegramSession, initData, linked, linkedAccountType, vendorStatus]);

  useEffect(() => {
    if (!linked || !initData) return;
    if (linkedAccountType === "vendor" && vendorStatus !== "approved") return;
    const refreshRealtime = refreshRealtimeDataRef;
    const realtimeReasons = realtimeRefreshReasonsRef;
    const realtimeTimer = realtimeRefreshTimerRef;
    const scheduleTargetedRealtimeRefresh = (reason: "deposit" | "ledger" | "p2p") => {
      realtimeReasons.current.add(reason);
      if (realtimeTimer.current) window.clearTimeout(realtimeTimer.current);
      realtimeTimer.current = window.setTimeout(() => {
        const reasons = new Set(realtimeReasons.current);
        realtimeReasons.current.clear();
        realtimeTimer.current = null;
        void refreshRealtime.current(reasons);
      }, 450);
    };
    const channel = supabase
      .channel(createMiniAppClientId("telegram-mini"))
      .on("postgres_changes", { event: "*", schema: "public", table: "deposit_requests" }, () =>
        scheduleTargetedRealtimeRefresh("deposit"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_entries" }, () =>
        scheduleTargetedRealtimeRefresh("ledger"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "p2p_orders" }, () =>
        scheduleTargetedRealtimeRefresh("p2p"),
      )
      .subscribe();
    return () => {
      if (realtimeTimer.current) window.clearTimeout(realtimeTimer.current);
      realtimeReasons.current.clear();
      realtimeTimer.current = null;
      void supabase.removeChannel(channel);
    };
  }, [linked, initData, linkedAccountType, vendorStatus]);

  useEffect(() => {
    if (!selectedWalletId && selectedWallet?.id) setSelectedWalletId(selectedWallet.id);
  }, [selectedWallet?.id, selectedWalletId]);

  useEffect(() => {
    if (tabForScreen(screen) !== "p2p") return;
    void loadP2pWalletAvailability(activeSellWallets);
  }, [screen, activeSellWallets.map((wallet) => wallet.id).join("|")]);

  useEffect(() => {
    if (screen !== "wallet-gasfree" || !selectedGasfreeWallet?.id) {
      setGasfreeReadiness(null);
      return;
    }
    void loadGasfreeReadiness({ data: { walletId: selectedGasfreeWallet.id } })
      .then((value) => setGasfreeReadiness(value as unknown as GasFreeReadiness))
      .catch(() =>
        setGasfreeReadiness({
          provider: "gasfree_open_api",
          status: "PROVIDER_ERROR",
          reason: t("gasfreeCheckFailedMessage"),
          network: selectedGasfreeWallet.network ?? "trc20-mainnet",
          asset: "USDT",
          configured: false,
          serviceProviderConfigured: false,
          apiKeyConfigured: false,
          apiSecretConfigured: false,
        }),
      );
  }, [loadGasfreeReadiness, screen, selectedGasfreeWallet?.id, selectedGasfreeWallet?.network, t]);

  useEffect(() => {
    if (screen !== "wallet-receive") {
      setWalletQr("");
      return;
    }
    if (!selectedAddress) {
      setWalletQr("");
      return;
    }
    const payload = `tron:${selectedAddress}?asset=${receiveAsset}&network=TRON`;
    void qrToDataUrl(payload).then(setWalletQr);
  }, [screen, selectedAddress, receiveAsset]);

  useEffect(() => {
    if (screen !== "platform-deposit") {
      setDepositQr("");
      return;
    }
    const address = safeAddress(depositAddress?.address);
    if (!address) {
      setDepositQr("");
      return;
    }
    const amount = (latestDeposit?.expected_amount ?? depositAmount) || "";
    const payload = `tron:${address}?amount=${encodeURIComponent(String(amount))}&token=USDT_TRC20&network=TRON`;
    void qrToDataUrl(payload).then(setDepositQr);
  }, [screen, depositAddress?.address, latestDeposit?.expected_amount, depositAmount]);

  useEffect(() => {
    if (screen !== "direct-sell-detail") {
      setDirectSellQr("");
      return;
    }
    const address = safeAddress(selectedDirectSell?.assigned_company_address);
    if (!address) {
      setDirectSellQr("");
      return;
    }
    const amount = Number(selectedDirectSell?.expected_usdt ?? 0);
    const payload =
      amount > 0
        ? `tron:${address}?amount=${encodeURIComponent(String(amount))}&token=USDT_TRC20&network=TRON`
        : `tron:${address}?token=USDT_TRC20&network=TRON`;
    void qrToDataUrl(payload).then(setDirectSellQr);
  }, [screen, selectedDirectSell?.assigned_company_address, selectedDirectSell?.expected_usdt]);

  useEffect(() => {
    if (screen !== "direct-sell-detail" || !selectedDirectSellId) return;
    void loadDirectSellPaymentItemsData(true, selectedDirectSellId);
  }, [screen, selectedDirectSellId]);

  async function loadSelectedWalletTransactions(walletId: string, reset = false) {
    const pageSize = 50;
    const offset = reset ? 0 : walletTransactions.length;
    const { data, error } = await supabase
      .from("wallet_transactions" as never)
      .select(
        "id, wallet_id, direction, kind, currency, amount, fee, network, txid, status, memo, counterparty_address, created_at",
      )
      .eq("wallet_id", walletId as never)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      toast.error(t("unableLoadWalletHistory"));
      if (reset) setWalletTransactions([]);
      setWalletTransactionHasMore(false);
      return;
    }

    const rows = (data ?? []) as unknown as TransactionRow[];
    setWalletTransactions((current) => {
      const merged = reset ? rows : [...current, ...rows];
      const seen = new Set<string>();
      return merged.filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
    });
    setWalletTransactionHasMore(rows.length === pageSize);
  }

  useEffect(() => {
    const needsWalletHistory = [
      "wallet",
      "wallet-detail",
      "wallet-history",
      "wallet-asset-detail",
      "wallet-transaction-detail",
    ].includes(screen);
    if (!selectedWallet?.id || !hasSession || !needsWalletHistory) {
      setWalletTransactions([]);
      setWalletTransactionHasMore(false);
      return;
    }
    if (screen === "wallet-gasfree" && selectedGasfreeWallet?.id) return;
    setSelectedWalletTransactionId("");
    void loadSelectedWalletTransactions(selectedWallet.id, true);
  }, [screen, selectedWallet?.id, selectedGasfreeWallet?.id, hasSession]);

  useEffect(() => {
    if (screen !== "wallet-gasfree" || !selectedGasfreeWallet?.id || !hasSession) return;
    setSelectedWalletTransactionId("");
    void loadSelectedWalletTransactions(selectedGasfreeWallet.id, true);
  }, [screen, selectedGasfreeWallet?.id, hasSession]);

  useEffect(() => {
    const walletIdForRefresh =
      screen === "wallet-gasfree" ? selectedGasfreeWallet?.id : selectedWallet?.id;
    if (
      !["wallet", "wallet-detail", "wallet-gasfree"].includes(screen) ||
      !walletIdForRefresh ||
      !hasSession
    )
      return;
    void refreshBalance({ data: { walletId: walletIdForRefresh } }).then(
      (result) => {
        const snapshot = result as {
          resources?: WalletResourceSnapshot | null;
          checkedAt?: string;
        };
        setWalletResources(snapshot.resources ?? null);
        setWalletResourcesCheckedAt(snapshot.checkedAt ?? new Date().toISOString());
        void loadWalletData(initData, true);
        void loadHomeData(initData, true);
      },
      () => undefined,
    );
  }, [screen, selectedWallet?.id, selectedGasfreeWallet?.id, hasSession]);

  useEffect(() => {
    const webApp =
      typeof window !== "undefined" ? (window as TelegramWindow).Telegram?.WebApp : undefined;
    const backable = !["home", "p2p", "trade", "wallet", "more"].includes(screen);
    if (!webApp?.BackButton) return;
    const handler = () => setScreen(backScreenFor(screen, transactionBackScreen));
    if (backable) webApp.BackButton.show();
    else webApp.BackButton.hide();
    webApp.BackButton.onClick(handler);
    return () => webApp.BackButton?.offClick(handler);
  }, [screen, transactionBackScreen]);

  async function navigate(next: MiniScreen) {
    if (entryState === "vendor_app" && next === "p2p") {
      next = "trade";
    }
    setRevealedPhrase("");
    if (screen === "wallet-import" && next !== "wallet-import") setImportPhrase("");
    setScreen(next);
    await loadScreenData(next);
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    if (!initData) {
      toast.error("Open this page from Telegram to link your account");
      return;
    }
    if (authMode === "register" && password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      setAuthNotice("");
      const authResult =
        authMode === "login"
          ? await loginTelegram({ data: { initData, email, password, accountType } })
          : await registerTelegram({
              data: {
                initData,
                email,
                password,
                accountType,
                businessName:
                  accountType === "vendor" ? email.split("@")[0] || "WTRON Vendor" : undefined,
              },
            });
      const resolvedAccountType =
        (authResult.accountType as WtronAccountType | "admin" | null | undefined) ?? accountType;
      const resolvedVendorStatus =
        (authResult.vendorStatus as VendorApprovalStatus | null | undefined) ??
        (resolvedAccountType === "vendor" ? "pending" : null);
      setLinked(true);
      setLinkedAccountType(resolvedAccountType);
      setVendorStatus(resolvedVendorStatus);
      if (authMode === "register") {
        setPassword("");
        setConfirmPassword("");
        setHasSession(false);
        setScreen("home");
        if (resolvedAccountType === "vendor") {
          setAuthNotice("");
          toast.success("Vendor application submitted");
          await refresh("home");
          return;
        }
        setAuthMode("login");
        setAuthNotice("Trader registration successful. Please login.");
        toast.success("Trader registration successful. Please login.");
        return;
      }
      if (resolvedAccountType === "vendor" && resolvedVendorStatus !== "approved") {
        setHasSession(false);
        setScreen("home");
        toast.success("Vendor approval required");
        await refresh("home");
        return;
      }
      const session = await createTelegramSession({ data: { initData } });
      await supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      setHasSession(true);
      setScreen("home");
      toast.success("Telegram account linked");
      await refresh("home");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not authenticate");
    } finally {
      setBusy(false);
    }
  }

  async function submitDeposit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid USDT amount");
      return;
    }
    setBusy(true);
    try {
      const created = await createDeposit({ data: { initData, amount } });
      toast.success(`Deposit request ${created.order_ref ?? created.id} created`);
      setDepositAmount("");
      const depositData = await loadDeposits({ data: { initData } });
      setDeposits((depositData.deposits ?? []) as DepositRow[]);
      setDepositAddress(
        depositData.depositAddress as { address?: string; network?: string } | null,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create deposit request");
    } finally {
      setBusy(false);
    }
  }

  async function submitDirectSell(event: FormEvent) {
    event.preventDefault();
    const amount = Number(directSellAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid USDT amount");
      return;
    }
    if (linkedAccountType === "vendor" && !selectedActiveVendorPayout?.id) {
      toast.error("Add an active vendor payout account first");
      return;
    }
    if (linkedAccountType !== "vendor" && !selectedActivePayout?.id) {
      toast.error("Add payout method first");
      return;
    }
    setBusy(true);
    try {
      const traderPayout = selectedActivePayout;
      const order =
        linkedAccountType === "vendor"
          ? await createVendorDirectSell({
              data: { amount, vendorPaymentAccountId: selectedActiveVendorPayout!.id },
            })
          : await createDirectSell({
              data: { amount, paymentMethodId: traderPayout!.id },
            });
      toast.success(`WTRON sell order ${order.order_ref ?? order.order_id} created`);
      const created = { ...order, amount_usdt: amount } as DirectSellOrderCreated;
      setCreatedDirectSell(created);
      setSelectedDirectSellId(created.order_id);
      setDirectSellAmount("");
      setScreen("direct-sell-detail");
      await loadHomeData(initData, true);
      await loadScreenData("direct-sell-detail", initData, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create sell order");
    } finally {
      setBusy(false);
    }
  }

  async function takeAd(ad: AdRow) {
    const amount = Number(p2pAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid USDT amount");
      return;
    }
    const sellingToBuyAd = ad.side === "buy";
    if (sellingToBuyAd && !selectedActiveUpi?.id) {
      toast.error("Add UPI ID first");
      return;
    }
    if (sellingToBuyAd && !selectedSellAdWallet?.id) {
      toast.error("Select a funded personal wallet to sell USDT");
      return;
    }
    setBusy(true);
    try {
      await takeP2pAd({
        data: {
          adId: ad.id,
          amountUsdt: amount,
          paymentMethodId: sellingToBuyAd ? selectedActiveUpi?.id : defaultPaymentMethod?.id,
          sourceWalletId: sellingToBuyAd ? selectedSellAdWallet?.id : undefined,
        },
      });
      toast.success("P2P order created");
      setP2pAmount("");
      setScreen("orders");
      await loadHomeData(initData, true);
      await loadP2pData(initData, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create P2P order");
    } finally {
      setBusy(false);
    }
  }

  async function submitSellAd(event: FormEvent) {
    event.preventDefault();
    const amount = Number(sellAd.amount);
    const rate = Number(sellAd.rate);
    const min = Number(sellAd.min);
    const max = Number(sellAd.max);
    if (![amount, rate, min, max].every((value) => Number.isFinite(value) && value > 0)) {
      toast.error("Complete the sell ad values");
      return;
    }
    if (!selectedActiveUpi?.id) {
      toast.error("Add UPI ID first");
      return;
    }
    if (!selectedSellAdWallet?.id) {
      toast.error("Select a funded personal wallet for this sell ad");
      return;
    }
    setBusy(true);
    try {
      await createSellAd({
        data: {
          side: "sell",
          availableUsdt: amount,
          price: rate,
          minOrderInr: min,
          maxOrderInr: max,
          paymentMethods: ["upi"],
          paymentMethodId: selectedActiveUpi.id,
          sourceWalletId: selectedSellAdWallet.id,
          terms: sellAd.terms || undefined,
          isActive: true,
        },
      });
      setSellAd({ amount: "", rate: "", min: "", max: "", terms: "" });
      toast.success("P2P sell ad created");
      await loadP2pData(initData, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create sell ad");
    } finally {
      setBusy(false);
    }
  }

  async function submitVendorBuy(listing: VendorListingRow) {
    const amount = Number(vendorAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid USDT amount");
      return;
    }
    if (!listing.payment_rails.includes(vendorRail)) {
      toast.error("Selected payment rail is unavailable for this vendor");
      return;
    }
    setBusy(true);
    try {
      await reserveVendor({
        data: { listingId: listing.id, amountUsdt: amount, rail: vendorRail },
      });
      setVendorAmount("");
      toast.success("Vendor order reserved. Continue from Orders.");
      setScreen("orders");
      await loadHomeData(initData, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reserve vendor order");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDirectSellPayment(itemId: string) {
    setBusy(true);
    try {
      await confirmDirectSellItem({ data: { itemId } });
      toast.success("Payment confirmed");
      await loadHomeData(initData, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not confirm payment");
    } finally {
      setBusy(false);
    }
  }

  async function disputeDirectSellPayment(itemId: string) {
    const reason = window.prompt("Dispute reason");
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      await disputeDirectSellItem({ data: { itemId, reason: reason.trim() } });
      toast.success("Payment disputed");
      await loadHomeData(initData, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not dispute payment");
    } finally {
      setBusy(false);
    }
  }

  async function saveTransactionPassword(event: FormEvent) {
    event.preventDefault();
    if (walletPassword !== walletPasswordConfirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (transactionPasswordEnabled && !walletCurrentPassword) {
      toast.error("Current transaction password is required");
      return;
    }
    setBusy(true);
    try {
      await setMiniTransactionPassword({
        data: {
          password: walletPassword,
          ...(transactionPasswordEnabled ? { currentPassword: walletCurrentPassword } : {}),
        },
      });
      setTransactionPasswordEnabled(true);
      setTransactionPasswordChangeOpen(false);
      setWalletCurrentPassword("");
      setWalletPassword("");
      setWalletPasswordConfirm("");
      toast.success("Transaction password saved");
    } catch (error) {
      toast.error(friendlyMiniError(error, "Could not save password"));
    } finally {
      setBusy(false);
    }
  }

  async function submitCreateWallet(event: FormEvent) {
    event.preventDefault();
    if (walletPassword !== walletPasswordConfirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const created = await createPersonalWallet({
        data: {
          name: createWalletName,
          network: "trc20-mainnet",
          walletType: "standard",
          makeDefault: wallets.length === 0,
          transactionPassword: walletPassword,
        },
      });
      const walletId = (created as { wallet?: { id?: string } }).wallet?.id;
      if (walletId) setSelectedWalletId(walletId);
      setWalletPassword("");
      setWalletPasswordConfirm("");
      toast.success("Wallet created successfully");
      await loadWalletData(initData, true);
      setScreen("wallet-detail");
    } catch (error) {
      toast.error(friendlyMiniError(error, "Could not create wallet"));
    } finally {
      setBusy(false);
    }
  }

  async function submitImportWallet(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const imported = await importPersonalWallet({
        data: {
          name: createWalletName,
          network: "trc20-mainnet",
          walletType: "standard",
          makeDefault: wallets.length === 0,
          transactionPassword: walletPassword,
          mnemonic: importPhrase,
          networkConfirmed: true,
        },
      });
      const walletId = (imported as { wallet?: { id?: string } }).wallet?.id;
      if (walletId) setSelectedWalletId(walletId);
      setImportPhrase("");
      setWalletPassword("");
      const importResult = imported as { existing?: boolean; message?: string };
      toast.success(
        importResult.existing
          ? (importResult.message ?? "This wallet is already in your WTRON account.")
          : "Wallet imported",
      );
      await loadWalletData(initData, true);
      setScreen("wallet-detail");
    } catch (error) {
      toast.error(friendlyMiniError(error, "Could not import wallet"));
    } finally {
      setBusy(false);
    }
  }

  async function scanImportRecoveryPhrase() {
    try {
      const phrase = await scanRecoveryPhraseQr();
      setImportPhrase(phrase);
      toast.success("Recovery phrase added");
    } catch (error) {
      const message =
        error instanceof QrScanError && error.code === "invalid"
          ? "QR code does not contain a valid recovery phrase."
          : qrScanErrorMessage(error);
      if (!(error instanceof QrScanError) || error.code !== "cancelled") toast.error(message);
    }
  }

  async function activateWallet(wallet: WalletRow) {
    if (!wallet.id) return;
    setSelectedWalletId(wallet.id);
    setWalletResources(null);
    setWalletResourcesCheckedAt("");
    try {
      await setMiniDefaultWallet({ data: { walletId: wallet.id } });
      await loadWalletData(initData, true);
      toast.success("Active wallet changed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not switch wallet");
    }
  }

  async function refreshSelectedWalletBalance() {
    if (!selectedWallet?.id) return;
    setBusy(true);
    try {
      const result = (await refreshBalance({
        data: { walletId: selectedWallet.id, forceGasfreeCheck: true },
      })) as {
        resources?: WalletResourceSnapshot | null;
        checkedAt?: string;
      };
      setWalletResources(result.resources ?? null);
      setWalletResourcesCheckedAt(result.checkedAt ?? new Date().toISOString());
      await loadWalletData(initData, true);
      await loadSelectedWalletTransactions(selectedWallet.id, true);
      toast.success(t("walletSyncCompleted"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh balance");
    } finally {
      setBusy(false);
    }
  }

  async function checkSelectedWalletGasfree() {
    if (!selectedWallet?.id) return;
    setBusy(true);
    try {
      const result = (await checkGasfreeCapability({ data: { walletId: selectedWallet.id } })) as {
        status?: string;
      };
      if (selectedGasfreeWallet?.id) {
        const snapshot = (await refreshBalance({
          data: { walletId: selectedGasfreeWallet.id, forceGasfreeCheck: false },
        })) as {
          resources?: WalletResourceSnapshot | null;
          checkedAt?: string;
        };
        setWalletResources(snapshot.resources ?? null);
        setWalletResourcesCheckedAt(snapshot.checkedAt ?? new Date().toISOString());
        await loadSelectedWalletTransactions(selectedGasfreeWallet.id, true);
      }
      await loadWalletData(initData, true);
      toast.success(result.status === "check_failed" ? t("checkFailed") : t("walletSyncCompleted"));
    } catch (error) {
      toast.error(friendlyMiniError(error, t("checkFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function discoverSelectedWalletGasfree() {
    if (!selectedWallet?.id) return;
    setBusy(true);
    try {
      const result = (await discoverGasfreeWallet({ data: { walletId: selectedWallet.id } })) as {
        wallet?: { id?: string };
      };
      const gasfreeId = result.wallet?.id ?? selectedGasfreeWallet?.id;
      if (gasfreeId) {
        await refreshBalance({ data: { walletId: gasfreeId, forceGasfreeCheck: false } });
        await loadSelectedWalletTransactions(gasfreeId, true);
      }
      await loadWalletData(initData, true);
      toast.success(t("gasfreeWalletDiscovered"));
    } catch (error) {
      toast.error(friendlyMiniError(error, t("gasfreeDiscoveryFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function openGasfreeSend() {
    if (!selectedGasfreeWallet?.id) {
      toast.error(t("gasfreeTransferSetupRequired"));
      return;
    }
    setSendMode("gasfree");
    setSendAsset("USDT");
    setGasfreeSendPassword("");
    setGasfreeTransferResult(null);
    setGasfreeSubmitState("preparing");
    setGasfreeSendIdempotencyKey(createMiniAppClientId("gasfree-send"));
    setSelectedWalletId(selectedGasfreeWallet.id);
    setScreen("send");
    try {
      const readiness = await loadGasfreeReadiness({
        data: { walletId: selectedGasfreeWallet.id },
      });
      setGasfreeReadiness(readiness as unknown as GasFreeReadiness);
      setGasfreeSubmitState("awaiting_password");
    } catch (error) {
      setGasfreeSubmitState("failed");
      toast.error(friendlyMiniError(error, t("gasfreeCheckFailedMessage")));
    }
  }

  async function submitStandardSend(event: FormEvent) {
    event.preventDefault();
    if (!selectedWallet?.id) {
      toast.error(t("noWalletSelected"));
      return;
    }
    const recipient = sendAddress.trim();
    const amount = Number(sendAmount);
    if (!isTronAddress(recipient)) {
      toast.error(t("recipientAddressPlaceholder"));
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!standardTransferPreview) {
      toast.error(standardTransferPreviewError || "Send preview is not ready");
      return;
    }
    if (
      !standardTransferPreview.signingEnabled ||
      !standardTransferPreview.mainnetSigningEnabled ||
      !standardTransferPreview.signerReady ||
      !standardTransferPreview.transactionPasswordConfigured ||
      standardTransferPreview.transactionPasswordLocked ||
      standardTransferPreview.blocked
    ) {
      toast.error(standardTransferPreview.blockCode || t("sendUnavailable"));
      return;
    }
    if (!standardTransferPassword) {
      toast.error(t("transactionPassword"));
      return;
    }
    if (busy || standardTransferSubmitState === "submitting") return;
    setBusy(true);
    setStandardTransferSubmitState("submitting");
    setStandardTransferResult(null);
    try {
      const result = (await submitStandardTransfer({
        data: {
          walletId: selectedWallet.id,
          asset: sendAsset,
          toAddress: recipient,
          amount,
          transactionPassword: standardTransferPassword,
          idempotencyKey: standardTransferIdempotencyKey,
        },
      })) as unknown as Record<string, unknown>;
      setStandardTransferResult(result);
      setStandardTransferSubmitState("submitted");
      setStandardTransferPassword("");
      setStandardTransferIdempotencyKey(createMiniAppClientId("standard-send"));
      await refreshBalance({ data: { walletId: selectedWallet.id, forceGasfreeCheck: false } });
      await loadSelectedWalletTransactions(selectedWallet.id, true);
      await loadWalletData(initData, true);
      toast.success("Transfer submitted");
    } catch (error) {
      const message = friendlyMiniError(error, "Could not submit transfer");
      setStandardTransferResult({
        id: standardTransferIdempotencyKey,
        status: "FAILED",
        asset: sendAsset,
        amount,
        from_address: selectedWallet.address,
        to_address: recipient,
        safe_failure_message: message,
        txid: null,
      });
      setStandardTransferSubmitState("failed");
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function submitGasfreeSend(event: FormEvent) {
    event.preventDefault();
    if (!selectedGasfreeWallet?.id) {
      toast.error(t("gasfreeTransferSetupRequired"));
      return;
    }
    const recipient = sendAddress.trim();
    const amount = Number(sendAmount);
    if (!isTronAddress(recipient)) {
      toast.error(t("recipientAddressPlaceholder"));
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid USDT amount");
      return;
    }
    if (!gasfreeSendPassword) {
      toast.error(t("transactionPassword"));
      return;
    }
    if (busy || gasfreeSubmitState === "submitting") return;
    setBusy(true);
    setGasfreeSubmitState("submitting");
    setGasfreeTransferResult(null);
    try {
      const result = (await submitGasfreeTransfer({
        data: {
          walletId: selectedGasfreeWallet.id,
          recipient,
          amount,
          transactionPassword: gasfreeSendPassword,
          idempotencyKey: gasfreeSendIdempotencyKey,
        },
      })) as unknown as GasFreeTransferResult;
      setGasfreeTransferResult(result);
      if (result.ok === false) {
        setGasfreeSubmitState("failed");
        toast.error(result.message ?? "GasFree transfer was not submitted");
        return;
      }
      const providerStatus = result.submitted?.state ?? result.request?.status ?? result.status;
      const txid = result.submitted?.txId ?? result.submitted?.txid ?? result.request?.txid;
      setGasfreeSubmitState(isConfirmedTransferStatus(providerStatus) ? "confirmed" : "pending");
      setGasfreeSendPassword("");
      setGasfreeSendIdempotencyKey(createMiniAppClientId("gasfree-send"));
      await refreshBalance({
        data: { walletId: selectedGasfreeWallet.id, forceGasfreeCheck: true },
      });
      await loadSelectedWalletTransactions(selectedGasfreeWallet.id, true);
      const readiness = await loadGasfreeReadiness({
        data: { walletId: selectedGasfreeWallet.id },
      });
      setGasfreeReadiness(readiness as unknown as GasFreeReadiness);
      await loadWalletData(initData, true);
      toast.success(txid ? "GasFree transfer confirmed" : "GasFree provider accepted the transfer");
    } catch (error) {
      setGasfreeSubmitState("failed");
      toast.error(friendlyMiniError(error, "Could not submit GasFree transfer"));
    } finally {
      setBusy(false);
    }
  }

  function parseVendorAccountLimits() {
    const minInr = Number(vendorAccountLimits.minInr);
    const maxInr = Number(vendorAccountLimits.maxInr);
    const dailyLimitInr = Number(vendorAccountLimits.dailyLimitInr);
    if (![minInr, maxInr, dailyLimitInr].every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error("Enter valid vendor account limits");
    }
    return { minInr, maxInr, dailyLimitInr };
  }

  async function revealBackupPhrase(event: FormEvent) {
    event.preventDefault();
    if (!selectedWallet?.id) return;
    setBusy(true);
    try {
      const result = await revealPhrase({
        data: { walletId: selectedWallet.id, transactionPassword: backupPassword },
      });
      setRevealedPhrase((result as { recoveryPhrase?: string }).recoveryPhrase ?? "");
      setBackupPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reveal phrase");
    } finally {
      setBusy(false);
    }
  }

  async function submitUpi(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (linkedAccountType === "vendor") {
        await saveVendorPayout({
          data: {
            rail: "upi",
            label: upiForm.label || "Vendor UPI",
            holderName: upiForm.holderName,
            accountRef: upiForm.upiId,
            ...parseVendorAccountLimits(),
            priority: 100,
            isDefault: vendorPaymentAccounts.length === 0,
            enabled: true,
            frozen: false,
          },
        });
      } else {
        await saveUpi({ data: { ...upiForm, isDefault: paymentMethods.length === 0 } });
      }
      setUpiForm({ upiId: "", holderName: "", label: "" });
      toast.success("UPI added");
      await loadPaymentMethodsData(true);
      await loadVendorPortalData(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save UPI");
    } finally {
      setBusy(false);
    }
  }

  async function submitBank(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (linkedAccountType === "vendor") {
        const supportedRails =
          vendorBankRail === "all" ? (["imps", "neft", "rtgs"] as const) : [vendorBankRail];
        const normalizedRail = supportedRails[0];
        await saveVendorPayout({
          data: {
            rail: normalizedRail,
            supportedRails: [...supportedRails],
            label: bankForm.label || bankForm.bankName || "Vendor Bank",
            holderName: bankForm.accountHolder,
            accountRef: bankForm.accountNumber,
            bankName: bankForm.bankName,
            accountNumber: bankForm.accountNumber,
            ifsc: bankForm.ifsc,
            ...parseVendorAccountLimits(),
            priority: 100,
            isDefault: vendorPaymentAccounts.length === 0,
            enabled: true,
            frozen: false,
          },
        });
      } else {
        await saveBank({
          data: {
            ...bankForm,
            supportedRails: ["IMPS", "NEFT", "RTGS"],
            isDefault: paymentMethods.length === 0,
          },
        });
      }
      setBankForm({ accountHolder: "", accountNumber: "", ifsc: "", bankName: "", label: "" });
      toast.success("Bank account added");
      await loadPaymentMethodsData(true);
      await loadVendorPortalData(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save bank account");
    } finally {
      setBusy(false);
    }
  }

  async function markNotificationRead(id?: string) {
    const update = supabase
      .from("notifications" as never)
      .update({ read_at: new Date().toISOString() } as never);
    const result = id
      ? await update.eq("id", id as never)
      : await update.is("read_at", null as never);
    if (result.error) toast.error(result.error.message);
    else {
      toast.success(id ? "Notification marked read" : "All notifications marked read");
      await loadHomeData(initData, true);
    }
  }

  if (loading || !launchChecked) {
    return (
      <MiniFrame locale={locale} theme={appliedTheme}>
        <div className="grid min-h-[70vh] place-items-center text-center">
          <div>
            <WtronMark className="mx-auto h-14 w-14" />
            <Loader2 className="mx-auto mt-5 h-6 w-6 animate-spin text-primary" />
            <p className="mt-4 text-sm text-slate-400">Connecting securely to WTRON</p>
          </div>
        </div>
      </MiniFrame>
    );
  }

  if (!initData) {
    return (
      <MiniFrame locale={locale} theme={appliedTheme}>
        <EmptyState
          icon={ShieldCheck}
          title="Open WTRON through @wtron_bot"
          body="Telegram launch data is required for secure account linking."
          action={
            <a
              className="mt-5 inline-flex rounded-xl bg-primary text-white hover:bg-primary/90 px-4 py-2 text-sm font-semibold"
              href="https://t.me/wtron_bot"
            >
              Open Bot
            </a>
          }
        />
      </MiniFrame>
    );
  }

  if (bootstrapError) {
    return (
      <MiniFrame locale={locale} theme={appliedTheme}>
        <EmptyState
          icon={ShieldCheck}
          title="Session expired"
          body="Reconnect securely with Telegram to continue."
          action={
            <Button className="mt-5" onClick={() => void retryBootstrap()}>
              Reconnect securely
            </Button>
          }
        />
      </MiniFrame>
    );
  }

  if (!linked || !hasSession) {
    return (
      <MiniFrame locale={locale} theme={appliedTheme}>
        <AuthScreen
          authMode={authMode}
          setAuthMode={setAuthMode}
          accountType={accountType}
          setAccountType={setAccountType}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          confirmPassword={confirmPassword}
          setConfirmPassword={setConfirmPassword}
          busy={busy}
          notice={authNotice}
          onSubmit={submitAuth}
        />
      </MiniFrame>
    );
  }

  const entryState = miniAppEntryState({
    linked,
    accountType: linkedAccountType,
    vendorStatus,
  });

  if (entryState === "vendor_pending") {
    return (
      <MiniFrame locale={locale} theme={appliedTheme}>
        <PendingVendorScreen
          status={vendorStatus ?? "pending"}
          onRefresh={() => void refresh("home")}
          busy={loading || busy}
        />
      </MiniFrame>
    );
  }

  return (
    <MiniFrame locale={locale} theme={appliedTheme}>
      <div className="space-y-5 pb-28">
        <MiniHeader
          profile={profile}
          avatarUrl={avatarUrl}
          locale={locale}
          setLocale={setLocale}
          t={t}
          screen={screen}
          showInAppBack={
            typeof window !== "undefined" &&
            !(window as TelegramWindow).Telegram?.WebApp?.BackButton &&
            !["home", "p2p", "trade", "wallet", "more"].includes(screen)
          }
          onBack={() => setScreen(backScreenFor(screen, transactionBackScreen))}
          onNotifications={() => void navigate("notifications")}
          onProfile={() => void navigate("profile")}
        />
        <Suspense fallback={<V17LoadingState />}>
          {screen === "home" ? (
            <HomeScreen
              vendorMode={entryState === "vendor_app"}
              total={totalAssets}
              profile={profile}
              orders={overview?.activeOrders ?? []}
              transactions={overview?.transactions ?? []}
              ads={ads}
              wallet={selectedWallet}
              t={t}
              onNavigate={navigate}
            />
          ) : null}
          {screen === "wallet" ? (
            <WalletScreen
              wallets={wallets}
              selectedWallet={selectedWallet}
              t={t}
              onNavigate={navigate}
              onSelect={(wallet) => void activateWallet(wallet)}
            />
          ) : null}
          {screen === "wallet-create" ? (
            <WalletCreateScreen
              name={createWalletName}
              setName={setCreateWalletName}
              password={walletPassword}
              setPassword={setWalletPassword}
              confirm={walletPasswordConfirm}
              setConfirm={setWalletPasswordConfirm}
              busy={busy}
              t={t}
              onSubmit={submitCreateWallet}
            />
          ) : null}
          {screen === "wallet-import" ? (
            <WalletImportScreen
              name={createWalletName}
              setName={setCreateWalletName}
              phrase={importPhrase}
              setPhrase={setImportPhrase}
              password={walletPassword}
              setPassword={setWalletPassword}
              busy={busy}
              t={t}
              onSubmit={submitImportWallet}
              onScanPhrase={() => void scanImportRecoveryPhrase()}
            />
          ) : null}
          {screen === "wallet" && wallets.length ? (
            <WalletDetailScreen
              vendorMode={entryState === "vendor_app"}
              wallet={selectedWallet}
              gasfreeWallet={selectedGasfreeWallet ?? null}
              wallets={wallets}
              transactions={walletTransactions}
              resources={walletResources}
              resourcesCheckedAt={walletResourcesCheckedAt}
              busy={busy}
              t={t}
              onNavigate={navigate}
              onSelectWallet={(wallet) => void activateWallet(wallet)}
              onCreateWallet={() => void navigate("wallet-create")}
              onImportWallet={() => void navigate("wallet-import")}
              onManageWallets={() => void navigate("wallet-more")}
              onSelectAsset={(asset) => {
                setSelectedWalletAsset(asset);
                void navigate("wallet-asset-detail");
              }}
              onSelectTransaction={(transaction, backTo = "wallet") => {
                setSelectedWalletTransactionId(transaction.id);
                setTransactionBackScreen(backTo);
                void navigate("wallet-transaction-detail");
              }}
              onRefresh={() => void refreshSelectedWalletBalance()}
              onSetDefault={() => selectedWallet && void activateWallet(selectedWallet)}
            />
          ) : null}
          {screen === "wallet-detail" ? (
            <WalletDetailScreen
              vendorMode={entryState === "vendor_app"}
              wallet={selectedWallet}
              gasfreeWallet={selectedGasfreeWallet ?? null}
              wallets={wallets}
              transactions={walletTransactions}
              resources={walletResources}
              resourcesCheckedAt={walletResourcesCheckedAt}
              busy={busy}
              t={t}
              onNavigate={navigate}
              onSelectWallet={(wallet) => void activateWallet(wallet)}
              onCreateWallet={() => void navigate("wallet-create")}
              onImportWallet={() => void navigate("wallet-import")}
              onManageWallets={() => void navigate("wallet-more")}
              onSelectAsset={(asset) => {
                setSelectedWalletAsset(asset);
                void navigate("wallet-asset-detail");
              }}
              onSelectTransaction={(transaction, backTo = "wallet-detail") => {
                setSelectedWalletTransactionId(transaction.id);
                setTransactionBackScreen(backTo);
                void navigate("wallet-transaction-detail");
              }}
              onRefresh={() => void refreshSelectedWalletBalance()}
              onSetDefault={() => selectedWallet && void activateWallet(selectedWallet)}
            />
          ) : null}
          {screen === "wallet-history" ? (
            <WalletHistoryScreen
              wallet={selectedWallet}
              rows={walletTransactions}
              assetFilter={walletHistoryAsset}
              setAssetFilter={setWalletHistoryAsset}
              directionFilter={walletHistoryDirection}
              setDirectionFilter={setWalletHistoryDirection}
              hasMore={walletTransactionHasMore}
              busy={busy}
              t={t}
              onLoadMore={() =>
                selectedWallet?.id && void loadSelectedWalletTransactions(selectedWallet.id)
              }
              onSelectTransaction={(transaction) => {
                setSelectedWalletTransactionId(transaction.id);
                setTransactionBackScreen("wallet-history");
                void navigate("wallet-transaction-detail");
              }}
            />
          ) : null}
          {screen === "wallet-asset-detail" ? (
            <WalletAssetDetailScreen
              wallet={selectedWallet}
              asset={selectedWalletAsset}
              rows={walletTransactions}
              t={t}
              onSend={() => {
                setSendMode("standard");
                setSendAsset(selectedWalletAsset);
                setStandardTransferPassword("");
                setStandardTransferPreview(null);
                setStandardTransferPreviewError("");
                setStandardTransferResult(null);
                setStandardTransferSubmitState("idle");
                setStandardTransferIdempotencyKey(createMiniAppClientId("standard-send"));
                void navigate("send");
              }}
              onReceive={() => {
                setReceiveAsset(selectedWalletAsset);
                void navigate("wallet-receive");
              }}
              onSelectTransaction={(transaction) => {
                setSelectedWalletTransactionId(transaction.id);
                setTransactionBackScreen("wallet-asset-detail");
                void navigate("wallet-transaction-detail");
              }}
            />
          ) : null}
          {screen === "wallet-transaction-detail" ? (
            <WalletTransactionDetailScreen
              wallet={selectedWallet}
              transaction={selectedWalletTransaction}
              t={t}
            />
          ) : null}
          {screen === "wallet-receive" ? (
            <ReceiveScreen
              wallet={selectedWallet}
              asset={receiveAsset}
              setAsset={setReceiveAsset}
              qr={walletQr}
              t={t}
            />
          ) : null}
          {screen === "wallet-more" ? (
            <WalletMoreScreen
              wallet={selectedWallet}
              onNavigate={navigate}
              onSetDefault={() => selectedWallet && void activateWallet(selectedWallet)}
              t={t}
            />
          ) : null}
          {screen === "wallet-gasfree" ? (
            <WalletGasFreeScreen
              wallet={selectedWallet}
              gasfreeWallet={selectedGasfreeWallet ?? null}
              transactions={walletTransactions}
              readiness={gasfreeReadiness}
              busy={busy}
              t={t}
              onCheck={() => void checkSelectedWalletGasfree()}
              onDiscover={() => void discoverSelectedWalletGasfree()}
              onReceive={() => {
                if (selectedGasfreeWallet?.id) setSelectedWalletId(selectedGasfreeWallet.id);
                setReceiveAsset("USDT");
                void navigate("wallet-receive");
              }}
              onSend={() => void openGasfreeSend()}
              onSelectTransaction={(transaction) => {
                setSelectedWalletTransactionId(transaction.id);
                setTransactionBackScreen("wallet-gasfree");
                void navigate("wallet-transaction-detail");
              }}
            />
          ) : null}
          {screen === "wallet-backup" ? (
            <BackupScreen
              wallet={selectedWallet}
              password={backupPassword}
              setPassword={setBackupPassword}
              revealedPhrase={revealedPhrase}
              busy={busy}
              t={t}
              onSubmit={revealBackupPhrase}
            />
          ) : null}
          {screen === "platform-deposit" ? (
            <PlatformDepositScreen
              amount={depositAmount}
              setAmount={setDepositAmount}
              address={depositAddress}
              deposits={deposits}
              qr={depositQr}
              busy={busy}
              onSubmit={submitDeposit}
            />
          ) : null}
          {screen === "direct-sell-detail" ? (
            <DirectSellDetailScreen
              order={selectedDirectSell}
              items={directSellPaymentItems.filter(
                (item) => item.direct_sell_order_id === selectedDirectSell?.id,
              )}
              qr={directSellQr}
              busy={busy}
              onCopy={(value, label) => copyText(value, label ?? "Address copied")}
              onConfirm={(itemId) => void confirmDirectSellPayment(itemId)}
              onDispute={(itemId) => void disputeDirectSellPayment(itemId)}
              paymentMethod={
                (selectedDirectSell?.payout_account_source ??
                  directSellAssignmentValue(selectedDirectSell, "payout_account_source")) ===
                "vendor_payment_accounts"
                  ? (vendorPayoutMethods.find(
                      (method) =>
                        method.id ===
                        (selectedDirectSell?.vendor_payment_account_id ??
                          directSellAssignmentValue(selectedDirectSell, "payout_account_id")),
                    ) ?? selectedVendorPayoutDisplay)
                  : (paymentMethods.find(
                      (method) => method.id === selectedDirectSell?.payment_method_id,
                    ) ?? selectedActivePayout)
              }
            />
          ) : null}
          {screen === "send" ? (
            <SendScreen
              wallet={
                sendMode === "gasfree" ? (selectedGasfreeWallet ?? selectedWallet) : selectedWallet
              }
              mode={sendMode}
              readiness={sendMode === "gasfree" ? gasfreeReadiness : null}
              asset={sendAsset}
              setAsset={setSendAsset}
              address={sendAddress}
              setAddress={setSendAddress}
              amount={sendAmount}
              setAmount={setSendAmount}
              transactionPassword={gasfreeSendPassword}
              setTransactionPassword={setGasfreeSendPassword}
              standardTransactionPassword={standardTransferPassword}
              setStandardTransactionPassword={setStandardTransferPassword}
              standardPreview={standardTransferPreview}
              standardPreviewError={standardTransferPreviewError}
              standardSubmitState={standardTransferSubmitState}
              standardResult={standardTransferResult}
              submitState={gasfreeSubmitState}
              result={gasfreeTransferResult}
              busy={busy}
              t={t}
              onSubmitStandard={submitStandardSend}
              onSubmitGasfree={submitGasfreeSend}
            />
          ) : null}
          {screen === "p2p" ? (
            <P2pScreen
              vendorMode={entryState === "vendor_app"}
              tab={p2pTab}
              setTab={setP2pTab}
              ads={ads}
              orders={overview?.orders ?? []}
              p2pAmount={p2pAmount}
              setP2pAmount={setP2pAmount}
              sellAd={sellAd}
              setSellAd={setSellAd}
              paymentMethods={activeUpiMethods}
              selectedPaymentMethodId={selectedPaymentMethodId}
              setSelectedPaymentMethodId={setSelectedPaymentMethodId}
              sourceWallets={activeSellWallets}
              selectedSourceWalletId={selectedSellAdWallet?.id ?? ""}
              setSelectedSourceWalletId={setSellAdSourceWalletId}
              walletAvailability={p2pWalletAvailability}
              filters={p2pFilters}
              setFilters={setP2pFilters}
              busy={busy}
              onTakeAd={takeAd}
              onCreateAd={submitSellAd}
            />
          ) : null}
          {screen === "trade" ? (
            <TradeScreen
              vendorMode={entryState === "vendor_app"}
              tab={tradeTab}
              setTab={setTradeTab}
              amount={directSellAmount}
              setAmount={setDirectSellAmount}
              paymentMethods={
                entryState === "vendor_app" ? activeVendorPayoutMethods : activePayoutMethods
              }
              selectedPaymentMethodId={
                entryState === "vendor_app"
                  ? selectedVendorPaymentAccountId
                  : selectedPaymentMethodId
              }
              setSelectedPaymentMethodId={
                entryState === "vendor_app"
                  ? setSelectedVendorPaymentAccountId
                  : setSelectedPaymentMethodId
              }
              vendors={vendorListings}
              vendorAmount={vendorAmount}
              setVendorAmount={setVendorAmount}
              rail={vendorRail}
              setRail={setVendorRail}
              busy={busy}
              onSell={submitDirectSell}
              onBuy={submitVendorBuy}
              onAddPayment={() => void navigate("bank-accounts")}
            />
          ) : null}
          {screen === "more" ? (
            <MoreScreen
              profile={profile}
              avatarUrl={avatarUrl}
              avatarUploading={avatarUploading}
              onUploadPhoto={(file) => void uploadProfilePhoto(file)}
              vendorMode={entryState === "vendor_app"}
              onNavigate={navigate}
              locale={locale}
              setLocale={setLocale}
              theme={theme}
              setTheme={setTheme}
              t={t}
              onLogout={logoutMiniAppSession}
            />
          ) : null}
          {screen === "orders" ? (
            <OrdersScreen
              orders={overview?.orders ?? []}
              directSellOrders={directSellOrders}
              onDirectSell={(order) => {
                setSelectedDirectSellId(order.id);
                setCreatedDirectSell(null);
                setScreen("direct-sell-detail");
              }}
            />
          ) : null}
          {screen === "analytics" ? <AnalyticsScreen data={analytics} /> : null}
          {screen === "bank-accounts" ? (
            <BankAccountsScreen
              vendorMode={entryState === "vendor_app"}
              methods={entryState === "vendor_app" ? vendorPayoutMethods : paymentMethods}
              upi={upiForm}
              setUpi={setUpiForm}
              bank={bankForm}
              setBank={setBankForm}
              vendorBankRail={vendorBankRail}
              setVendorBankRail={setVendorBankRail}
              vendorLimits={vendorAccountLimits}
              setVendorLimits={setVendorAccountLimits}
              busy={busy}
              onSaveUpi={submitUpi}
              onSaveBank={submitBank}
              onDefault={(id) =>
                entryState === "vendor_app"
                  ? void updateVendorPayoutState({
                      data: { accountId: id, action: "default" },
                    }).then(() => refresh("bank-accounts"))
                  : void makePaymentDefault({ data: { id } }).then(() => refresh("bank-accounts"))
              }
              onDelete={(id) =>
                entryState === "vendor_app"
                  ? void updateVendorPayoutState({
                      data: { accountId: id, action: "archive" },
                    }).then(() => refresh("bank-accounts"))
                  : void removePaymentMethod({ data: { id } }).then(() => refresh("bank-accounts"))
              }
              onVendorAction={(id, action) =>
                void updateVendorPayoutState({ data: { accountId: id, action } }).then(() =>
                  refresh("bank-accounts"),
                )
              }
            />
          ) : null}
          {screen === "history" ? <HistoryScreen rows={tradeHistory} /> : null}
          {screen === "profile" ? (
            <ProfileScreen
              profile={profile}
              avatarUrl={avatarUrl}
              avatarUploading={avatarUploading}
              hasSession={hasSession}
              onNavigate={navigate}
              onUploadPhoto={(file) => void uploadProfilePhoto(file)}
            />
          ) : null}
          {screen === "notifications" ? (
            <NotificationsScreen
              rows={overview?.notifications ?? []}
              onMarkRead={markNotificationRead}
            />
          ) : null}
          {screen === "security" ? (
            <SecurityScreen
              wallets={wallets}
              enabled={transactionPasswordEnabled}
              changing={transactionPasswordChangeOpen}
              setChanging={setTransactionPasswordChangeOpen}
              currentPassword={walletCurrentPassword}
              setCurrentPassword={setWalletCurrentPassword}
              password={walletPassword}
              setPassword={setWalletPassword}
              confirm={walletPasswordConfirm}
              setConfirm={setWalletPasswordConfirm}
              busy={busy}
              onSubmit={saveTransactionPassword}
              onWalletBackup={(wallet) => {
                setSelectedWalletId(wallet.id);
                setScreen("wallet-backup");
              }}
            />
          ) : null}
          {screen === "referral" ? <ReferralScreen summary={referral} /> : null}
        </Suspense>
      </div>
      {entryState === "vendor_app" ? (
        <VendorBottomNav
          screen={screen}
          setScreen={(next) => void navigate(next)}
          hidden={keyboardOpen}
        />
      ) : (
        <BottomNav
          tab={primaryTab}
          setTab={(next) => void navigate(next)}
          t={t}
          hidden={keyboardOpen}
        />
      )}
    </MiniFrame>
  );
}

function MiniFrame({
  children,
  locale,
  theme,
}: {
  children: React.ReactNode;
  locale: MiniLocale;
  theme: "light" | "dark";
}) {
  return (
    <div
      lang={locale}
      dir={isMiniRtl(locale) ? "rtl" : "ltr"}
      data-mini-theme={theme}
      className={`min-h-screen overflow-x-hidden antialiased ${
        theme === "light" ? "bg-[#F3F5F9] text-slate-950" : "bg-[#080a0f] text-white"
      } ${theme === "dark" ? "wtron-v17-mobile" : ""}`}
    >
      <div className="mx-auto min-h-screen max-w-[430px] px-[18px] pt-[max(env(safe-area-inset-top),0.75rem)]">
        {children}
      </div>
    </div>
  );
}

function MiniHeader({
  profile,
  avatarUrl,
  locale,
  setLocale,
  t,
  screen,
  showInAppBack,
  onBack,
  onNotifications,
  onProfile,
}: {
  profile: ProfileSummary | null;
  avatarUrl: string;
  locale: MiniLocale;
  setLocale: (locale: MiniLocale) => void;
  t: MiniT;
  screen: MiniScreen;
  showInAppBack: boolean;
  onBack: () => void;
  onNotifications: () => void;
  onProfile: () => void;
}) {
  const isRoot = ["home", "p2p", "trade", "wallet", "more"].includes(screen);
  return (
    <header className="sticky top-0 z-30 -mx-[18px] mb-[18px] flex h-[66px] items-center justify-between gap-3 border-b border-[#222837] bg-[#080a0f]/90 px-[17px] backdrop-blur-xl">
      {isRoot ? (
        <button className="flex min-w-0 items-center gap-2 text-left" onClick={onProfile}>
          <WtronMark className="h-[35px] w-[35px]" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight">WTRON</span>
            <span className="block truncate text-xs text-slate-500">
              {profile?.full_name || profile?.email || "Trader"}
            </span>
          </span>
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          {showInAppBack ? (
            <button
              aria-label={t("back")}
              className="grid h-[35px] w-[35px] place-items-center rounded-[11px] border border-[#222837] bg-[#10131a] text-slate-200"
              onClick={onBack}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{screenTitle(screen, t)}</p>
            <p className="text-xs text-slate-500">WTRON</p>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        {screen === "profile" || screen === "more" ? (
          <select
            aria-label={t("language")}
            className="h-[35px] rounded-[11px] border border-[#222837] bg-[#10131a] px-2 text-xs text-slate-200 outline-none"
            value={locale}
            onChange={(event) => setLocale(normalizeMiniLocale(event.target.value))}
          >
            {Object.entries(MINI_LOCALE_LABELS).map(([value, label]) => (
              <option key={value} value={value} className="bg-slate-950">
                {label}
              </option>
            ))}
          </select>
        ) : null}
        <IconButton icon={Bell} label="Notifications" onClick={onNotifications} />
        <button
          aria-label="Profile"
          className="grid h-[35px] w-[35px] place-items-center overflow-hidden rounded-[11px] border border-[#222837] bg-[#10131a]"
          onClick={onProfile}
        >
          <V17Avatar
            src={avatarUrl}
            initials={profile?.full_name || profile?.email || "WT"}
            size="sm"
          />
        </button>
      </div>
    </header>
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

function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: MiniIcon;
  title: string;
  body: string;
  action?: ReactNode;
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

function VendorBottomNav({
  screen,
  setScreen,
  hidden,
}: {
  screen: MiniScreen;
  setScreen: (screen: MiniScreen) => void;
  hidden?: boolean;
}) {
  const items: Array<[VendorPrimaryTab, string, V17NavIconName]> = [
    ["home", "Home", "home"],
    ["trade", "Trade", "trade"],
    ["wallet", "Wallet", "wallet"],
    ["orders", "Orders", "orders"],
    ["more", "More", "more"],
  ];
  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-40 px-[9px] pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 transition ${
        hidden ? "pointer-events-none translate-y-full opacity-0" : ""
      }`}
    >
      <div className="mx-auto grid h-[68px] max-w-[412px] grid-cols-5 gap-0.5 rounded-[23px] border border-[#222837] bg-[#10131a]/90 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,.32)] backdrop-blur-xl">
        {items.map(([key, label, icon]) => (
          <button
            key={key}
            className={`relative grid min-w-0 place-items-center gap-[3px] rounded-2xl border px-1 pt-1 text-[8px] font-bold tracking-[0.005em] transition ${
              screen === key
                ? "border-primary/15 bg-primary/10 text-[#7ba0ff]"
                : "border-transparent text-slate-500"
            }`}
            onClick={() => setScreen(key)}
          >
            <V17NavIcon
              name={icon}
              className={`h-5 w-5 ${screen === key ? "drop-shadow-[0_4px_8px_rgba(79,124,255,.26)]" : ""}`}
            />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function BottomNav({
  tab,
  setTab,
  t,
  hidden,
}: {
  tab: PrimaryTab;
  setTab: (tab: PrimaryTab) => void;
  t: MiniT;
  hidden?: boolean;
}) {
  const items: Array<[PrimaryTab, string, V17NavIconName]> = [
    ["home", t("home"), "home"],
    ["p2p", "P2P", "p2p"],
    ["trade", t("trade"), "trade"],
    ["wallet", t("wallet"), "wallet"],
    ["more", t("more"), "more"],
  ];
  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-40 px-[9px] pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 transition ${
        hidden ? "pointer-events-none translate-y-full opacity-0" : ""
      }`}
    >
      <div className="mx-auto grid h-[68px] max-w-[412px] grid-cols-5 gap-0.5 rounded-[23px] border border-[#222837] bg-[#10131a]/90 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,.32)] backdrop-blur-xl">
        {items.map(([key, label, icon]) => (
          <button
            key={key}
            className={`relative grid min-w-0 place-items-center gap-[3px] rounded-2xl border px-1 pt-1 text-[8px] font-bold tracking-[0.005em] transition ${
              tab === key
                ? "border-primary/15 bg-primary/10 text-[#7ba0ff]"
                : "border-transparent text-slate-500"
            }`}
            onClick={() => setTab(key)}
          >
            <V17NavIcon
              name={icon}
              className={`h-5 w-5 ${tab === key ? "drop-shadow-[0_4px_8px_rgba(79,124,255,.26)]" : ""}`}
            />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
