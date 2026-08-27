import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  ChevronLeft,
  ChevronDown,
  CircleDollarSign,
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
  UserRound,
  Wallet,
  Zap,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GasFreeIcon,
  MiniIcons,
  TronIcon,
  UsdtIcon,
  WtronMark,
  type MiniIcon,
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
  registerTelegramMiniApp,
  verifyTelegramMiniApp,
} from "@/lib/telegram.functions";
import { createDirectSellOrder, createVendorDirectSellOrder } from "@/lib/direct-sell.functions";
import {
  confirmDirectSellPaymentItem,
  disputeDirectSellPaymentItem,
} from "@/lib/direct-sell-admin.functions";
import { createP2pAd, createP2pOrderFromAd } from "@/lib/p2p.functions";
import {
  createWallet,
  checkWalletGasFreeCapability,
  discoverWalletGasFreeAddress,
  getGasFreeSendReadiness,
  importWallet,
  getWalletSecurityStatus,
  refreshWalletBalance,
  revealRecoveryPhrase,
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
import { formatUsdt, networkConfig, shortenHash, type ChainNetwork } from "@/lib/chain";
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
  miniAppEntryState,
  type VendorApprovalStatus,
  type WtronAccountType,
} from "@/lib/role-auth-policy";
import {
  gasfreeCapabilityNeedsCheck,
  gasfreeCapabilityStatus,
  paymentMethodDisplay,
  resolveMiniTheme,
  type MiniThemePreference,
} from "@/lib/mini-wallet-ui";
import { onChainSendEnabled, selectActiveWallet, walletDisplayBalance } from "@/lib/wallet-state";

const MINI_THEME_STORAGE_KEY = "wtron-mini-theme";

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

type PrimaryTab = "home" | "p2p" | "trade" | "wallet" | "more";
type VendorPrimaryTab = "home" | "trade" | "wallet" | "orders" | "more";
type MiniScreen =
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
type ReceiveAsset = "USDT" | "TRX";
type WalletType = "standard" | "gasfree";
type WalletHistoryAssetFilter = "ALL" | ReceiveAsset;
type WalletHistoryDirectionFilter = "ALL" | "in" | "out";

interface TelegramWebApp {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
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

interface ProfileSummary {
  id?: string | null;
  balance?: number | string | null;
  locked_balance?: number | string | null;
  pending_balance?: number | string | null;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
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

interface OrderRow {
  id: string;
  order_ref?: string | null;
  side?: string | null;
  status?: string | null;
  usdt_amount?: number | string | null;
  total_inr?: number | string | null;
  payment_deadline?: string | null;
  created_at?: string | null;
}

interface TransactionRow {
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

interface DepositRow {
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

interface DirectSellOrderRow {
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

interface DirectSellPaymentItemRow {
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

interface WalletRow {
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

interface WalletResourceSnapshot {
  freeBandwidthLimit: number;
  freeBandwidthUsed: number;
  bandwidthLimit: number;
  bandwidthUsed: number;
  energyLimit: number;
  energyUsed: number;
}

interface GasFreeReadiness {
  provider: string;
  status: string;
  reason: string;
  network: ChainNetwork;
  asset: string;
  configured: boolean;
  serviceProviderConfigured: boolean;
  apiKeyConfigured: boolean;
  apiSecretConfigured: boolean;
}

interface PaymentMethodRow {
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

interface VendorListingRow {
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

function safeAddress(address?: string | null) {
  return address && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address) ? address : "";
}

function copyText(value: string, label = "Copied") {
  if (!value) return;
  void navigator.clipboard.writeText(value).then(() => toast.success(label));
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

function friendlyMiniError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
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
  const [tradeTab, setTradeTab] = useState<TradeTab>("sell");
  const [directSellAmount, setDirectSellAmount] = useState("");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [vendorPaymentAccounts, setVendorPaymentAccounts] = useState<VendorPaymentAccountRow[]>([]);
  const [selectedVendorPaymentAccountId, setSelectedVendorPaymentAccountId] = useState("");
  const [vendorAmount, setVendorAmount] = useState("");
  const [vendorRail, setVendorRail] = useState<"upi" | "imps" | "neft" | "rtgs">("upi");
  const [createWalletName, setCreateWalletName] = useState("Main Wallet");
  const [createWalletType, setCreateWalletType] = useState<WalletType>("standard");
  const [createWalletNetwork, setCreateWalletNetwork] = useState<ChainNetwork>("trc20-mainnet");
  const [importNetworkRequired, setImportNetworkRequired] = useState<{
    reason: "multiple_active" | "no_activity";
    address: string;
  } | null>(null);
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
  const [sellAd, setSellAd] = useState({ amount: "", rate: "", min: "", max: "", terms: "" });
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

  const profile = overview?.profile ?? null;
  const wallets = overview?.wallets ?? [];
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
  const platformBalance = Number(profile?.balance ?? 0);
  const lockedBalance = Number(profile?.locked_balance ?? 0);
  const pendingBalance = Number(profile?.pending_balance ?? 0);
  const totalAssets = platformBalance + lockedBalance + pendingBalance;
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

  async function loadAuthenticatedData(
    nextScreen: MiniScreen,
    launch = initData,
    isVendorApp = linkedAccountType === "vendor" && vendorStatus === "approved",
  ) {
    const [
      homeResult,
      walletResult,
      methodsResult,
      vendorsResult,
      analyticsResult,
      historyResult,
      referralResult,
      securityResult,
    ] = await Promise.allSettled([
      loadHome({ data: { initData: launch } }),
      loadWallet({ data: { initData: launch } }),
      loadPaymentMethods(),
      loadVendors(),
      loadAnalytics({ data: { range: "30d" } }),
      loadTradeHistory(),
      loadReferral(),
      loadWalletSecurityStatus(),
    ]);
    if (homeResult.status === "fulfilled") setOverview(homeResult.value as unknown as Overview);
    if (walletResult.status === "fulfilled") {
      const wallet = walletResult.value as unknown as Overview & {
        deposits?: DepositRow[];
        depositAddress?: { address?: string; network?: string } | null;
      };
      setOverview((current) => ({ ...(current ?? {}), ...wallet }));
      setDeposits(wallet.deposits ?? []);
      setDepositAddress(wallet.depositAddress ?? null);
    }
    if (methodsResult.status === "fulfilled") {
      const rows = (methodsResult.value ?? []) as PaymentMethodRow[];
      setPaymentMethods(rows);
      setSelectedPaymentMethodId(
        (current) => current || rows.find((row) => row.is_default)?.id || rows[0]?.id || "",
      );
    }
    if (vendorsResult.status === "fulfilled") {
      setVendorListings((vendorsResult.value ?? []) as VendorListingRow[]);
    }
    if (analyticsResult.status === "fulfilled")
      setAnalytics(analyticsResult.value as AnalyticsSummary);
    if (historyResult.status === "fulfilled")
      setTradeHistory((historyResult.value ?? []) as unknown[]);
    if (referralResult.status === "fulfilled") setReferral(referralResult.value as ReferralSummary);
    if (securityResult.status === "fulfilled") {
      setTransactionPasswordEnabled(Boolean(securityResult.value.transactionPasswordEnabled));
      setTransactionPasswordChangeOpen(false);
    }
    if (isVendorApp) {
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
    } else {
      setVendorPaymentAccounts([]);
      setSelectedVendorPaymentAccountId("");
    }
    if (tabForScreen(nextScreen) === "p2p") {
      const p2p = await loadP2p({ data: { initData: launch } });
      setAds((p2p.marketplace ?? []) as AdRow[]);
      setOverview((current) => ({ ...(current ?? {}), orders: (p2p.orders ?? []) as OrderRow[] }));
    }
  }

  async function refresh(
    nextScreen: MiniScreen = screen,
    launch = initData,
    handoff = handoffToken,
  ) {
    if (!launch) return;
    setLoading(true);
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
      const { data: sessionData } = await supabase.auth.getSession();
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
        if (sessionData.session && !verified.authorized) await supabase.auth.signOut();
        setHasSession(Boolean(sessionData.session && verified.authorized));
      }
      if (!verified.linked || !verified.authorized) return;
      await loadAuthenticatedData(safeNextScreen, launch, entryState === "vendor_app");
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
      setLoading(false);
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
    void supabase.auth.getSession().then(({ data }) => setHasSession(Boolean(data.session)));
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
    const channel = supabase
      .channel(createMiniAppClientId("telegram-mini"))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deposit_requests" },
        () => void refresh(screen),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ledger_entries" },
        () => void refresh(screen),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "p2p_orders" },
        () => void refresh(screen),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [linked, initData, linkedAccountType, screen, vendorStatus]);

  useEffect(() => {
    if (!selectedWalletId && selectedWallet?.id) setSelectedWalletId(selectedWallet.id);
  }, [selectedWallet?.id, selectedWalletId]);

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
    if (!selectedAddress) {
      setWalletQr("");
      return;
    }
    const payload = `tron:${selectedAddress}?asset=${receiveAsset}&network=TRON`;
    void QRCode.toDataURL(payload, { width: 260, margin: 1 }).then(setWalletQr);
  }, [selectedAddress, receiveAsset]);

