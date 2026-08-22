import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  ChevronLeft,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  UserRound,
  Wallet,
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
import { createDirectSellOrder } from "@/lib/direct-sell.functions";
import {
  confirmDirectSellPaymentItem,
  disputeDirectSellPaymentItem,
} from "@/lib/direct-sell-admin.functions";
import { createP2pAd, createP2pOrderFromAd } from "@/lib/p2p.functions";
import {
  createWallet,
  importWallet,
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
import { formatUsdt, networkConfig, shortenHash, type ChainNetwork } from "@/lib/chain";
import { createMiniAppClientId, isMiniAppSessionError } from "@/lib/mini-app-runtime";
import { onChainSendEnabled, selectActiveWallet, walletDisplayBalance } from "@/lib/wallet-state";

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
type MiniScreen =
  | PrimaryTab
  | "wallet-create"
  | "wallet-import"
  | "wallet-detail"
  | "wallet-receive"
  | "wallet-backup"
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
  is_default?: boolean | null;
  custody?: string | null;
  wallet_type?: string | null;
  backup_status?: string | null;
  gas_sponsorship_status?: string | null;
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
  const confirmDirectSellItem = useServerFn(confirmDirectSellPaymentItem);
  const disputeDirectSellItem = useServerFn(disputeDirectSellPaymentItem);
  const createPersonalWallet = useServerFn(createWallet);
  const importPersonalWallet = useServerFn(importWallet);
  const setMiniDefaultWallet = useServerFn(setDefaultWallet);
  const setMiniTransactionPassword = useServerFn(setWalletTransactionPassword);
  const revealPhrase = useServerFn(revealRecoveryPhrase);
  const refreshBalance = useServerFn(refreshWalletBalance);
  const loadPaymentMethods = useServerFn(listPaymentMethods);
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
  const [authMode, setAuthMode] = useState<"login" | "register">(
    search.auth as "login" | "register",
  );
  const [initData, setInitData] = useState("");
  const [handoffToken, setHandoffToken] = useState(search.handoff ?? "");
  const [launchChecked, setLaunchChecked] = useState(false);
  const [linked, setLinked] = useState(false);
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
  const [selectedDirectSellId, setSelectedDirectSellId] = useState("");
  const [createdDirectSell, setCreatedDirectSell] = useState<DirectSellOrderCreated | null>(null);

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
  const [vendorAmount, setVendorAmount] = useState("");
  const [vendorRail, setVendorRail] = useState<"upi" | "imps" | "neft" | "rtgs">("upi");
  const [createWalletName, setCreateWalletName] = useState("Main Wallet");
  const [createWalletType, setCreateWalletType] = useState<WalletType>("standard");
  const [createWalletNetwork, setCreateWalletNetwork] = useState<ChainNetwork>("trc20-nile");
  const [importNetworkRequired, setImportNetworkRequired] = useState<{
    reason: "multiple_active" | "no_activity";
    address: string;
  } | null>(null);
  const [walletPassword, setWalletPassword] = useState("");
  const [walletPasswordConfirm, setWalletPasswordConfirm] = useState("");
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

  const profile = overview?.profile ?? null;
  const wallets = overview?.wallets ?? [];
  const selectedWallet = selectActiveWallet(wallets, selectedWalletId);
  const selectedAddress = safeAddress(selectedWallet?.address);
  const primaryTab = tabForScreen(screen);
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
  const selectedDirectSell =
    directSellOrders.find((order) => order.id === selectedDirectSellId) ??
    (createdDirectSell
      ? ({
          id: createdDirectSell.order_id,
          order_ref: createdDirectSell.order_ref,
          deposit_request_id: createdDirectSell.deposit_request_id,
          expected_usdt: createdDirectSell.amount_usdt ?? directSellAmount,
          expected_inr: createdDirectSell.expected_inr,
          assigned_company_address: createdDirectSell.wallet_address,
          status: "waiting_for_usdt",
        } satisfies DirectSellOrderRow)
      : null);
  const defaultPaymentMethod =
    paymentMethods.find((method) => method.id === selectedPaymentMethodId) ??
    paymentMethods.find((method) => method.is_default) ??
    paymentMethods[0] ??
    null;
  const selectedActiveUpi =
    activeUpiMethods.find((method) => method.id === selectedPaymentMethodId) ??
    activeUpiMethods.find((method) => method.is_default) ??
    activeUpiMethods[0] ??
    null;

  async function loadAuthenticatedData(nextScreen: MiniScreen, launch = initData) {
    const [
      homeResult,
      walletResult,
      methodsResult,
      vendorsResult,
      analyticsResult,
      historyResult,
      referralResult,
    ] = await Promise.allSettled([
      loadHome({ data: { initData: launch } }),
      loadWallet({ data: { initData: launch } }),
      loadPaymentMethods(),
      loadVendors(),
      loadAnalytics({ data: { range: "30d" } }),
      loadTradeHistory(),
      loadReferral(),
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
      const { data: sessionData } = await supabase.auth.getSession();
      if (verified.linked && (handoff || !sessionData.session || !verified.authorized)) {
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
        setHasSession(Boolean(sessionData.session));
      }
      if (!verified.linked) return;
      await loadAuthenticatedData(nextScreen, launch);
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
    if (!initData || !linked) return;
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
  }, [createTelegramSession, initData, linked]);

  useEffect(() => {
    if (!linked || !initData) return;
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
  }, [linked, initData, screen]);

  useEffect(() => {
    if (!selectedWalletId && selectedWallet?.id) setSelectedWalletId(selectedWallet.id);
  }, [selectedWallet?.id, selectedWalletId]);

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

  useEffect(() => {
    if (!selectedWallet?.id || !hasSession) {
      setWalletTransactions([]);
      return;
    }
    void supabase
      .from("wallet_transactions" as never)
      .select(
        "id, wallet_id, direction, kind, currency, amount, fee, network, txid, status, memo, created_at",
      )
      .eq("wallet_id", selectedWallet.id as never)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) {
          toast.error("Unable to load selected wallet history");
          setWalletTransactions([]);
        } else {
          setWalletTransactions((data ?? []) as unknown as TransactionRow[]);
        }
      });
  }, [selectedWallet?.id, hasSession]);

  useEffect(() => {
    if (screen !== "wallet-detail" || !selectedWallet?.id || !hasSession) return;
    void refreshBalance({ data: { walletId: selectedWallet.id } }).then(
      () => void refresh("wallet-detail"),
      () => undefined,
    );
  }, [screen, selectedWallet?.id, hasSession]);

  useEffect(() => {
    const webApp =
      typeof window !== "undefined" ? (window as TelegramWindow).Telegram?.WebApp : undefined;
    const backable = !["home", "p2p", "trade", "wallet", "more"].includes(screen);
    if (!webApp?.BackButton) return;
    const handler = () => setScreen(tabForScreen(screen));
    if (backable) webApp.BackButton.show();
    else webApp.BackButton.hide();
    webApp.BackButton.onClick(handler);
    return () => webApp.BackButton?.offClick(handler);
  }, [screen]);

  async function navigate(next: MiniScreen) {
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
      if (authMode === "login") await loginTelegram({ data: { initData, email, password } });
      else await registerTelegram({ data: { initData, email, password } });
      const session = await createTelegramSession({ data: { initData } });
      await supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      setLinked(true);
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
    if (!selectedActiveUpi?.id) {
      toast.error("Add UPI ID first");
      return;
    }
    setBusy(true);
    try {
      const order = await createDirectSell({
        data: { amount, paymentMethodId: selectedActiveUpi.id },
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
    setBusy(true);
    try {
      await setMiniTransactionPassword({ data: { password: walletPassword } });
      setWalletPassword("");
      setWalletPasswordConfirm("");
      toast.success("Transaction password saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save password");
    } finally {
      setBusy(false);
    }
  }

  async function ensurePasswordForWalletAction(passwordValue: string) {
    try {
      await setMiniTransactionPassword({ data: { password: passwordValue } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.toLowerCase().includes("incorrect")) throw error;
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
      await ensurePasswordForWalletAction(walletPassword);
      const created = await createPersonalWallet({
        data: {
          name: createWalletName,
          network: createWalletNetwork,
          walletType: createWalletType,
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
      toast.error(error instanceof Error ? error.message : "Could not create wallet");
    } finally {
      setBusy(false);
    }
  }

  async function submitImportWallet(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await ensurePasswordForWalletAction(walletPassword);
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
          ? "Existing wallet opened"
          : "Wallet imported",
      );
      await refresh("wallet-detail");
      setScreen("wallet-detail");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import wallet");
    } finally {
      setBusy(false);
    }
  }

  async function activateWallet(wallet: WalletRow) {
    if (!wallet.id) return;
    setSelectedWalletId(wallet.id);
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
      await refreshBalance({ data: { walletId: selectedWallet.id } });
      await refresh("wallet-detail");
      toast.success("On-chain balance refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh balance");
    } finally {
      setBusy(false);
    }
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
      await saveUpi({ data: { ...upiForm, isDefault: paymentMethods.length === 0 } });
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
      await saveBank({
        data: {
          ...bankForm,
          supportedRails: ["IMPS", "NEFT", "RTGS"],
          isDefault: paymentMethods.length === 0,
        },
      });
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
      <MiniFrame>
        <div className="grid min-h-[70vh] place-items-center text-center">
          <div>
            <WtronMark className="mx-auto h-14 w-14" />
            <Loader2 className="mx-auto mt-5 h-6 w-6 animate-spin text-blue-400" />
            <p className="mt-4 text-sm text-slate-400">Connecting securely to WTRON</p>
          </div>
        </div>
      </MiniFrame>
    );
  }

  if (!initData) {
    return (
      <MiniFrame>
        <EmptyState
          icon={ShieldCheck}
          title="Open WTRON through @wtron_bot"
          body="Telegram launch data is required for secure account linking."
          action={
            <a
              className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
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
      <MiniFrame>
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

  if (!linked) {
    return (
      <MiniFrame>
        <AuthScreen
          authMode={authMode}
          setAuthMode={setAuthMode}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          confirmPassword={confirmPassword}
          setConfirmPassword={setConfirmPassword}
          busy={busy}
          onSubmit={submitAuth}
        />
      </MiniFrame>
    );
  }

  return (
    <MiniFrame>
      <div className="space-y-5 pb-28">
        <MiniHeader
          profile={profile}
          onNotifications={() => void navigate("notifications")}
          onProfile={() => void navigate("profile")}
        />
        {!["home", "p2p", "trade", "wallet", "more"].includes(screen) ? (
          <BackButton onClick={() => setScreen(tabForScreen(screen))} />
        ) : null}
        {screen === "home" ? (
          <HomeScreen
            total={totalAssets}
            profile={profile}
            orders={overview?.activeOrders ?? []}
            transactions={overview?.transactions ?? []}
            ads={ads}
            onNavigate={navigate}
          />
        ) : null}
        {screen === "wallet" ? (
          <WalletScreen
            wallets={wallets}
            selectedWallet={selectedWallet}
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
            onSubmit={submitCreateWallet}
          />
        ) : null}
        {screen === "wallet-import" ? (
          <WalletImportScreen
            name={createWalletName}
            setName={setCreateWalletName}
            phrase={importPhrase}
            setPhrase={setImportPhrase}
            walletType={createWalletType}
            setWalletType={setCreateWalletType}
            network={createWalletNetwork}
            setNetwork={setCreateWalletNetwork}
            networkRequired={importNetworkRequired}
            password={walletPassword}
            setPassword={setWalletPassword}
            busy={busy}
            onSubmit={submitImportWallet}
          />
        ) : null}
        {screen === "wallet-detail" ? (
          <WalletDetailScreen
            wallet={selectedWallet}
            transactions={walletTransactions}
            busy={busy}
            onNavigate={navigate}
            onRefresh={() => void refreshSelectedWalletBalance()}
            onSetDefault={() => selectedWallet && void activateWallet(selectedWallet)}
          />
        ) : null}
        {screen === "wallet-receive" ? (
          <ReceiveScreen
            wallet={selectedWallet}
            asset={receiveAsset}
            setAsset={setReceiveAsset}
            qr={walletQr}
          />
        ) : null}
        {screen === "wallet-backup" ? (
          <BackupScreen
            wallet={selectedWallet}
            password={backupPassword}
            setPassword={setBackupPassword}
            revealedPhrase={revealedPhrase}
            busy={busy}
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
            onCopy={(value) => copyText(value, "Address copied")}
            onConfirm={(itemId) => void confirmDirectSellPayment(itemId)}
            onDispute={(itemId) => void disputeDirectSellPayment(itemId)}
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
          />
        ) : null}
        {screen === "p2p" ? (
          <P2pScreen
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
            tab={tradeTab}
            setTab={setTradeTab}
            amount={directSellAmount}
            setAmount={setDirectSellAmount}
            paymentMethods={activeUpiMethods}
            selectedPaymentMethodId={selectedPaymentMethodId}
            setSelectedPaymentMethodId={setSelectedPaymentMethodId}
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
        {screen === "more" ? <MoreScreen onNavigate={navigate} /> : null}
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
            methods={paymentMethods}
            upi={upiForm}
            setUpi={setUpiForm}
            bank={bankForm}
            setBank={setBankForm}
            busy={busy}
            onSaveUpi={submitUpi}
            onSaveBank={submitBank}
            onDefault={(id) =>
              void makePaymentDefault({ data: { id } }).then(() => refresh("bank-accounts"))
            }
            onDelete={(id) =>
              void removePaymentMethod({ data: { id } }).then(() => refresh("bank-accounts"))
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
      <BottomNav tab={primaryTab} setTab={(next) => void navigate(next)} />
    </MiniFrame>
  );
}

function MiniFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#05070B] px-4 pt-4 text-white antialiased">
      {children}
    </div>
  );
}

function MiniHeader({
  profile,
  onNotifications,
  onProfile,
}: {
  profile: ProfileSummary | null;
  onNotifications: () => void;
  onProfile: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-3 pt-[max(env(safe-area-inset-top),0px)]">
      <div className="flex items-center gap-3">
        <WtronMark />
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-blue-300 uppercase">
            WTRON
          </p>
          <p className="text-sm text-slate-300">
            {profile?.full_name || profile?.email || "Trader"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <IconButton icon={Bell} label="Notifications" onClick={onNotifications} />
        <IconButton icon={UserRound} label="Profile" onClick={onProfile} />
      </div>
    </header>
  );
}

function AuthScreen(props: {
  authMode: "login" | "register";
  setAuthMode: (mode: "login" | "register") => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="space-y-6 pt-10">
      <WtronMark className="h-14 w-14" />
      <div>
        <p className="text-xs font-semibold tracking-[0.2em] text-blue-300 uppercase">
          Telegram secure access
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">
          {props.authMode === "login" ? "Login to WTRON" : "Create trader account"}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Your Telegram identity is verified server-side, then linked to the same WTRON account used
          on web.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/6 p-1">
        <button
          className={`rounded-xl px-3 py-2 text-sm ${props.authMode === "login" ? "bg-blue-600 text-white" : "text-slate-400"}`}
          onClick={() => props.setAuthMode("login")}
        >
          Login
        </button>
        <button
          className={`rounded-xl px-3 py-2 text-sm ${props.authMode === "register" ? "bg-blue-600 text-white" : "text-slate-400"}`}
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
        <Button className="w-full bg-blue-600 hover:bg-blue-500" disabled={props.busy}>
          {props.busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="mr-2 h-4 w-4" />
          )}
          {props.authMode === "login" ? "Login and link" : "Register and link"}
        </Button>
      </form>
    </div>
  );
}

function HomeScreen({
  total,
  profile,
  orders,
  transactions,
  ads,
  onNavigate,
}: {
  total: number;
  profile: ProfileSummary | null;
  orders: OrderRow[];
  transactions: TransactionRow[];
  ads: AdRow[];
  onNavigate: (screen: MiniScreen) => Promise<void>;
}) {
  return (
    <Screen title="Home" subtitle="Wallet, P2P and WTRON trading overview">
      <AssetCard total={total} profile={profile} />
      <div className="grid grid-cols-5 gap-2">
        <Action
          icon={MiniIcons.receive}
          label="Receive"
          onClick={() => onNavigate("wallet-receive")}
        />
        <Action icon={MiniIcons.send} label="Send" onClick={() => onNavigate("send")} />
        <Action
          icon={MiniIcons.upi}
          label="Deposit"
          onClick={() => onNavigate("platform-deposit")}
        />
        <Action icon={MiniIcons.p2p} label="Buy" onClick={() => onNavigate("p2p")} />
        <Action icon={MiniIcons.trade} label="Sell" onClick={() => onNavigate("trade")} />
      </div>
      <Section title="Active Orders" action="View all" onAction={() => onNavigate("orders")}>
        {orders.length ? (
          orders.slice(0, 3).map((order) => <OrderCard key={order.id} order={order} />)
        ) : (
          <EmptyLine>No active orders. Browse P2P or WTRON Trade.</EmptyLine>
        )}
      </Section>
      <Section title="Current P2P Orders" action="Market" onAction={() => onNavigate("p2p")}>
        {ads.length ? (
          ads
            .slice(0, 2)
            .map((ad) => <AdCard key={ad.id} ad={ad} onTake={() => onNavigate("p2p")} />)
        ) : (
          <EmptyLine>No live marketplace cards loaded yet.</EmptyLine>
        )}
      </Section>
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
  onNavigate,
  onSelect,
}: {
  wallets: WalletRow[];
  selectedWallet: WalletRow | null;
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
      <Screen title="My Wallets" subtitle="Personal non-custodial TRON wallets">
        <div className="rounded-3xl border border-blue-500/25 bg-blue-600/12 p-6 text-center">
          <Wallet className="mx-auto h-10 w-10 text-blue-300" />
          <h2 className="mt-4 text-xl font-semibold tracking-normal">
            Your crypto wallet starts here.
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Create a secure TRON wallet to receive USDT and TRX.
          </p>
          <div className="mt-5 grid gap-2">
            <Button className="bg-blue-600" onClick={() => onNavigate("wallet-create")}>
              Create Wallet
            </Button>
            <Button variant="secondary" onClick={() => onNavigate("wallet-import")}>
              Import Existing Wallet
            </Button>
          </div>
        </div>
      </Screen>
    );
  }
  return (
    <Screen title="My Wallets" subtitle="Personal wallet only. Platform deposits are separate.">
      <div className="rounded-3xl border border-white/10 bg-white p-5 text-slate-950">
        <p className="text-xs font-semibold uppercase text-slate-500">Total Personal Assets</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <TokenMetric icon={<UsdtIcon />} label="USDT" value={money(total)} sub="TRC20 on TRON" />
          <TokenMetric
            icon={<TronIcon />}
            label="TRX"
            value={money(totalTrx, "TRX")}
            sub="TRON native"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button className="bg-blue-600" onClick={() => onNavigate("wallet-create")}>
          <Plus className="mr-2 h-4 w-4" />
          Create Wallet
        </Button>
        <Button variant="secondary" onClick={() => onNavigate("wallet-import")}>
          Import Wallet
        </Button>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2">
        {wallets.map((wallet) => (
          <WalletCard
            key={wallet.id}
            wallet={wallet}
            active={wallet.id === selectedWallet?.id}
            onSelect={() => onSelect(wallet)}
            onOpen={() => onNavigate("wallet-detail")}
          />
        ))}
      </div>
      <Section title="Selected Wallet">
        <WalletSummary
          wallet={selectedWallet}
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
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Screen title="Create Wallet" subtitle="BIP39 TRON derivation m/44'/195'/0'/0/0">
      <form className="space-y-4" onSubmit={props.onSubmit}>
        <FormCard title="1. Wallet Name">
          <Input
            value={props.name}
            onChange={(event) => props.setName(event.target.value)}
            placeholder="Main Wallet"
          />
        </FormCard>
        <FormCard title="2. Choose Wallet Type">
          <div className="grid gap-2">
            <TypeOption
              active={props.walletType === "standard"}
              icon={<TronIcon />}
              title="Standard TRON Wallet"
              body="Normal TRON/TRC20 personal wallet"
              onClick={() => props.setWalletType("standard")}
            />
            <TypeOption
              active={props.walletType === "gasfree"}
              icon={<GasFreeIcon />}
              title="GasFree Wallet"
              body="Resource-sponsored mode. Sponsorship status depends on backend configuration."
              onClick={() => props.setWalletType("gasfree")}
            />
          </div>
        </FormCard>
        <FormCard title="3. Network">
          <NetworkPicker network={props.network} setNetwork={props.setNetwork} />
        </FormCard>
        <FormCard title="4. Transaction Password">
          <div className="space-y-2">
            <Input
              type="password"
              value={props.password}
              onChange={(event) => props.setPassword(event.target.value)}
              placeholder="Password"
            />
            <Input
              type="password"
              value={props.confirm}
              onChange={(event) => props.setConfirm(event.target.value)}
              placeholder="Confirm password"
            />
          </div>
        </FormCard>
        <Button className="w-full bg-blue-600" disabled={props.busy}>
          {props.busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create Wallet
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
  walletType: WalletType;
  setWalletType: (value: WalletType) => void;
  network: ChainNetwork;
  setNetwork: (value: ChainNetwork) => void;
  networkRequired: { reason: "multiple_active" | "no_activity"; address: string } | null;
  password: string;
  setPassword: (value: string) => void;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Screen
      title="Import Wallet"
      subtitle="Import with recovery phrase using the same TRON derivation path"
    >
      <form className="space-y-4" onSubmit={props.onSubmit}>
        <FormCard title="Wallet Name">
          <Input
            value={props.name}
            onChange={(event) => props.setName(event.target.value)}
            placeholder="Trading Wallet"
          />
        </FormCard>
        <FormCard title="Wallet Type">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={props.walletType === "standard" ? "default" : "secondary"}
              onClick={() => props.setWalletType("standard")}
            >
              Standard
            </Button>
            <Button
              type="button"
              variant={props.walletType === "gasfree" ? "default" : "secondary"}
              onClick={() => props.setWalletType("gasfree")}
            >
              GasFree
            </Button>
          </div>
        </FormCard>
        <FormCard title="Network">
          {props.networkRequired ? (
            <div className="mb-3 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-xs text-slate-200">
              <p className="font-semibold text-white">
                {props.networkRequired.reason === "multiple_active"
                  ? "Activity was found on more than one TRON network."
                  : "No activity was found on the supported TRON networks."}
              </p>
              <p className="mt-1">
                Confirm the correct network for {shortenHash(props.networkRequired.address)} to
                finish import.
              </p>
            </div>
          ) : null}
          <NetworkPicker network={props.network} setNetwork={props.setNetwork} />
        </FormCard>
        <FormCard title="Recovery Phrase">
          <textarea
            className="min-h-28 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-blue-500"
            value={props.phrase}
            onChange={(event) => props.setPhrase(event.target.value)}
            placeholder="Enter recovery phrase"
          />
        </FormCard>
        <FormCard title="Transaction Password">
          <Input
            type="password"
            value={props.password}
            onChange={(event) => props.setPassword(event.target.value)}
            placeholder="Password"
          />
        </FormCard>
        <Button className="w-full bg-blue-600" disabled={props.busy}>
          Import Wallet
        </Button>
      </form>
    </Screen>
  );
}

function WalletDetailScreen({
  wallet,
  transactions,
  busy,
  onNavigate,
  onRefresh,
  onSetDefault,
}: {
  wallet: WalletRow | null;
  transactions: TransactionRow[];
  busy: boolean;
  onNavigate: (screen: MiniScreen) => Promise<void>;
  onRefresh: () => void;
  onSetDefault: () => void;
}) {
  if (!wallet)
    return (
      <Screen title="Wallet Detail" subtitle="Select a wallet first">
        <EmptyLine>No wallet selected.</EmptyLine>
      </Screen>
    );
  const balance = walletDisplayBalance(wallet);
  return (
    <Screen title={wallet.name ?? "Wallet"} subtitle="TRON personal wallet detail">
      <div className="rounded-3xl border border-white/10 bg-blue-600/18 p-5">
        <div className="flex items-center justify-between gap-3">
          <NetworkBadge wallet={wallet} />
          <StatusBadge status={wallet.wallet_type ?? "standard"} />
        </div>
        <p className="mt-4 text-xs text-slate-400">Address</p>
        <p className="mono mt-1 break-all text-sm">{wallet.address}</p>
        <p className="mt-5 text-xs text-slate-400">Total Wallet Value</p>
        <p className="mono mt-1 text-3xl font-semibold">{money(balance)}</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Action
          icon={MiniIcons.receive}
          label="Receive"
          onClick={() => onNavigate("wallet-receive")}
        />
        <Action icon={MiniIcons.send} label="Send" onClick={() => onNavigate("send")} />
        <Action icon={MiniIcons.p2p} label="Buy" onClick={() => onNavigate("p2p")} />
        <Action icon={MiniIcons.history} label="History" onClick={() => onNavigate("history")} />
      </div>
      <Section title="Assets" action="Refresh" onAction={onRefresh}>
        <AssetRow
          icon={<UsdtIcon />}
          symbol="USDT"
          name="Tether USD"
          network="TRC20"
          amount={`${money(balance)} USDT`}
        />
        <AssetRow
          icon={<TronIcon />}
          symbol="TRX"
          name="TRON"
          network="TRON"
          amount={`${money(wallet.onchain_trx_balance ?? 0, "TRX")} TRX`}
        />
      </Section>
      <Section title="Wallet Settings">
        <SettingRow
          icon={MiniIcons.backup}
          title="Backup"
          body={wallet.backup_status ?? "not_backed_up"}
          onClick={() => onNavigate("wallet-backup")}
        />
        <SettingRow
          icon={MiniIcons.security}
          title="Security"
          body="Transaction password protected"
          onClick={() => onNavigate("security")}
        />
        <SettingRow
          icon={MiniIcons.wallet}
          title="Set Default"
          body={wallet.is_default ? "Already active" : "Make active wallet"}
          onClick={onSetDefault}
        />
        <SettingRow
          icon={ExternalLink}
          title="Explorer"
          body="Open TRON explorer"
          onClick={() => {
            const network = networkConfig(wallet.network);
            const address = safeAddress(wallet.address);
            window.open(network.explorerAddress(address), "_blank", "noopener,noreferrer");
          }}
        />
      </Section>
      <TransactionList
        title="Selected Wallet History"
        rows={transactions}
        empty="No on-chain wallet activity for this wallet yet."
      />
      {busy ? <p className="text-center text-xs text-slate-500">Working...</p> : null}
    </Screen>
  );
}

function ReceiveScreen({
  wallet,
  asset,
  setAsset,
  qr,
}: {
  wallet: WalletRow | null;
  asset: ReceiveAsset;
  setAsset: (asset: ReceiveAsset) => void;
  qr: string;
}) {
  const address = safeAddress(wallet?.address);
  return (
    <Screen
      title="Personal Wallet Receive"
      subtitle="This is not the WTRON platform deposit address"
    >
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={asset === "USDT" ? "default" : "secondary"}
          onClick={() => setAsset("USDT")}
        >
          <UsdtIcon className="mr-2 h-5 w-5" />
          USDT
        </Button>
        <Button variant={asset === "TRX" ? "default" : "secondary"} onClick={() => setAsset("TRX")}>
          <TronIcon className="mr-2 h-5 w-5" />
          TRX
        </Button>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white p-4 text-center text-slate-950">
        <div className="mx-auto grid h-60 w-60 max-w-full place-items-center rounded-2xl bg-white">
          {qr ? (
            <img src={qr} alt="Receive QR" className="h-full w-full" />
          ) : (
            <MiniIcons.upi className="h-10 w-10 text-slate-400" />
          )}
        </div>
        <p className="mt-4 text-sm font-semibold">
          {asset === "USDT" ? "USDT / TRC20" : "TRX / TRON Network"}
        </p>
        <p className="mono mt-2 break-all text-sm">{address || "No wallet selected"}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button className="bg-blue-600" onClick={() => copyText(address, "Address copied")}>
          Copy Address
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigator.share?.({ text: address }).catch(() => copyText(address))}
        >
          Share
        </Button>
      </div>
      <p className="rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-100">
        Only send {asset} using the TRON network to this address. USDT TRC20 and TRX use the same
        underlying TRON address.
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
  onSubmit,
}: {
  wallet: WalletRow | null;
  password: string;
  setPassword: (value: string) => void;
  revealedPhrase: string;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
}) {
  const words = revealedPhrase.trim().split(/\s+/).filter(Boolean);
  return (
    <Screen title="Backup Wallet" subtitle={wallet?.name ?? "Selected wallet"}>
      <p className="rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-100">
        Never share your recovery phrase. Anyone with this phrase can control the wallet.
      </p>
      {!words.length ? (
        <form className="space-y-3" onSubmit={onSubmit}>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Transaction password"
          />
          <Button className="w-full bg-blue-600" disabled={busy}>
            Reveal Recovery Phrase
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {words.map((word, index) => (
              <div
                key={`${word}-${index}`}
                className="rounded-xl border border-white/10 bg-white/6 p-2 text-sm"
              >
                <span className="mr-2 text-slate-500">{index + 1}</span>
                {word}
              </div>
            ))}
          </div>
          <Button
            className="w-full bg-blue-600"
            onClick={() => copyText(revealedPhrase, "Recovery phrase copied")}
          >
            Copy
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
        className="space-y-3 rounded-3xl border border-white/10 bg-white/6 p-4"
        onSubmit={onSubmit}
      >
        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="USDT amount"
        />
        <Button className="w-full bg-blue-600" disabled={busy}>
          Create Deposit
        </Button>
      </form>
      {companyAddress ? (
        <div className="rounded-3xl border border-white/10 bg-white p-4 text-slate-950">
          <div className="mx-auto h-60 w-60 max-w-full">
            {qr ? <img src={qr} alt="Platform deposit QR" /> : null}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase text-slate-500">
            WTRON Deposit Address
          </p>
          <p className="mono mt-1 break-all text-sm">{companyAddress}</p>
          <p className="mt-2 text-sm">Network: TRON (TRC20)</p>
          <Button
            className="mt-3 w-full bg-blue-600 text-white"
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
}: {
  wallet: WalletRow | null;
  asset: ReceiveAsset;
  setAsset: (asset: ReceiveAsset) => void;
  address: string;
  setAddress: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
}) {
  const enabled = onChainSendEnabled(wallet);
  return (
    <Screen title="Send" subtitle="Prepared for on-chain personal wallet sending">
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={asset === "USDT" ? "default" : "secondary"}
          onClick={() => setAsset("USDT")}
        >
          USDT
        </Button>
        <Button variant={asset === "TRX" ? "default" : "secondary"} onClick={() => setAsset("TRX")}>
          TRX
        </Button>
      </div>
      <div className="space-y-3 rounded-3xl border border-white/10 bg-white/6 p-4">
        <Input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Recipient TRON T... address"
        />
        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Amount"
        />
        <MetricGrid
          items={[
            ["Selected wallet", wallet?.name ?? "None"],
            ["Available", money(walletDisplayBalance(wallet))],
            ["Network", "TRON"],
            ["Fees", "Signer required"],
          ]}
        />
      </div>
      <p className="rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-3 text-sm text-yellow-100">
        Sending is currently unavailable while secure wallet signing is being configured.
      </p>
      <Button className="w-full" disabled={!enabled}>
        Continue
      </Button>
    </Screen>
  );
}

function P2pScreen(props: {
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
    <Screen title="P2P Market" subtitle="User-to-user USDT trading only">
      <Tabs
        value={props.tab}
        setValue={(value) => props.setTab(value as P2pTab)}
        items={[
          ["buy", "Buy"],
          ["sell", "Sell"],
          ["myAds", "My Ads"],
          ["myOrders", "My Orders"],
        ]}
      />
      {props.tab === "buy" ? (
        <>
          <Input
            value={props.p2pAmount}
            onChange={(event) => props.setP2pAmount(event.target.value)}
            placeholder="USDT amount"
          />
          {props.ads.length ? (
            props.ads.map((ad) => <AdCard key={ad.id} ad={ad} onTake={() => props.onTakeAd(ad)} />)
          ) : (
            <EmptyLine>No active seller ads. Create a sell ad from the Sell tab.</EmptyLine>
          )}
        </>
      ) : null}
      {props.tab === "sell" ? (
        <form
          className="space-y-3 rounded-3xl border border-white/10 bg-white/6 p-4"
          onSubmit={props.onCreateAd}
        >
          {(["amount", "rate", "min", "max"] as const).map((field) => (
            <Input
              key={field}
              value={props.sellAd[field]}
              onChange={(event) =>
                props.setSellAd({ ...props.sellAd, [field]: event.target.value })
              }
              placeholder={
                field === "amount"
                  ? "USDT Amount"
                  : field === "rate"
                    ? "Selling Rate"
                    : field === "min"
                      ? "Min INR"
                      : "Max INR"
              }
            />
          ))}
          {props.paymentMethods.length ? (
            <select
              className="w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm"
              value={props.selectedPaymentMethodId}
              onChange={(event) => props.setSelectedPaymentMethodId(event.target.value)}
            >
              {props.paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.label || method.upi_id || "Saved UPI"}
                </option>
              ))}
            </select>
          ) : (
            <EmptyLine>Add UPI ID first before creating a sell ad.</EmptyLine>
          )}
          <textarea
            className="min-h-20 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-blue-500"
            value={props.sellAd.terms}
            onChange={(event) => props.setSellAd({ ...props.sellAd, terms: event.target.value })}
            placeholder="Terms"
          />
          <Button
            className="w-full bg-blue-600"
            disabled={props.busy || !props.paymentMethods.length || !props.selectedPaymentMethodId}
          >
            Create Sell Ad
          </Button>
        </form>
      ) : null}
      {props.tab === "myAds" ? (
        <EmptyLine>Your ads will appear here after creation.</EmptyLine>
      ) : null}
      {props.tab === "myOrders" ? (
        <OrderList orders={props.orders} empty="No P2P orders yet." />
      ) : null}
    </Screen>
  );
}

function TradeScreen(props: {
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
    <Screen title="WTRON Trade" subtitle="Company and verified-vendor trading">
      <Tabs
        value={props.tab}
        setValue={(value) => props.setTab(value as TradeTab)}
        items={[
          ["sell", "Sell to WTRON"],
          ["buy", "Buy from WTRON"],
        ]}
      />
      {props.tab === "sell" ? (
        <form
          className="space-y-3 rounded-3xl border border-white/10 bg-white/6 p-4"
          onSubmit={props.onSell}
        >
          <MetricGrid
            items={[
              ["WTRON Buy Rate", "Configured by admin"],
              ["Payout", "Saved UPI or bank"],
            ]}
          />
          <Input
            value={props.amount}
            onChange={(event) => props.setAmount(event.target.value)}
            placeholder="USDT amount"
          />
          {props.paymentMethods.length ? (
            <select
              className="w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm"
              value={props.selectedPaymentMethodId}
              onChange={(event) => props.setSelectedPaymentMethodId(event.target.value)}
            >
              {props.paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.label || method.upi_id || "Saved UPI"}
                </option>
              ))}
            </select>
          ) : (
            <EmptyLine>Add UPI ID first.</EmptyLine>
          )}
          {!props.paymentMethods.length ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={props.onAddPayment}
            >
              Add UPI ID first
            </Button>
          ) : null}
          <Button
            className="w-full bg-blue-600"
            disabled={props.busy || !props.paymentMethods.length || !props.selectedPaymentMethodId}
          >
            Create Sell Order
          </Button>
        </form>
      ) : null}
      {props.tab === "buy" ? (
        <div className="space-y-3">
          <Input
            value={props.vendorAmount}
            onChange={(event) => props.setVendorAmount(event.target.value)}
            placeholder="USDT amount"
          />
          <Tabs
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
            <EmptyLine>No verified vendor offers are active.</EmptyLine>
          )}
        </div>
      ) : null}
    </Screen>
  );
}