  useEffect(() => {
    const address = safeAddress(depositAddress?.address);
    if (!address) {
      setDepositQr("");
      return;
    }
    const amount = (latestDeposit?.expected_amount ?? depositAmount) || "";
    const payload = `tron:${address}?amount=${encodeURIComponent(String(amount))}&token=USDT_TRC20&network=TRON`;
    void QRCode.toDataURL(payload, { width: 260, margin: 1 }).then(setDepositQr);
  }, [depositAddress?.address, latestDeposit?.expected_amount, depositAmount]);

  useEffect(() => {
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
    void QRCode.toDataURL(payload, { width: 260, margin: 1 }).then(setDirectSellQr);
  }, [selectedDirectSell?.assigned_company_address, selectedDirectSell?.expected_usdt]);

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
    if (!selectedWallet?.id || !hasSession) {
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
        return void refresh(screen);
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
    setScreen(next);
    await refresh(next);
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
      await refresh("direct-sell-detail");
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
    setBusy(true);
    try {
      await takeP2pAd({
        data: { adId: ad.id, amountUsdt: amount, paymentMethodId: defaultPaymentMethod?.id },
      });
      toast.success("P2P order created");
      setP2pAmount("");
      setScreen("orders");
      await refresh("orders");
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
          terms: sellAd.terms || undefined,
          isActive: true,
        },
      });
      setSellAd({ amount: "", rate: "", min: "", max: "", terms: "" });
      toast.success("P2P sell ad created");
      await refresh("p2p");
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
      await refresh("orders");
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
      await refresh("direct-sell-detail");
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
      await refresh("direct-sell-detail");
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
          network: createWalletNetwork,
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
      await refresh("wallet-detail");
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
          network: createWalletNetwork,
          walletType: createWalletType,
          makeDefault: wallets.length === 0,
          transactionPassword: walletPassword,
          mnemonic: importPhrase,
          networkConfirmed: importNetworkRequired !== null,
        },
      });
      if ((imported as { requiresNetworkSelection?: boolean }).requiresNetworkSelection) {
        const selection = imported as {
          reason: "multiple_active" | "no_activity";
          address: string;
        };
        setImportNetworkRequired({ reason: selection.reason, address: selection.address });
        toast.info("Choose the wallet network to finish import");
        return;
      }
      const walletId = (imported as { wallet?: { id?: string } }).wallet?.id;
      if (walletId) setSelectedWalletId(walletId);
      setImportPhrase("");
      setWalletPassword("");
      setImportNetworkRequired(null);
      toast.success(
        (imported as { existing?: boolean }).existing
          ? "Wallet already exists. Existing wallet opened."
          : "Wallet imported",
      );
      await refresh("wallet-detail");
      setScreen("wallet-detail");
    } catch (error) {
      toast.error(friendlyMiniError(error, "Could not import wallet"));
    } finally {
      setBusy(false);
    }
  }

  async function activateWallet(wallet: WalletRow) {
    if (!wallet.id) return;
    setSelectedWalletId(wallet.id);
    setWalletResources(null);
    setWalletResourcesCheckedAt("");
    try {
      await setMiniDefaultWallet({ data: { walletId: wallet.id } });
      await refresh("wallet");
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
      await refresh("wallet-detail");
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
      await refresh("wallet-gasfree");
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
      await refresh("wallet-gasfree");
      toast.success(t("gasfreeWalletDiscovered"));
    } catch (error) {
      toast.error(friendlyMiniError(error, t("gasfreeDiscoveryFailed")));
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
      await refresh("bank-accounts");
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
      await refresh("bank-accounts");
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
      await refresh("notifications");
    }
  }

  if (loading || !launchChecked) {
    return (
      <MiniFrame locale={locale} theme={appliedTheme}>
        <div className="grid min-h-[70vh] place-items-center text-center">
          <div>
            <WtronMark className="mx-auto h-14 w-14" />
            <Loader2 className="mx-auto mt-5 h-6 w-6 animate-spin text-emerald-300" />
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
              className="mt-5 inline-flex rounded-xl bg-emerald-500 text-white hover:bg-emerald-400 px-4 py-2 text-sm font-semibold"
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
        {screen === "wallet" && !wallets.length ? (
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
            walletType={createWalletType}
            setWalletType={setCreateWalletType}
            network={createWalletNetwork}
            setNetwork={setCreateWalletNetwork}
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
            network={createWalletNetwork}
            setNetwork={setCreateWalletNetwork}
            networkRequired={importNetworkRequired}
            password={walletPassword}
            setPassword={setWalletPassword}
            busy={busy}
            t={t}
            onSubmit={submitImportWallet}
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
              setSendAsset(selectedWalletAsset);
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
            wallet={selectedWallet}
            asset={sendAsset}
            setAsset={setSendAsset}
            address={sendAddress}
            setAddress={setSendAddress}
            amount={sendAmount}
            setAmount={setSendAmount}
            t={t}
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
              entryState === "vendor_app" ? selectedVendorPaymentAccountId : selectedPaymentMethodId
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
            onNavigate={navigate}
            locale={locale}
            setLocale={setLocale}
            theme={theme}
            setTheme={setTheme}
            t={t}
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
                ? void updateVendorPayoutState({ data: { accountId: id, action: "default" } }).then(
                    () => refresh("bank-accounts"),
                  )
                : void makePaymentDefault({ data: { id } }).then(() => refresh("bank-accounts"))
            }
            onDelete={(id) =>
              entryState === "vendor_app"
                ? void updateVendorPayoutState({ data: { accountId: id, action: "archive" } }).then(
                    () => refresh("bank-accounts"),
                  )
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
          <ProfileScreen profile={profile} hasSession={hasSession} onNavigate={navigate} />
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
      </div>
      {entryState === "vendor_app" ? (
        <VendorBottomNav screen={screen} setScreen={(next) => void navigate(next)} />
      ) : (
        <BottomNav tab={primaryTab} setTab={(next) => void navigate(next)} t={t} />
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
        theme === "light" ? "bg-[#F7F9FC] text-slate-950" : "bg-[#05070B] text-white"
      }`}
    >
      <div className="mx-auto min-h-screen max-w-md px-3 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-4">
        {children}
      </div>
    </div>
  );
}

function MiniHeader({
  profile,
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
    <header className="sticky top-0 z-30 -mx-3 mb-3 flex h-12 items-center justify-between gap-3 border-b border-white/8 bg-[#05070B]/92 px-3 backdrop-blur sm:-mx-4 sm:px-4">
      {isRoot ? (
        <button className="flex min-w-0 items-center gap-2 text-left" onClick={onProfile}>
          <WtronMark className="h-9 w-9 rounded-xl" />
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
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/6 text-slate-200"
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
            className="h-9 rounded-xl border border-white/10 bg-white/6 px-2 text-xs text-slate-200 outline-none"
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
        <IconButton icon={UserRound} label="Profile" onClick={onProfile} />
      </div>
    </header>
  );
}

function AuthScreen(props: {
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
        <p className="text-xs font-semibold tracking-[0.2em] text-emerald-300 uppercase">
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
          <p className="mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">
            {props.notice}
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/6 p-1">
        <button
          type="button"
          className={`rounded-xl px-3 py-2 text-sm ${props.accountType === "trader" ? "bg-red-500 text-white hover:bg-red-400" : "text-slate-400"}`}
          onClick={() => props.setAccountType("trader")}
        >
          Trader
        </button>
        <button
          type="button"
          className={`rounded-xl px-3 py-2 text-sm ${props.accountType === "vendor" ? "bg-violet-500 text-white hover:bg-violet-400" : "text-slate-400"}`}
          onClick={() => props.setAccountType("vendor")}
        >
          Vendor
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/6 p-1">
        <button
          className={`rounded-xl px-3 py-2 text-sm ${props.authMode === "login" ? "bg-emerald-500 text-[#03130e] hover:bg-emerald-400" : "text-slate-400"}`}
          onClick={() => props.setAuthMode("login")}
        >
          Login
        </button>
        <button
          className={`rounded-xl px-3 py-2 text-sm ${props.authMode === "register" ? "bg-emerald-500 text-[#03130e] hover:bg-emerald-400" : "text-slate-400"}`}
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
          className="w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
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

function HomeScreen({
  vendorMode,
  total,
  profile,
  orders,
  transactions,
  ads,
  wallet,
  t,
  onNavigate,
}: {
  vendorMode?: boolean;
  total: number;
  profile: ProfileSummary | null;
  orders: OrderRow[];
  transactions: TransactionRow[];
  ads: AdRow[];
  wallet: WalletRow | null;
  t: MiniT;
  onNavigate: (screen: MiniScreen) => Promise<void>;
}) {
  const walletUsdt = walletDisplayBalance(wallet);
  const walletTrx = Number(wallet?.onchain_trx_balance ?? 0);
  return (
    <Screen title="Home" subtitle="Wallet, P2P and WTRON trading overview" compact>
      <section className="space-y-5 pt-1">
        <div>
          <p className="text-sm text-slate-500">Good day</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-normal">
            {profile?.full_name || "WTRON Trader"}
          </h1>
        </div>
        <Surface className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">Platform balance</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{money(total)} USDT</p>
            </div>
            <StatusPill label="Live" tone="success" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniMetric label="Available" value={money(profile?.balance)} />
            <MiniMetric label="Locked" value={money(profile?.locked_balance)} />
            <MiniMetric label="Pending" value={money(profile?.pending_balance)} />
          </div>
        </Surface>
        <Surface className="p-4">
          <div className="flex items-center justify-between">
            <SectionHeader
              title="Personal wallet"
              action="Open"
              onAction={() => onNavigate("wallet-detail")}
            />
          </div>
          {wallet ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{wallet.name ?? "Main Wallet"}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {networkLabelForMini(wallet.network, t)} /{" "}
                  {(wallet.wallet_type ?? "standard").toUpperCase()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">{money(walletUsdt)} USDT</p>
                <p className="text-xs text-slate-500 tabular-nums">{money(walletTrx, "TRX")} TRX</p>
              </div>
            </div>
          ) : (
            <CompactEmpty title="No wallet selected" body="Create or import a TRON wallet." />
          )}
        </Surface>
        <div className="grid grid-cols-4 gap-3">
          <QuickAction icon={MiniIcons.send} label="Send" onClick={() => onNavigate("send")} />
          <QuickAction
            icon={MiniIcons.receive}
            label="Receive"
            onClick={() => onNavigate("wallet-receive")}
          />
          {vendorMode ? (
            <QuickAction icon={MiniIcons.trade} label="Trade" onClick={() => onNavigate("trade")} />
          ) : (
            <QuickAction icon={MiniIcons.p2p} label="Buy" onClick={() => onNavigate("p2p")} />
          )}
          <QuickAction icon={MiniIcons.trade} label="Sell" onClick={() => onNavigate("trade")} />
        </div>
      </section>
      <Section title="Active Orders" action="View all" onAction={() => onNavigate("orders")}>
        {orders.length ? (
          orders.slice(0, 3).map((order) => <OrderCard key={order.id} order={order} />)
        ) : (
          <EmptyLine>No active orders. Browse P2P or WTRON Trade.</EmptyLine>
        )}
      </Section>
      {!vendorMode ? (
        <Section title="Current P2P Orders" action="Market" onAction={() => onNavigate("p2p")}>
          {ads.length ? (
            ads
              .slice(0, 2)
              .map((ad) => <AdCard key={ad.id} ad={ad} onTake={() => onNavigate("p2p")} />)
          ) : (
            <EmptyLine>No live marketplace cards loaded yet.</EmptyLine>
          )}
        </Section>
      ) : null}
      <TransactionList
        title="Recent Activity"
        rows={transactions}
        empty="No ledger activity yet."
      />
    </Screen>
  );
}

function WalletScreen({
  wallets,
  selectedWallet,
  t,
  onNavigate,
  onSelect,
}: {
  wallets: WalletRow[];
  selectedWallet: WalletRow | null;
  t: MiniT;
  onNavigate: (screen: MiniScreen) => Promise<void>;
  onSelect: (wallet: WalletRow) => void;
}) {
  const total = wallets.reduce((sum, wallet) => sum + walletDisplayBalance(wallet), 0);
  const totalTrx = wallets.reduce(
    (sum, wallet) => sum + Number(wallet.onchain_trx_balance ?? 0),
    0,
  );
  if (!wallets.length) {
    return (
      <Screen title={t("walletSelector")} subtitle={t("selfCustodyWallet")}>
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-center">
          <Wallet className="mx-auto h-10 w-10 text-emerald-300" />
          <h2 className="mt-4 text-xl font-semibold tracking-normal">{t("createWallet")}</h2>
          <p className="mt-2 text-sm text-slate-400">{t("selfCustodyWallet")}</p>
          <div className="mt-5 grid gap-2">
            <Button
              className="bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
              onClick={() => onNavigate("wallet-create")}
            >
              {t("createWallet")}
            </Button>
            <Button variant="secondary" onClick={() => onNavigate("wallet-import")}>
              {t("importExistingWallet")}
            </Button>
          </div>
        </div>
      </Screen>
    );
  }
  return (
    <Screen title={t("walletSelector")} subtitle={t("selfCustodyWallet")}>
      <Surface className="p-3">
        <p className="text-xs font-semibold uppercase text-slate-500">{t("portfolioBalance")}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <TokenMetric icon={<UsdtIcon />} label="USDT" value={money(total)} sub="TRC20 on TRON" />
          <TokenMetric
            icon={<TronIcon />}
            label="TRX"
            value={money(totalTrx, "TRX")}
            sub="TRON native"
          />
        </div>
      </Surface>
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
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
      <Section title={t("selectedWallet")}>
        <WalletSummary
          wallet={selectedWallet}
          t={t}
          onReceive={() => onNavigate("wallet-receive")}
          onSend={() => onNavigate("send")}
          onBackup={() => onNavigate("wallet-backup")}
        />
      </Section>
    </Screen>
  );
}

function WalletCreateScreen(props: {
  name: string;
  setName: (value: string) => void;
  walletType: WalletType;
  setWalletType: (value: WalletType) => void;
  network: ChainNetwork;
  setNetwork: (value: ChainNetwork) => void;
  password: string;
  setPassword: (value: string) => void;
  confirm: string;
  setConfirm: (value: string) => void;
  busy: boolean;
  t: MiniT;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Screen title={props.t("createWallet")} subtitle={props.t("createWalletSubtitle")}>
      <form className="space-y-4" onSubmit={props.onSubmit}>
        <FormCard title={`1. ${props.t("walletName")}`}>
          <Input
            value={props.name}
            onChange={(event) => props.setName(event.target.value)}
            placeholder={props.t("mainWallet")}
          />
        </FormCard>
        <FormCard title={`2. ${props.t("chooseWalletType")}`}>
          <div className="grid gap-2">
            <TypeOption
              active={props.walletType === "standard"}
              icon={<TronIcon />}
              title={props.t("standardTronWallet")}
              body={props.t("standardWalletDescription")}
              onClick={() => props.setWalletType("standard")}
            />
            <TypeOption
              active={false}
              icon={<GasFreeIcon />}
              title={props.t("gasfreeWallet")}
              body={`${props.t("gasfreeDescription")} ${props.t("comingSoonUnavailable")}`}
              disabled
              onClick={() => props.setWalletType("standard")}
            />
          </div>
        </FormCard>
        <FormCard title={`3. TRON Mainnet`}>
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-50">
            Customer wallets use TRON Mainnet in production. Nile remains available only for
            existing test wallets and internal diagnostics.
          </div>
        </FormCard>
        <FormCard title={`4. ${props.t("transactionPassword")}`}>
          <div className="space-y-2">
            <Input
              type="password"
              value={props.password}
              onChange={(event) => props.setPassword(event.target.value)}
              placeholder={props.t("password")}
            />
            <Input
              type="password"
              value={props.confirm}
              onChange={(event) => props.setConfirm(event.target.value)}
              placeholder={props.t("confirmPassword")}
            />
          </div>
        </FormCard>
        <Button
          className="w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
          disabled={props.busy}
        >
          {props.busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {props.t("createWallet")}
        </Button>
      </form>
    </Screen>
  );
}

function WalletImportScreen(props: {
  name: string;
  setName: (value: string) => void;
  phrase: string;
  setPhrase: (value: string) => void;
  network: ChainNetwork;
  setNetwork: (value: ChainNetwork) => void;
  networkRequired: { reason: "multiple_active" | "no_activity"; address: string } | null;
  password: string;
  setPassword: (value: string) => void;
  busy: boolean;
  t: MiniT;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Screen title={props.t("importWallet")} subtitle={props.t("importWalletSubtitle")}>
      <form className="space-y-4" onSubmit={props.onSubmit}>
        <FormCard title={props.t("walletName")}>
          <Input
            value={props.name}
            onChange={(event) => props.setName(event.target.value)}
            placeholder={props.t("tradingWallet")}
          />
        </FormCard>
        <FormCard title={props.t("walletType")}>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-3">
              <TronIcon className="h-8 w-8" />
              <div>
                <p className="text-sm font-semibold">{props.t("standardTronWallet")}</p>
                <p className="text-xs text-slate-400">{props.t("externalImportStandard")}</p>
              </div>
            </div>
          </div>
        </FormCard>
        <FormCard title="TRON Mainnet">
          {props.networkRequired ? (
            <div className="mb-3 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-xs text-slate-200">
              <p className="font-semibold text-white">
                {props.networkRequired.reason === "multiple_active"
                  ? props.t("multipleNetworksFound")
                  : props.t("noNetworkActivityFound")}
              </p>
              <p className="mt-1">
                {props.t("confirmNetworkForAddress", {
                  address: shortenHash(props.networkRequired.address),
                })}
              </p>
            </div>
          ) : null}
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-50">
            Mainnet is selected automatically for production imports. If only Nile testnet activity
            is detected, WTRON preserves it as a Test Wallet / Nile wallet.
          </div>
        </FormCard>
        <FormCard title={props.t("recoveryPhrase")}>
          <textarea
            className="min-h-28 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none focus:border-emerald-500"
            value={props.phrase}
            onChange={(event) => props.setPhrase(event.target.value)}
            placeholder={props.t("enterRecoveryPhrase")}
          />
        </FormCard>
        <FormCard title={props.t("transactionPassword")}>
          <Input
            type="password"
            value={props.password}
            onChange={(event) => props.setPassword(event.target.value)}
            placeholder={props.t("password")}
          />
        </FormCard>
        <Button
          className="w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
          disabled={props.busy}
        >
          {props.t("importWallet")}
        </Button>
      </form>
    </Screen>
  );
}

function WalletDetailScreen({
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
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500/12">
              <Wallet className="h-5 w-5 text-emerald-300" />
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
            <Copy className="h-4 w-4 text-emerald-300" />
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
                <p className="text-base text-slate-400 tabular-nums">
                  {money(wallet.onchain_trx_balance ?? 0, "TRX")} TRX
                </p>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <QuickAction icon={MiniIcons.send} label={t("send")} onClick={() => onNavigate("send")} />
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
              <button className="text-xs text-emerald-300" onClick={() => onRefresh()}>
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
        <AssetRow
          icon={<TronIcon />}
          symbol="TRX"
          name="TRON"
          network="TRON"
          amount={`${money(wallet.onchain_trx_balance ?? 0, "TRX")} TRX`}
          onClick={() => onSelectAsset("TRX")}
        />
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

function WalletHistoryScreen({
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
  const filtered = useMemo(
    () => filterWalletTransactions(rows, assetFilter, directionFilter),
    [rows, assetFilter, directionFilter],
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
        value={assetFilter}
        setValue={(value) => setAssetFilter(value as WalletHistoryAssetFilter)}
        items={[
          ["ALL", t("all")],
          ["USDT", "USDT"],
          ["TRX", "TRX"],
        ]}
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
          className="w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
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

function WalletAssetDetailScreen({
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

function WalletTransactionDetailScreen({
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
  const network = networkConfig(wallet.network);
  const direction = transaction.direction === "in" ? t("received") : t("sent");
  const counterparty = safeAddress(transaction.counterparty_address);
  const from = transaction.direction === "in" ? counterparty : safeAddress(wallet.address);
  const to = transaction.direction === "in" ? safeAddress(wallet.address) : counterparty;
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
        <StatusBadge status={transaction.status ?? "completed"} />
      </Surface>
      <MetricGrid
        items={[
          [t("status"), transaction.status ?? "completed"],
          [t("transactionDetail"), direction],
          [t("network"), networkLabelForMini(wallet.network, t)],
          [t("from"), from ? shortenHash(from, 8) : "-"],
          [t("to"), to ? shortenHash(to, 8) : "-"],
          [t("fee"), money(transaction.fee ?? 0, transaction.currency ?? "USDT")],
          [t("block"), "-"],
          [t("confirmations"), transaction.status === "completed" ? "Confirmed" : "-"],
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
            className="mt-3 w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
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

function WalletMoreScreen({
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
  const network = networkConfig(wallet.network);
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

function WalletGasFreeScreen({
  wallet,
  gasfreeWallet,
  transactions,
  readiness,
  busy,
  t,
  onCheck,
  onDiscover,
  onReceive,
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
  const status = discovered ? t("gasfreeWalletReady") : t("notDiscovered");
  const transferStatus = readiness?.status ?? (discovered ? "NOT_CONFIGURED" : "DISABLED");
  const transferLabel =
    transferStatus === "AVAILABLE"
      ? t("available")
      : transferStatus === "NOT_CONFIGURED"
        ? t("setupRequired")
        : transferStatus === "PROVIDER_ERROR"
          ? t("checkFailed")
          : transferStatus === "LIMIT_REACHED"
            ? t("limitReached")
            : t("disabled");
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
    transferStatus === "AVAILABLE"
      ? "success"
      : transferStatus === "NOT_CONFIGURED" || transferStatus === "PROVIDER_ERROR"
        ? "warning"
        : "muted";
  const explanation = discovered
    ? (readiness?.reason ?? t("gasfreeTransferSetupRequired"))
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
            disabled={transferStatus !== "AVAILABLE"}
            onClick={() => undefined}
          />
        </div>

        <section className="space-y-2">
          <SectionTitle>{t("serviceStatus")}</SectionTitle>
          <div className="divide-y divide-white/10 border-y border-white/10 text-sm">
            <StatusRow
              label={t("walletStatus")}
              value={discovered ? t("discovered") : t("notDiscovered")}
            />
            <StatusRow
              label={t("gasfreeTransfers")}
              value={<StatusPill label={transferLabel} tone={transferTone} />}
            />
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
          className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-medium text-[#03130e] disabled:opacity-60"
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

function ReceiveScreen({
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
  return (
    <Screen title={t("personalWalletReceive")} subtitle={t("receiveSubtitle")}>
      <SegmentedControl
        value={asset}
        setValue={(value) => setAsset(value as ReceiveAsset)}
        items={[
          ["USDT", "USDT"],
          ["TRX", "TRX"],
        ]}
      />
      <Surface className="p-4 text-center">
        <div className="mx-auto grid h-56 w-56 max-w-full place-items-center rounded-xl bg-white p-2.5">
          {qr ? (
            <img src={qr} alt="Receive QR" className="h-full w-full" />
          ) : (
            <MiniIcons.upi className="h-10 w-10 text-slate-400" />
          )}
        </div>
        <p className="mt-4 text-sm font-semibold text-white">
          {asset === "USDT" ? "USDT / TRC20" : "TRX / TRON Network"}
        </p>
        <p className="mono mt-2 break-all text-sm text-slate-300" dir={technicalTextDirection()}>
          {address || t("noWalletSelected")}
        </p>
      </Surface>
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
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

function BackupScreen({
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
            className="w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
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
            className="w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
            onClick={() => copyText(revealedPhrase, t("copied"))}
          >
            {t("copyAddress")}
          </Button>
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

function PlatformDepositScreen({
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
          className="w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
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
            className="mt-3 w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
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

function SendScreen({
  wallet,
  asset,
  setAsset,
  address,
  setAddress,
  amount,
  setAmount,
  t,
}: {
  wallet: WalletRow | null;
  asset: ReceiveAsset;
  setAsset: (asset: ReceiveAsset) => void;
  address: string;
  setAddress: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  t: MiniT;
}) {
  const enabled = onChainSendEnabled(wallet);
  const network = networkConfig(wallet?.network);
  const available =
    asset === "USDT" ? walletDisplayBalance(wallet) : Number(wallet?.onchain_trx_balance ?? 0);
  const mainnetDisabled = wallet?.network === "trc20-mainnet";
  return (
    <Screen title={t("send")} subtitle={t("selfCustodyWallet")}>
      <Surface className="p-4">
        <SegmentedControl
          value={asset}
          setValue={(value) => setAsset(value as ReceiveAsset)}
          items={[
            ["USDT", "USDT"],
            ["TRX", "TRX"],
          ]}
        />
        <div className="mt-4 space-y-3">
          <FormField label={t("available")}>
            <p className="text-sm font-semibold tabular-nums">
              {money(available, asset)} {asset}
            </p>
          </FormField>
          <FormField label={t("toAddress")}>
            <div className="flex items-center gap-2">
              <Input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder={t("recipientAddressPlaceholder")}
              />
              <button className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/6">
                <ScanLine className="h-4 w-4 text-slate-300" />
              </button>
            </div>
          </FormField>
          <FormField label={t("amount")}>
            <div className="flex items-center gap-2">
              <Input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={t("amount")}
              />
              <button
                type="button"
                className="rounded-xl bg-white/6 px-3 py-2 text-xs font-semibold text-emerald-300"
                onClick={() => setAmount(String(available || ""))}
              >
                {t("max")}
              </button>
            </div>
          </FormField>
        </div>
        <MetricGrid
          items={[
            [t("selectedWallet"), wallet?.name ?? t("noWalletSelected")],
            [t("network"), networkLabelForMini(wallet?.network, t)],
            [t("resources"), t("signerRequired")],
            [t("fees"), t("signerRequired")],
          ]}
        />
      </Surface>
      <p className="rounded-2xl bg-yellow-500/10 p-3 text-sm text-yellow-100">
        {mainnetDisabled ? t("mainnetSendDisabled") : t("sendUnavailable")}
      </p>
      <Button className="w-full" disabled={!enabled || mainnetDisabled}>
        {t("continue")}
      </Button>
    </Screen>
  );
}

function P2pScreen(props: {
  vendorMode?: boolean;
  tab: P2pTab;
  setTab: (tab: P2pTab) => void;
  ads: AdRow[];
  orders: OrderRow[];
  p2pAmount: string;
  setP2pAmount: (value: string) => void;
  sellAd: { amount: string; rate: string; min: string; max: string; terms: string };
  setSellAd: (value: {
    amount: string;
    rate: string;
    min: string;
    max: string;
    terms: string;
  }) => void;
  paymentMethods: PaymentMethodRow[];
  selectedPaymentMethodId: string;
  setSelectedPaymentMethodId: (id: string) => void;
  busy: boolean;
  onTakeAd: (ad: AdRow) => void;
  onCreateAd: (event: FormEvent) => void;
}) {
  return (
    <Screen
      title={props.vendorMode ? "P2P Sell" : "P2P Market"}
      subtitle={props.vendorMode ? "Vendor seller tools only" : "User-to-user USDT trading only"}
    >
      <SegmentedControl
        value={props.vendorMode && props.tab === "buy" ? "sell" : props.tab}
        setValue={(value) => props.setTab(value as P2pTab)}
        items={
          props.vendorMode
            ? [
                ["sell", "Sell"],
                ["myAds", "My Ads"],
                ["myOrders", "My Orders"],
              ]
            : [
                ["buy", "Buy"],
                ["sell", "Sell"],
                ["myAds", "My Ads"],
                ["myOrders", "My Orders"],
              ]
        }
      />
      {!props.vendorMode && props.tab === "buy" ? (
        <div className="space-y-3">
          <FormField label="USDT amount">
            <Input
              value={props.p2pAmount}
              onChange={(event) => props.setP2pAmount(event.target.value)}
              placeholder="USDT amount"
            />
          </FormField>
          {props.ads.length ? (
            props.ads.map((ad) => <AdCard key={ad.id} ad={ad} onTake={() => props.onTakeAd(ad)} />)
          ) : (
            <CompactEmpty
              title="No seller ads"
              body="Create a sell ad from the Sell tab or check again later."
            />
          )}
        </div>
      ) : null}
      {props.tab === "sell" ? (
        <form
          className="space-y-3 rounded-2xl border border-white/10 bg-white/6 p-3"
          onSubmit={props.onCreateAd}
        >
          {(["amount", "rate", "min", "max"] as const).map((field) => {
            const label =
              field === "amount"
                ? "USDT Amount"
                : field === "rate"
                  ? "Selling Rate"
                  : field === "min"
                    ? "Min INR"
                    : "Max INR";
            return (
              <FormField key={field} label={label}>
                <Input
                  value={props.sellAd[field]}
                  onChange={(event) =>
                    props.setSellAd({ ...props.sellAd, [field]: event.target.value })
                  }
                  placeholder={label}
                />
              </FormField>
            );
          })}
          {props.paymentMethods.length ? (
            <FormField label="Saved UPI">
              <PaymentMethodPicker
                methods={props.paymentMethods}
                selectedId={props.selectedPaymentMethodId}
                setSelectedId={props.setSelectedPaymentMethodId}
              />
            </FormField>
          ) : (
            <CompactEmpty
              title="Add UPI ID first"
              body="A saved active UPI account is required for sell ads."
            />
          )}
          <textarea
            className="min-h-20 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none focus:border-emerald-500"
            value={props.sellAd.terms}
            onChange={(event) => props.setSellAd({ ...props.sellAd, terms: event.target.value })}
            placeholder="Terms"
          />
          <Button
            className="w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
            disabled={props.busy || !props.paymentMethods.length || !props.selectedPaymentMethodId}
          >
            Create Sell Ad
          </Button>
        </form>
      ) : null}
      {props.tab === "myAds" ? (
        <CompactEmpty title="No ads yet" body="Your sell ads will appear here after creation." />
      ) : null}
      {props.tab === "myOrders" ? (
        <OrderList orders={props.orders} empty="No P2P orders yet." />
      ) : null}
    </Screen>
  );
}

function TradeScreen(props: {
  vendorMode?: boolean;
  tab: TradeTab;
  setTab: (tab: TradeTab) => void;
  amount: string;
  setAmount: (value: string) => void;
  paymentMethods: PaymentMethodRow[];
  selectedPaymentMethodId: string;
  setSelectedPaymentMethodId: (id: string) => void;
  vendors: VendorListingRow[];
  vendorAmount: string;
  setVendorAmount: (value: string) => void;
  rail: "upi" | "imps" | "neft" | "rtgs";
  setRail: (rail: "upi" | "imps" | "neft" | "rtgs") => void;
  busy: boolean;
  onSell: (event: FormEvent) => void;
  onBuy: (listing: VendorListingRow) => void;
  onAddPayment: () => void;
}) {
  return (
    <Screen
      title={props.vendorMode ? "Vendor Trade" : "WTRON Trade"}
      subtitle={
        props.vendorMode
          ? "Approved vendors can sell USDT to WTRON. Buy-side trader actions are hidden."
          : "Company and verified-vendor trading"
      }
    >
      {props.vendorMode ? null : (
        <SegmentedControl
          value={props.tab}
          setValue={(value) => props.setTab(value as TradeTab)}
          items={[
            ["sell", "Sell to WTRON"],
            ["buy", "Buy from WTRON"],
          ]}
        />
      )}
      {props.tab === "sell" ? (
        <form className="space-y-4" onSubmit={props.onSell}>
          <Surface className="p-4">
            <SectionHeader title="Sell USDT to WTRON" />
            <MetricGrid
              items={[
                ["WTRON Buy Rate", "Configured by admin"],
                ["Payout", "Saved UPI or bank"],
              ]}
            />
            <div className="mt-4 space-y-3">
              <FormField label="USDT amount">
                <Input
                  value={props.amount}
                  onChange={(event) => props.setAmount(event.target.value)}
                  placeholder="USDT amount"
                />
              </FormField>
              {props.paymentMethods.length ? (
                <FormField label="Payout account">
                  <PaymentMethodPicker
                    methods={props.paymentMethods}
                    selectedId={props.selectedPaymentMethodId}
                    setSelectedId={props.setSelectedPaymentMethodId}
                  />
                </FormField>
              ) : (
                <CompactEmpty
                  title={props.vendorMode ? "Add payout account first" : "Add payout method first"}
                  body={
                    props.vendorMode
                      ? "Vendor Direct Sell requires an active vendor payout account."
                      : "Direct sell payouts require a saved payment account."
                  }
                />
              )}
            </div>
          </Surface>
          {!props.paymentMethods.length ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={props.onAddPayment}
            >
              {props.vendorMode ? "Add payout account" : "Add payout method"}
            </Button>
          ) : null}
          <Button
            className="w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
            disabled={props.busy || !props.paymentMethods.length || !props.selectedPaymentMethodId}
          >
            Create Sell Order
          </Button>
        </form>
      ) : null}
      {!props.vendorMode && props.tab === "buy" ? (
        <div className="space-y-3">
          <FormField label="USDT amount">
            <Input
              value={props.vendorAmount}
              onChange={(event) => props.setVendorAmount(event.target.value)}
              placeholder="USDT amount"
            />
          </FormField>
          <SegmentedControl
            value={props.rail}
            setValue={(value) => props.setRail(value as "upi" | "imps" | "neft" | "rtgs")}
            items={[
              ["upi", "UPI"],
              ["imps", "IMPS"],
              ["neft", "NEFT"],
              ["rtgs", "RTGS"],
            ]}
          />
          {props.vendors.length ? (
            props.vendors.map((listing) => (
              <VendorCard key={listing.id} listing={listing} onBuy={() => props.onBuy(listing)} />
            ))
          ) : (
            <CompactEmpty
              title="No offers"
              body="No verified vendor offers are active for this rail."
            />
          )}
        </div>
      ) : null}
    </Screen>
  );
}

function MoreScreen({
  onNavigate,
  locale,
  setLocale,
  theme,
  setTheme,
  t,
}: {
  onNavigate: (screen: MiniScreen) => Promise<void>;
  locale: MiniLocale;
  setLocale: (locale: MiniLocale) => void;
  theme: MiniThemePreference;
  setTheme: (theme: MiniThemePreference) => void;
  t: MiniT;
}) {
  const sections: Array<[string, Array<[MiniScreen, string, string, MiniIcon]>]> = [
    [
      t("profile"),
      [
        ["profile", t("profile"), "Name, Telegram and account ID", MiniIcons.profile],
        ["notifications", t("notifications"), "Wallet and order alerts", MiniIcons.notifications],
        ["security", t("security"), "Transaction password and backup", MiniIcons.security],
      ],
    ],
    [
      t("payments"),
      [
        ["bank-accounts", t("bankAccounts"), "Manage receiving accounts", MiniIcons.bank],
        ["orders", t("orders"), "P2P and WTRON order status", MiniIcons.orders],
        ["history", t("history"), "Company and vendor trade history", MiniIcons.history],
      ],
    ],
    [
      "Wallet",
      [
        ["wallet", "Manage Wallets", "Create, import and switch wallets", MiniIcons.wallet],
        ["wallet-backup", "Backup", "Recovery phrase tools", MiniIcons.backup],
        ["wallet-gasfree", "GasFree", "Capability and sponsorship status", Zap],
      ],
    ],
    [
      "App",
      [
        ["referral", "Referral", "Invite and rewards", MiniIcons.referral],
        ["analytics", "Analytics", "Real trading metrics", MiniIcons.analytics],
      ],
    ],
  ];
  return (
    <Screen title="More" subtitle="Account, trading and security tools" compact>
      <Section title={t("preferences")}>
        <Surface className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold">{t("appearance")}</p>
            <SegmentedControl
              value={theme}
              setValue={(value) => setTheme(value as MiniThemePreference)}
              items={[
                ["system", t("system")],
                ["light", t("light")],
                ["dark", t("dark")],
              ]}
            />
          </div>
          <div>
            <p className="text-sm font-semibold">Language</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {Object.entries(MINI_LOCALE_LABELS).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  variant={locale === key ? "default" : "secondary"}
                  onClick={() => setLocale(key as MiniLocale)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </Surface>
      </Section>
      {sections.map(([title, items]) => (
        <Section key={title} title={title}>
          {items.map(([screen, label, body, Icon]) => (
            <ListRow
              key={screen}
              icon={Icon}
              title={label}
              body={body}
              onClick={() => onNavigate(screen)}
            />
          ))}
        </Section>
      ))}
      <Section title="Legal">
        <ListRow
          icon={FileText}
          title="Privacy Policy"
          body="Public legal page"
          onClick={() => {
            window.open("/privacy", "_blank", "noopener,noreferrer");
          }}
        />
        <ListRow
          icon={FileText}
          title="Terms"
          body="Public legal page"
          onClick={() => {
            window.open("/terms", "_blank", "noopener,noreferrer");
          }}
        />
        <ListRow
          icon={ShieldCheck}
          title="Risk Disclosure"
          body="Public legal page"
          onClick={() => {
            window.open("/risk-disclosure", "_blank", "noopener,noreferrer");
          }}
        />
      </Section>
      <ListRow
        icon={LogOut}
        title="Logout"
        body="Close your Mini App session"
        onClick={() => {
          toast.info("Use Telegram or web account controls to sign out.");
        }}
      />
    </Screen>
  );
}

function OrdersScreen({
  orders,
  directSellOrders,
  onDirectSell,
}: {
  orders: OrderRow[];
  directSellOrders: DirectSellOrderRow[];
  onDirectSell: (order: DirectSellOrderRow) => void;
}) {
  return (
    <Screen title="Orders" subtitle="P2P, WTRON and vendor order activity">
      <Section title="WTRON Direct Sell">
        {directSellOrders.length ? (
          directSellOrders.map((order) => (
            <button
              key={order.id}
              type="button"
              className="w-full rounded-xl border border-white/10 bg-white/6 p-3 text-left"
              onClick={() => onDirectSell(order)}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="mono text-sm">{order.order_ref ?? shortenHash(order.id)}</p>
                <StatusBadge status={String(order.status ?? "waiting")} />
              </div>
              <MetricGrid
                items={[
                  ["USDT", money(order.expected_usdt)],
                  ["Expected INR", money(order.expected_inr, "INR")],
                  [
                    "Confirmations",
                    `${order.confirmations ?? 0}/${order.required_confirmations ?? 0}`,
                  ],
                  ["Address", order.assigned_company_address ? "Assigned" : "Pending"],
                ]}
              />
            </button>
          ))
        ) : (
          <CompactEmpty
            title="No direct sell orders"
            body="Sell USDT to WTRON from the Trade tab."
          />
        )}
      </Section>
      <Section title="P2P Orders">
        <OrderList orders={orders} empty="No P2P orders yet." />
      </Section>
    </Screen>
  );
}

function AnalyticsScreen({ data }: { data: AnalyticsSummary | null }) {
  return (
    <Screen title="Analytics" subtitle="Real WTRON trading metrics">
      <Tabs
        value="30d"
        setValue={() => undefined}
        items={[
          ["today", "Today"],
          ["7d", "7 Days"],
          ["30d", "30 Days"],
        ]}
      />
      {data ? (
        <>
          <MetricGrid
            items={[
              ["Total Volume", `${money(data.totalUsdtVolume)} USDT`],
              ["P2P Buy", money(data.p2pBuyVolume)],
              ["P2P Sell", money(data.p2pSellVolume)],
              ["WTRON Trade", money(data.companyTradeVolume)],
              ["Fees", money(data.feesPaid)],
              ["Completed", String(data.completedOrders)],
              ["Disputes", String(data.disputes)],
            ]}
          />
          <MiniChart rows={data.chart} />
        </>
      ) : (
        <EmptyLine>No analytics data yet.</EmptyLine>
      )}
    </Screen>
  );
}

function HistoryScreen({ rows }: { rows: unknown[] }) {
  return (
    <Screen title="History" subtitle="Company and vendor trade history">
      {rows.length ? (
        rows.map((row, index) => <GenericRow key={index} row={row as Record<string, unknown>} />)
      ) : (
        <EmptyLine>No trades yet.</EmptyLine>
      )}
    </Screen>
  );
}

function ProfileScreen({
  profile,
  hasSession,
  onNavigate,
}: {
  profile: ProfileSummary | null;
  hasSession: boolean;
  onNavigate: (screen: MiniScreen) => Promise<void>;
}) {
  return (
    <Screen title="Profile" subtitle="WTRON trader profile">
      <Surface className="p-4 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/12">
          <UserRound className="h-8 w-8 text-emerald-300" />
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-normal">
          {profile?.full_name || "WTRON Trader"}
        </h2>
        <p className="text-sm text-slate-400">{profile?.email || "Telegram linked account"}</p>
        <p className="mt-2 text-xs text-emerald-200">Telegram linked</p>
        <p className="mono mt-2 text-[11px] text-slate-500" dir={technicalTextDirection()}>
          {profile?.id ? shortenHash(profile.id, 8) : "Account pending"}
        </p>
      </Surface>
      <Section title="Sections">
        <ListRow
          icon={MiniIcons.wallet}
          title="Manage Wallets"
          body="Personal wallet management"
          onClick={() => onNavigate("wallet")}
        />
        <ListRow
          icon={MiniIcons.bank}
          title="Payments"
          body="Bank accounts and UPI"
          onClick={() => onNavigate("bank-accounts")}
        />
        <ListRow
          icon={MiniIcons.security}
          title="Security"
          body={hasSession ? "Authenticated session" : "Telegram verified"}
          onClick={() => onNavigate("security")}
        />
        <ListRow
          icon={MiniIcons.referral}
          title="Refer & Earn"
          body="Referral rewards"
          onClick={() => onNavigate("referral")}
        />
      </Section>
    </Screen>
  );
}

function NotificationsScreen({
  rows,
  onMarkRead,
}: {
  rows: NotificationRow[];
  onMarkRead: (id?: string) => void;
}) {
  return (
    <Screen title="Notifications" subtitle="Wallet, deposit, P2P and referral alerts">
      <Button variant="secondary" onClick={() => onMarkRead()}>
        Mark All Read
      </Button>
      {rows.length ? (
        rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-white/10 bg-white/6 p-3">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-semibold">{row.title}</p>
                <p className="mt-1 text-sm text-slate-400">{row.body}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onMarkRead(row.id)}>
                Read
              </Button>
            </div>
          </div>
        ))
      ) : (
        <EmptyLine>You are all caught up.</EmptyLine>
      )}
    </Screen>
  );
}

function SecurityScreen({
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
  wallets: WalletRow[];
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
  onWalletBackup: (wallet: WalletRow) => void;
}) {
  const showForm = !enabled || changing;
  return (
    <Screen title="Security" subtitle="Login, transaction password and wallet backup">
      <Surface className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Transaction Password</h2>
            <p className="text-sm text-slate-400">{enabled ? "Enabled" : "Not set"}</p>
          </div>
          {enabled && !changing ? (
            <Button type="button" variant="secondary" onClick={() => setChanging(true)}>
              Change Password
            </Button>
          ) : null}
        </div>
        {showForm ? (
          <form className="space-y-3" onSubmit={onSubmit}>
            {enabled ? (
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current transaction password"
              />
            ) : null}
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="New transaction password"
            />
            <Input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Confirm new transaction password"
            />
            <div className="grid grid-cols-2 gap-2">
              {enabled ? (
                <Button type="button" variant="secondary" onClick={() => setChanging(false)}>
                  Cancel
                </Button>
              ) : null}
              <Button
                className="bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
                disabled={busy}
              >
                {enabled ? "Update Password" : "Set Password"}
              </Button>
            </div>
          </form>
        ) : null}
      </Surface>
      <Section title="Wallet Backup Status">
        {wallets.length ? (
          wallets.map((wallet) => (
            <SettingRow
              key={wallet.id}
              icon={MiniIcons.backup}
              title={wallet.name ?? "Wallet"}
              body={wallet.backup_status ?? "not_backed_up"}
              onClick={() => onWalletBackup(wallet)}
            />
          ))
        ) : (
          <EmptyLine>No personal wallets yet.</EmptyLine>
        )}
      </Section>
      <EmptyLine>
        Private-key export is unavailable in the Mini App until secure export architecture is
        configured.
      </EmptyLine>
    </Screen>
  );
}

function referralRatePercent(summary: ReferralSummary | null) {
  const setting = summary?.settings?.find((row) => row.key === "referral_direct_rate_percent");
  const value = Number(setting?.value ?? 0.2);
  return Number.isFinite(value) ? value : 0.2;
}

function ReferralScreen({ summary }: { summary: ReferralSummary | null }) {
  const rate = referralRatePercent(summary);
  return (
    <Screen title="Refer & Earn" subtitle="Earn from users you directly invite">
      <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
        <p className="text-xs uppercase text-slate-400">Referral Code</p>
        <p className="mono mt-2 text-2xl font-semibold">{summary?.referralCode ?? "Loading"}</p>
        <p className="mono mt-2 break-all text-sm text-slate-400">{summary?.referralLink ?? ""}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            className="bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
            onClick={() =>
              summary?.referralLink && copyText(summary.referralLink, "Referral link copied")
            }
          >
            Copy
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              summary?.referralLink &&
              navigator.share?.({ text: summary.referralLink }).catch(() => undefined)
            }
          >
            Share
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-300">
          Earn up to {rate.toFixed(2)}% on eligible trades completed by users you directly refer.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Rewards apply only to eligible completed P2P and WTRON trades. Wallet transfers do not
          earn referral commission.
        </p>
      </div>
      <MetricGrid
        items={[
          ["Direct referrals", String(summary?.invitedUsers?.length ?? 0)],
          ["Qualified referrals", String(summary?.qualifiedReferrals ?? 0)],
          ["Eligible volume", money(summary?.eligibleTradeVolume)],
          ["Pending earnings", money(summary?.pendingEarnings)],
          ["Paid earnings", money(summary?.paidEarnings)],
          ["Total earnings", money(summary?.totalReferralEarnings)],
        ]}
      />
      <Section title="Recent Referral Rewards">
        {summary?.rewards?.length ? (
          summary.rewards.slice(0, 10).map((reward, index) => (
            <div
              key={reward.id ?? index}
              className="rounded-xl border border-white/10 bg-white/6 p-3"
            >
              <MetricGrid
                items={[
                  ["Reward", `${money(reward.amount)} ${reward.currency ?? "USDT"}`],
                  ["Trade amount", money(reward.trade_amount_usdt)],
                  ["Rate", `${Number(reward.rate_percent ?? rate).toFixed(2)}%`],
                  ["Status", reward.status],
                ]}
              />
            </div>
          ))
        ) : (
          <EmptyLine>No referral rewards yet.</EmptyLine>
        )}
      </Section>
    </Screen>
  );
}

function BankAccountsScreen(props: {
  vendorMode?: boolean;
  methods: PaymentMethodRow[];
  upi: { upiId: string; holderName: string; label: string };
  setUpi: (value: { upiId: string; holderName: string; label: string }) => void;
  bank: {
    accountHolder: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    label: string;
  };
  setBank: (value: {
    accountHolder: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    label: string;
  }) => void;
  vendorBankRail: "all" | "imps" | "neft" | "rtgs";
  setVendorBankRail: (rail: "all" | "imps" | "neft" | "rtgs") => void;
  vendorLimits: { minInr: string; maxInr: string; dailyLimitInr: string };
  setVendorLimits: (value: { minInr: string; maxInr: string; dailyLimitInr: string }) => void;
  busy: boolean;
  onSaveUpi: (event: FormEvent) => void;
  onSaveBank: (event: FormEvent) => void;
  onDefault: (id: string) => void;
  onDelete: (id: string) => void;
  onVendorAction?: (
    id: string,
    action: "enable" | "disable" | "freeze" | "unfreeze" | "archive" | "default",
  ) => void;
}) {
  const limitFields = props.vendorMode ? (
    <div className="grid gap-2">
      {(
        [
          ["minInr", "Minimum per transaction (INR)"],
          ["maxInr", "Maximum per transaction (INR)"],
          ["dailyLimitInr", "Daily limit (INR)"],
        ] as const
      ).map(([key, label]) => (
        <FormField key={key} label={label}>
          <Input
            value={props.vendorLimits[key as keyof typeof props.vendorLimits]}
            onChange={(event) =>
              props.setVendorLimits({ ...props.vendorLimits, [key]: event.target.value })
            }
            placeholder={label}
            inputMode="decimal"
          />
        </FormField>
      ))}
    </div>
  ) : null;

  return (
    <Screen
      title={props.vendorMode ? "Vendor Payout Accounts" : "Payment Methods"}
      subtitle={
        props.vendorMode
          ? "Receiving accounts used for vendor sell listings and Direct Sell payouts"
          : "UPI and bank accounts for INR settlement"
      }
    >
      <form
        className="space-y-2 rounded-2xl border border-white/10 bg-white/6 p-3"
        onSubmit={props.onSaveUpi}
      >
        <h2 className="font-semibold">Add UPI</h2>
        <Input
          value={props.upi.upiId}
          onChange={(event) => props.setUpi({ ...props.upi, upiId: event.target.value })}
          placeholder="UPI ID"
        />
        <Input
          value={props.upi.holderName}
          onChange={(event) => props.setUpi({ ...props.upi, holderName: event.target.value })}
          placeholder="Account Holder"
        />
        <Input
          value={props.upi.label}
          onChange={(event) => props.setUpi({ ...props.upi, label: event.target.value })}
          placeholder="Label"
        />
        {limitFields}
        <Button
          className="w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
          disabled={props.busy}
        >
          Add UPI
        </Button>
      </form>
      <form
        className="space-y-2 rounded-2xl border border-white/10 bg-white/6 p-3"
        onSubmit={props.onSaveBank}
      >
        <h2 className="font-semibold">Add Bank Account</h2>
        {props.vendorMode ? (
          <select
            aria-label="Settlement rail"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/6 px-3 text-sm text-white outline-none"
            value={props.vendorBankRail}
            onChange={(event) =>
              props.setVendorBankRail(event.target.value as "all" | "imps" | "neft" | "rtgs")
            }
          >
            <option className="bg-slate-950" value="all">
              ALL - IMPS + NEFT + RTGS
            </option>
            <option className="bg-slate-950" value="imps">
              IMPS
            </option>
            <option className="bg-slate-950" value="neft">
              NEFT
            </option>
            <option className="bg-slate-950" value="rtgs">
              RTGS
            </option>
          </select>
        ) : null}
        <Input
          value={props.bank.accountHolder}
          onChange={(event) => props.setBank({ ...props.bank, accountHolder: event.target.value })}
          placeholder="Account Holder"
        />
        <Input
          value={props.bank.accountNumber}
          onChange={(event) => props.setBank({ ...props.bank, accountNumber: event.target.value })}
          placeholder="Account Number"
        />
        <Input
          value={props.bank.ifsc}
          onChange={(event) => props.setBank({ ...props.bank, ifsc: event.target.value })}
          placeholder="IFSC"
        />
        <Input
          value={props.bank.bankName}
          onChange={(event) => props.setBank({ ...props.bank, bankName: event.target.value })}
          placeholder="Bank Name"
        />
        <Input
          value={props.bank.label}
          onChange={(event) => props.setBank({ ...props.bank, label: event.target.value })}
          placeholder="Label"
        />
        {limitFields}
        <Button
          className="w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
          disabled={props.busy}
        >
          Add Bank
        </Button>
      </form>
      <Section title="Saved Methods">
        {props.methods.length ? (
          props.methods.map((method) => (
            <div key={method.id} className="rounded-xl border border-white/10 bg-white/6 p-3">
              <PaymentMethodSummary method={method} />
              {props.vendorMode ? (
                <MetricGrid
                  items={[
                    ["Supported rails", vendorSupportedRails(method).join(", ").toUpperCase()],
                    ["Min per transaction", money(method.min_inr, "INR")],
                    ["Max per transaction", money(method.max_inr, "INR")],
                    ["Daily limit", money(method.daily_limit_inr, "INR")],
                    ["Used today", money(method.daily_used_inr, "INR")],
                    ["Remaining", money(method.daily_remaining_inr, "INR")],
                    ["Status", String(method.status ?? "active")],
                    ["Default", method.is_default ? "Yes" : "No"],
                    ["Frozen", method.frozen ? "Yes" : "No"],
                  ]}
                />
              ) : null}
              <p className="mt-2 text-xs text-slate-500">
                {method.kind.toUpperCase()} {method.is_default ? "- Default" : ""}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => props.onDefault(method.id)}>
                  Set Default
                </Button>
                {props.vendorMode ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        props.onVendorAction?.(
                          method.id,
                          method.status === "disabled" ? "enable" : "disable",
                        )
                      }
                    >
                      {method.status === "disabled" ? "Enable" : "Disable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        props.onVendorAction?.(
                          method.id,
                          method.status === "frozen" ? "unfreeze" : "freeze",
                        )
                      }
                    >
                      {method.status === "frozen" ? "Unfreeze" : "Freeze"}
                    </Button>
                  </>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => props.onDelete(method.id)}>
                  {props.vendorMode ? "Archive" : "Delete"}
                </Button>
              </div>
            </div>
          ))
        ) : (
          <EmptyLine>No UPI or bank account yet.</EmptyLine>
        )}
      </Section>
    </Screen>
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
    <main className="space-y-4 pb-2">
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
      className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-slate-200"
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
function AssetCard({ total, profile }: { total: number; profile: ProfileSummary | null }) {
  return (
    <div className="rounded-xl bg-emerald-500 p-4 text-[#03130e] shadow-[0_14px_34px_-28px_rgba(16,185,129,0.75)] hover:bg-emerald-400">
      <p className="text-xs font-medium uppercase text-emerald-100">Total Assets</p>
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
function Surface({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.045] ${className}`}>
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
        <button className="text-xs font-medium text-emerald-300" onClick={() => void onAction?.()}>
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
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white/6 text-emerald-300 ">
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
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white/6 text-emerald-300">
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
    <p className="border-y border-white/10 py-3 text-center text-sm text-slate-400">{children}</p>
  );
}
function CompactEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-y border-white/10 py-3 text-center">
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
        <Icon className="mx-auto h-10 w-10 text-emerald-300" />
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
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/6 p-1">
      {items.map(([key, label]) => (
        <button
          key={key}
          className={`shrink-0 rounded-lg px-3 py-2 text-sm ${value === key ? "bg-emerald-500 text-[#03130e] hover:bg-emerald-400" : "text-slate-400"}`}
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
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/6 p-1">
      {items.map(([key, label]) => (
        <button
          key={key}
          className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${
            value === key ? "bg-emerald-500 text-[#03130e] hover:bg-emerald-400" : "text-slate-400"
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
                ? "border-emerald-500 bg-emerald-500/12"
                : "border-white/10 bg-white/6"
            }`}
            onClick={() => setSelectedId(method.id)}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{display.title}</p>
              {method.is_default ? <span className="text-xs text-emerald-300">Default</span> : null}
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
function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Surface className="space-y-3 p-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </Surface>
  );
}
function NetworkPicker({
  network,
  setNetwork,
  t,
}: {
  network: ChainNetwork;
  setNetwork: (value: ChainNetwork) => void;
  t: MiniT;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["trc20-nile", "trc20-mainnet"] as ChainNetwork[]).map((value) => {
        return (
          <Button
            key={value}
            type="button"
            variant={network === value ? "default" : "secondary"}
            onClick={() => setNetwork(value)}
          >
            {networkLabelForMini(value, t)}
          </Button>
        );
      })}
    </div>
  );
}
function TypeOption({
  active,
  icon,
  title,
  body,
  disabled,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  body: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`flex items-center gap-3 rounded-2xl border p-3 text-left ${
        disabled
          ? "border-white/10 bg-black/10 opacity-60"
          : active
            ? "border-emerald-500 bg-emerald-500/12"
            : "border-white/10 bg-white/5"
      }`}
      onClick={onClick}
    >
      <span>{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-xs text-slate-400">{body}</span>
      </span>
    </button>
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
    <div className="rounded-2xl bg-slate-100 p-3">
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
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusPill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "muted" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-500/12 text-emerald-300"
      : tone === "warning"
        ? "bg-amber-500/12 text-amber-300"
        : tone === "danger"
          ? "bg-red-500/12 text-red-300"
          : "bg-white/8 text-slate-400";
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${toneClass}`}>
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
        className="mx-auto max-h-[82vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0D121C] p-3 shadow-[0_18px_50px_-35px_rgba(0,0,0,0.9)]"
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
                wallet.id === selectedWalletId ? "bg-emerald-500/12" : "bg-white/5"
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
            className="bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
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
      className={`min-w-[74%] snap-center rounded-2xl border p-3 text-left ${active ? "border-emerald-500 bg-emerald-500/12" : "border-white/10 bg-white/6"}`}
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
          <span className="rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-semibold text-[#03130e]">
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
  const network = t ? networkLabelForMini(wallet.network, t) : networkConfig(wallet.network).label;
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
        <Icon className="h-5 w-5 text-emerald-300" />
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
        <Icon className="h-5 w-5 text-emerald-300" />
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
function AdCard({ ad, onTake }: { ad: AdRow; onTake: () => void }) {
  return (
    <Surface className="p-4">
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{ad.merchants?.display_name ?? "Advertiser"}</p>
          <p className="text-xs text-slate-400">
            {completionRate(ad)} completion /{" "}
            {(ad.payment_methods ?? ["upi"]).join(", ").toUpperCase()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Rate</p>
          <p className="font-semibold tabular-nums">{money(ad.price_inr, "INR")}</p>
        </div>
      </div>
      <MetricGrid
        items={[
          ["Available", money(ad.available_usdt)],
          ["Min", money(ad.min_order_inr, "INR")],
          ["Max", money(ad.max_order_inr, "INR")],
          ["Side", ad.side.toUpperCase()],
        ]}
      />
      <Button
        className="mt-3 w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
        onClick={onTake}
      >
        {ad.side === "sell" ? "Buy USDT" : "Sell USDT"}
      </Button>
    </Surface>
  );
}
function VendorCard({ listing, onBuy }: { listing: VendorListingRow; onBuy: () => void }) {
  return (
    <Surface className="p-4">
      <div className="flex justify-between">
        <div className="min-w-0">
          <p className="font-semibold">{listing.trading_vendors?.name ?? "Verified Vendor"}</p>
          <p className="text-xs text-slate-400">
            {(listing.payment_rails ?? []).join(", ").toUpperCase()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Rate</p>
          <p className="font-semibold tabular-nums">{money(listing.rate_inr, "INR")}</p>
        </div>
      </div>
      <MetricGrid
        items={[
          ["Available", money(listing.available_usdt)],
          ["Min", money(listing.min_order_inr, "INR")],
          ["Max", money(listing.max_order_inr, "INR")],
          ["Orders", String(listing.trading_vendors?.completed_orders ?? 0)],
        ]}
      />
      <Button
        className="mt-3 w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
        onClick={onBuy}
      >
        Buy from Vendor
      </Button>
    </Surface>
  );
}

function DirectSellDetailScreen(props: {
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
                className="w-full bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
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
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
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
                        className="bg-emerald-500 text-[#03130e] hover:bg-emerald-400"
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

function OrderList({ orders, empty }: { orders: OrderRow[]; empty: string }) {
  return (
    <>
      {orders.length ? (
        orders.map((order) => <OrderCard key={order.id} order={order} />)
      ) : (
        <EmptyLine>{empty}</EmptyLine>
      )}
    </>
  );
}
function OrderCard({ order }: { order: OrderRow }) {
  return (
    <Surface className="p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="mono text-sm">{order.order_ref ?? shortenHash(order.id)}</p>
        <StatusBadge status={String(order.status ?? "created")} />
      </div>
      <MetricGrid
        items={[
          ["Type", order.side ?? "P2P"],
          ["USDT", money(order.usdt_amount)],
          ["INR", money(order.total_inr, "INR")],
          [
            "Timer",
            order.payment_deadline ? new Date(order.payment_deadline).toLocaleTimeString() : "None",
          ],
        ]}
      />
    </Surface>
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
                  incoming ? "text-emerald-300" : "text-white"
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
function GenericRow({ row }: { row: Record<string, unknown> }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/6 p-3">
      <p className="mono text-sm">{String(row["order_ref"] ?? row["id"] ?? "Trade")}</p>
      <MetricGrid
        items={[
          ["USDT", money(row["amount_usdt"] ?? row["usdt_amount"])],
          ["INR", money(row["expected_inr"] ?? row["total_inr"], "INR")],
          ["Rate", money(row["rate_inr"], "INR")],
          ["Status", String(row["status"] ?? "created")],
        ]}
      />
    </div>
  );
}
function MiniChart({ rows }: { rows: { date: string; usdt: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.usdt ?? 0)));
  return (
    <div className="flex h-32 items-end gap-1 rounded-2xl border border-white/10 bg-white/6 p-3">
      {rows.length ? (
        rows
          .slice(-18)
          .map((row, index) => (
            <div
              key={`${row.date}-${index}`}
              className="flex-1 rounded-t bg-emerald-500"
              style={{ height: `${Math.max(4, (Number(row.usdt ?? 0) / max) * 100)}%` }}
            />
          ))
      ) : (
        <p className="m-auto text-sm text-slate-400">No chart data</p>
      )}
    </div>
  );
}

function PendingVendorScreen({
  status,
  busy,
  onRefresh,
}: {
  status: VendorApprovalStatus;
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="grid min-h-[80vh] place-items-center pb-10 text-center">
      <div className="w-full rounded-3xl border border-white/10 bg-white/6 p-6">
        <WtronMark className="mx-auto h-14 w-14" />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-violet-300">
          Vendor application
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          {status === "rejected"
            ? "Application Rejected"
            : status === "disabled" || status === "suspended"
              ? "Vendor Access Disabled"
              : "Pending Review"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Vendor financial tools remain blocked until WTRON approves the application. You can
          refresh this status after admin review.
        </p>
        <Button className="mt-6 w-full bg-red-500 text-white hover:bg-red-400" onClick={onRefresh}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Refresh Status
        </Button>
      </div>
    </div>
  );
}

function VendorBottomNav({
  screen,
  setScreen,
}: {
  screen: MiniScreen;
  setScreen: (screen: MiniScreen) => void;
}) {
  const items: Array<[VendorPrimaryTab, string, MiniIcon]> = [
    ["home", "Home", CircleDollarSign],
    ["trade", "Trade", MiniIcons.swap],
    ["wallet", "Wallet", MiniIcons.wallet],
    ["orders", "Orders", FileText],
    ["more", "More", MoreHorizontal],
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-[#05070B]/94 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 backdrop-blur-xl">
      <div className="mx-auto grid max-w-md grid-cols-5 rounded-2xl bg-[#0D121C]/95 p-1">
        {items.map(([key, label, Icon]) => (
          <button
            key={key}
            className={`relative rounded-2xl px-1 py-2 text-[11px] font-medium transition ${
              screen === key ? "text-violet-300" : "text-slate-500"
            }`}
            onClick={() => setScreen(key)}
          >
            {screen === key ? (
              <span className="absolute inset-x-5 top-1 h-0.5 rounded-full bg-violet-400" />
            ) : null}
            <Icon className="mx-auto mb-1 h-5 w-5" />
            {label}
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
}: {
  tab: PrimaryTab;
  setTab: (tab: PrimaryTab) => void;
  t: MiniT;
}) {
  const items: Array<[PrimaryTab, string, MiniIcon]> = [
    ["home", t("home"), CircleDollarSign],
    ["p2p", "P2P", MiniIcons.p2p],
    ["trade", t("trade"), MiniIcons.swap],
    ["wallet", t("wallet"), MiniIcons.wallet],
    ["more", t("more"), MoreHorizontal],
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-[#05070B]/94 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 backdrop-blur-xl">
      <div className="mx-auto grid max-w-md grid-cols-5 rounded-2xl bg-[#0D121C]/95 p-1">
        {items.map(([key, label, Icon]) => (
          <button
            key={key}
            className={`relative rounded-2xl px-1 py-2 text-[11px] font-medium transition ${
              tab === key ? "text-emerald-300" : "text-slate-500"
            }`}
            onClick={() => setTab(key)}
          >
            {tab === key ? (
              <span className="absolute inset-x-5 top-1 h-0.5 rounded-full bg-emerald-400" />
            ) : null}
            <Icon className="mx-auto mb-1 h-5 w-5" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