function MoreScreen({ onNavigate }: { onNavigate: (screen: MiniScreen) => Promise<void> }) {
  const items: Array<[MiniScreen, string, MiniIcon]> = [
    ["orders", "Orders", MiniIcons.orders],
    ["analytics", "Analytics", MiniIcons.analytics],
    ["bank-accounts", "Bank Accounts", MiniIcons.bank],
    ["history", "History", MiniIcons.history],
    ["profile", "Profile", MiniIcons.profile],
    ["notifications", "Notifications", MiniIcons.notifications],
    ["security", "Security", MiniIcons.security],
    ["referral", "Referral", MiniIcons.referral],
  ];
  return (
    <Screen title="More" subtitle="Account, trading and security tools">
      <div className="grid grid-cols-2 gap-3">
        {items.map(([screen, label, Icon]) => (
          <button
            key={screen}
            className="rounded-2xl border border-white/10 bg-white/6 p-4 text-left"
            onClick={() => onNavigate(screen)}
          >
            <Icon className="h-5 w-5 text-blue-300" />
            <span className="mt-3 block text-sm font-semibold">{label}</span>
          </button>
        ))}
      </div>
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
              className="w-full rounded-2xl border border-white/10 bg-white/6 p-4 text-left"
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
          <EmptyLine>No WTRON direct sell orders yet.</EmptyLine>
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
      <div className="rounded-3xl border border-white/10 bg-white/6 p-5">
        <UserRound className="h-10 w-10 text-blue-300" />
        <h2 className="mt-3 text-xl font-semibold tracking-normal">
          {profile?.full_name || "WTRON Trader"}
        </h2>
        <p className="text-sm text-slate-400">{profile?.email || "Telegram linked account"}</p>
        <p className="mt-2 text-xs text-blue-200">Telegram linked badge</p>
      </div>
      <Section title="Sections">
        <SettingRow
          icon={MiniIcons.wallet}
          title="Manage Wallets"
          body="Personal wallet management"
          onClick={() => onNavigate("wallet")}
        />
        <SettingRow
          icon={MiniIcons.bank}
          title="Payments"
          body="Bank accounts and UPI"
          onClick={() => onNavigate("bank-accounts")}
        />
        <SettingRow
          icon={MiniIcons.security}
          title="Security"
          body={hasSession ? "Authenticated session" : "Telegram verified"}
          onClick={() => onNavigate("security")}
        />
        <SettingRow
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
          <div key={row.id} className="rounded-2xl border border-white/10 bg-white/6 p-4">
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
  password,
  setPassword,
  confirm,
  setConfirm,
  busy,
  onSubmit,
  onWalletBackup,
}: {
  wallets: WalletRow[];
  password: string;
  setPassword: (value: string) => void;
  confirm: string;
  setConfirm: (value: string) => void;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onWalletBackup: (wallet: WalletRow) => void;
}) {
  return (
    <Screen title="Security" subtitle="Login, transaction password and wallet backup">
      <form
        className="space-y-3 rounded-3xl border border-white/10 bg-white/6 p-4"
        onSubmit={onSubmit}
      >
        <h2 className="font-semibold">Transaction Password</h2>
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
        />
        <Input
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="Confirm password"
        />
        <Button className="w-full bg-blue-600" disabled={busy}>
          Save Password
        </Button>
      </form>
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

function ReferralScreen({ summary }: { summary: ReferralSummary | null }) {
  return (
    <Screen title="Refer & Earn" subtitle="Referral rewards from existing backend">
      <div className="rounded-3xl border border-white/10 bg-white/6 p-5">
        <p className="text-xs uppercase text-slate-400">Referral Code</p>
        <p className="mono mt-2 text-3xl font-semibold">{summary?.referralCode ?? "Loading"}</p>
        <p className="mono mt-2 break-all text-sm text-slate-400">{summary?.referralLink ?? ""}</p>
        <Button
          className="mt-4 bg-blue-600"
          onClick={() =>
            summary?.referralLink && copyText(summary.referralLink, "Referral link copied")
          }
        >
          Copy
        </Button>
      </div>
      <MetricGrid
        items={[
          ["Invited users", String(summary?.invitedUsers?.length ?? 0)],
          ["Qualified", String(summary?.qualifiedReferrals ?? 0)],
          ["Pending earnings", money(summary?.pendingEarnings)],
          ["Paid earnings", money(summary?.paidEarnings)],
        ]}
      />
    </Screen>
  );
}

function BankAccountsScreen(props: {
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
  busy: boolean;
  onSaveUpi: (event: FormEvent) => void;
  onSaveBank: (event: FormEvent) => void;
  onDefault: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Screen title="Payment Methods" subtitle="UPI and bank accounts for INR settlement">
      <form
        className="space-y-2 rounded-3xl border border-white/10 bg-white/6 p-4"
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
        <Button className="w-full bg-blue-600" disabled={props.busy}>
          Add UPI
        </Button>
      </form>
      <form
        className="space-y-2 rounded-3xl border border-white/10 bg-white/6 p-4"
        onSubmit={props.onSaveBank}
      >
        <h2 className="font-semibold">Add Bank Account</h2>
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
        <Button className="w-full bg-blue-600" disabled={props.busy}>
          Add Bank
        </Button>
      </form>
      <Section title="Saved Methods">
        {props.methods.length ? (
          props.methods.map((method) => (
            <div key={method.id} className="rounded-2xl border border-white/10 bg-white/6 p-4">
              <p className="font-semibold">
                {method.label || method.upi_id || method.bank_name || method.kind}
              </p>
              <p className="text-sm text-slate-400">
                {method.kind.toUpperCase()} {method.is_default ? "- Default" : ""}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => props.onDefault(method.id)}>
                  Set Default
                </Button>
                <Button size="sm" variant="secondary" onClick={() => props.onDelete(method.id)}>
                  Delete
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
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
      </div>
      {children}
    </main>
  );
}
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="inline-flex items-center gap-1 text-sm text-slate-300" onClick={onClick}>
      <ChevronLeft className="h-4 w-4" />
      Back
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
      className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/6 text-slate-200"
      onClick={onClick}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
function AssetCard({ total, profile }: { total: number; profile: ProfileSummary | null }) {
  return (
    <div className="rounded-3xl border border-blue-400/20 bg-blue-600 p-5 shadow-[0_18px_45px_-25px_rgba(37,99,235,0.9)]">
      <p className="text-xs font-semibold uppercase text-blue-100">Total Assets</p>
      <p className="mono mt-2 text-4xl font-semibold">{money(total)}</p>
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
    <div className="rounded-2xl bg-black/18 p-3">
      <p className="text-[11px] text-blue-100/80">{label}</p>
      <p className="mono mt-1 text-sm font-semibold">{value}</p>
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
    <button
      className="rounded-2xl border border-white/10 bg-white/6 p-2 text-center"
      onClick={() => void onClick()}
    >
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-blue-600/18 text-blue-300">
        <Icon className="h-5 w-5" />
      </span>
      <span className="mt-2 block text-[11px] text-slate-200">{label}</span>
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
  action?: string;
  onAction?: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action ? (
          <button className="text-xs text-blue-300" onClick={() => void onAction?.()}>
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}
function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-white/12 bg-white/4 p-4 text-center text-sm text-slate-400">
      {children}
    </p>
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
        <Icon className="mx-auto h-10 w-10 text-blue-300" />
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
    <div className="flex gap-1 overflow-x-auto rounded-2xl bg-white/6 p-1">
      {items.map(([key, label]) => (
        <button
          key={key}
          className={`shrink-0 rounded-xl px-3 py-2 text-sm ${value === key ? "bg-blue-600 text-white" : "text-slate-400"}`}
          onClick={() => setValue(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-3xl border border-white/10 bg-white/6 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}
function NetworkPicker({
  network,
  setNetwork,
}: {
  network: ChainNetwork;
  setNetwork: (value: ChainNetwork) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["trc20-nile", "trc20-mainnet"] as ChainNetwork[]).map((value) => {
        const config = networkConfig(value);
        return (
          <Button
            key={value}
            type="button"
            variant={network === value ? "default" : "secondary"}
            onClick={() => setNetwork(value)}
          >
            {config.label}
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
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex items-center gap-3 rounded-2xl border p-3 text-left ${active ? "border-blue-500 bg-blue-600/18" : "border-white/10 bg-black/20"}`}
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
function WalletCard({
  wallet,
  active,
  onSelect,
  onOpen,
}: {
  wallet: WalletRow;
  active: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      className={`min-w-[82%] snap-center rounded-3xl border p-5 text-left ${active ? "border-blue-500 bg-blue-600/20" : "border-white/10 bg-white/6"}`}
      onClick={() => {
        onSelect();
        onOpen();
      }}
    >
      <div className="flex items-center justify-between">
        <NetworkBadge wallet={wallet} />
        {wallet.wallet_type === "gasfree" ? <GasFreeIcon /> : <TronIcon />}
      </div>
      <p className="mt-5 text-lg font-semibold">{wallet.name ?? "Wallet"}</p>
      <p className="mono mt-1 break-all text-xs text-slate-400">
        {shortenHash(wallet.address, 10)}
      </p>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-xs text-slate-400">USDT</p>
          <p className="mono text-xl font-semibold">{money(walletDisplayBalance(wallet))}</p>
        </div>
        {wallet.is_default ? (
          <span className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-semibold">
            Active
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Gas sponsorship: {wallet.gas_sponsorship_status ?? "unavailable"}
      </p>
    </button>
  );
}
function NetworkBadge({ wallet }: { wallet: WalletRow }) {
  const network = networkConfig(wallet.network);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs">
      <TronIcon className="h-4 w-4" />
      {network.label} {(wallet.wallet_type ?? "standard").toUpperCase()}
    </span>
  );
}
function WalletSummary({
  wallet,
  onReceive,
  onSend,
  onBackup,
}: {
  wallet: WalletRow | null;
  onReceive: () => void;
  onSend: () => void;
  onBackup: () => void;
}) {
  return wallet ? (
    <div className="rounded-3xl border border-white/10 bg-white/6 p-4">
      <p className="font-semibold">{wallet.name}</p>
      <p className="mono mt-1 break-all text-xs text-slate-400">{wallet.address}</p>
      <MetricGrid
        items={[
          ["Wallet Type", (wallet.wallet_type ?? "standard").toUpperCase()],
          ["Network", networkConfig(wallet.network).label],
          ["Backup", wallet.backup_status ?? "not_backed_up"],
          ["Gas", wallet.gas_sponsorship_status ?? "unavailable"],
        ]}
      />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button size="sm" onClick={onReceive}>
          Receive
        </Button>
        <Button size="sm" variant="secondary" onClick={onSend}>
          Send
        </Button>
        <Button size="sm" variant="secondary" onClick={onBackup}>
          Backup
        </Button>
      </div>
    </div>
  ) : (
    <EmptyLine>No wallet selected.</EmptyLine>
  );
}
function AssetRow({
  icon,
  symbol,
  name,
  network,
  amount,
}: {
  icon: React.ReactNode;
  symbol: string;
  name: string;
  network: string;
  amount: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/6 p-3">
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
    </div>
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
      className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/6 p-3 text-left"
      onClick={() => void onClick()}
    >
      <Icon className="h-5 w-5 text-blue-300" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-slate-400">{body}</span>
      </span>
    </button>
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
    <div className="rounded-3xl border border-white/10 bg-white/6 p-4">
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-semibold">{ad.merchants?.display_name ?? "Advertiser"}</p>
          <p className="text-xs text-slate-400">
            {completionRate(ad)} completion /{" "}
            {(ad.payment_methods ?? ["upi"]).join(", ").toUpperCase()}
          </p>
        </div>
        <p className="mono font-semibold">{money(ad.price_inr, "INR")}</p>
      </div>
      <MetricGrid
        items={[
          ["Available", money(ad.available_usdt)],
          ["Min", money(ad.min_order_inr, "INR")],
          ["Max", money(ad.max_order_inr, "INR")],
          ["Side", ad.side.toUpperCase()],
        ]}
      />
      <Button className="mt-3 w-full bg-blue-600" onClick={onTake}>
        {ad.side === "sell" ? "Buy USDT" : "Sell USDT"}
      </Button>
    </div>
  );
}
function VendorCard({ listing, onBuy }: { listing: VendorListingRow; onBuy: () => void }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/6 p-4">
      <div className="flex justify-between">
        <div>
          <p className="font-semibold">{listing.trading_vendors?.name ?? "Verified Vendor"}</p>
          <p className="text-xs text-slate-400">
            {(listing.payment_rails ?? []).join(", ").toUpperCase()}
          </p>
        </div>
        <p className="mono font-semibold">{money(listing.rate_inr, "INR")}</p>
      </div>
      <MetricGrid
        items={[
          ["Available", money(listing.available_usdt)],
          ["Min", money(listing.min_order_inr, "INR")],
          ["Max", money(listing.max_order_inr, "INR")],
          ["Orders", String(listing.trading_vendors?.completed_orders ?? 0)],
        ]}
      />
      <Button className="mt-3 w-full bg-blue-600" onClick={onBuy}>
        Buy from Vendor
      </Button>
    </div>
  );
}

function DirectSellDetailScreen(props: {
  order: DirectSellOrderRow | null;
  items: DirectSellPaymentItemRow[];
  qr: string;
  busy: boolean;
  onCopy: (value: string) => void;
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
          <div className="space-y-4 rounded-3xl border border-red-500/25 bg-red-500/10 p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-red-100">Send exactly</p>
              <p className="mono mt-1 text-3xl font-bold text-white">
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
            <Button
              type="button"
              className="w-full bg-blue-600"
              disabled={!address}
              onClick={() => props.onCopy(address)}
            >
              Copy Address
            </Button>
            {props.qr ? (
              <div className="rounded-2xl bg-white p-3">
                <img src={props.qr} alt="Direct sell address QR" className="mx-auto h-56 w-56" />
              </div>
            ) : null}
          </div>

          <Section title="Blockchain Status">
            <div className="grid grid-cols-4 gap-2">
              {blockchainSteps.map(([label], index) => (
                <div
                  key={label}
                  className={`rounded-2xl border p-2 text-center text-[11px] ${
                    index <= Math.max(0, currentStep)
                      ? "border-blue-500/40 bg-blue-500/15 text-blue-100"
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
                <div key={item.id} className="rounded-2xl border border-white/10 bg-white/6 p-4">
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
                        className="bg-blue-600"
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
    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
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
    </div>
  );
}
function DepositCard({ deposit }: { deposit: DepositRow }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
      <div className="flex items-center justify-between">
        <p className="mono text-sm">{deposit.order_ref ?? shortenHash(deposit.id)}</p>
        <StatusBadge status={String(deposit.status ?? "waiting")} />
      </div>
      <p className="mt-2 text-sm text-slate-400">
        {money(deposit.received_amount ?? deposit.expected_amount)} / {deposit.confirmations ?? 0}{" "}
        confirmations
      </p>
    </div>
  );
}
function TransactionList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: TransactionRow[];
  empty: string;
}) {
  const filtered = useMemo(() => rows.slice(0, 8), [rows]);
  return (
    <Section title={title}>
      {filtered.length ? (
        filtered.map((row) => (
          <div key={row.id} className="rounded-2xl border border-white/10 bg-white/6 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {String(
                    row.direction === "in"
                      ? "Incoming"
                      : row.direction === "out"
                        ? "Outgoing"
                        : (row.entry_type ?? row.kind ?? "transaction"),
                  ).replaceAll("_", " ")}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {row.memo ?? row.reference_id ?? "WTRON record"}
                </p>
              </div>
              <p className="mono text-sm">{money(row.amount, row.currency ?? "USDT")}</p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
              <span className="truncate">TXID {row.txid ? shortenHash(row.txid, 8) : "-"}</span>
              <span className="text-right">{row.status ?? "completed"}</span>
              <span>{row.network ?? "TRON"}</span>
              <span className="text-right">
                {row.created_at ? new Date(row.created_at).toLocaleString() : ""}
              </span>
            </div>
          </div>
        ))
      ) : (
        <EmptyLine>{empty}</EmptyLine>
      )}
    </Section>
  );
}
function GenericRow({ row }: { row: Record<string, unknown> }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
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
    <div className="flex h-36 items-end gap-1 rounded-3xl border border-white/10 bg-white/6 p-4">
      {rows.length ? (
        rows
          .slice(-18)
          .map((row, index) => (
            <div
              key={`${row.date}-${index}`}
              className="flex-1 rounded-t bg-blue-500"
              style={{ height: `${Math.max(4, (Number(row.usdt ?? 0) / max) * 100)}%` }}
            />
          ))
      ) : (
        <p className="m-auto text-sm text-slate-400">No chart data</p>
      )}
    </div>
  );
}
function BottomNav({ tab, setTab }: { tab: PrimaryTab; setTab: (tab: PrimaryTab) => void }) {
  const items: Array<[PrimaryTab, string, MiniIcon]> = [
    ["home", "Home", MiniIcons.wallet],
    ["p2p", "P2P", MiniIcons.p2p],
    ["trade", "Trade", MiniIcons.swap],
    ["wallet", "Wallet", MiniIcons.wallet],
    ["more", "More", MoreHorizontal],
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#05070B]/95 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map(([key, label, Icon]) => (
          <button
            key={key}
            className={`rounded-2xl px-1 py-2 text-[11px] ${tab === key ? "bg-blue-600 text-white" : "text-slate-500"}`}
            onClick={() => setTab(key)}
          >
            <Icon className="mx-auto mb-1 h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
