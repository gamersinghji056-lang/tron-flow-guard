import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeIndianRupee,
  BriefcaseBusiness,
  Copy,
  Home,
  Loader2,
  Lock,
  MessageSquare,
  MoreHorizontal,
  QrCode,
  ShieldCheck,
  User,
  Wallet,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  createTelegramMiniAppSession,
  createTelegramDeposit,
  fetchTelegramDeposits,
  fetchTelegramHome,
  fetchTelegramP2p,
  fetchTelegramWallet,
  loginTelegramMiniApp,
  registerTelegramMiniApp,
  verifyTelegramMiniApp,
} from "@/lib/telegram.functions";
import { createP2pOrderFromAd } from "@/lib/p2p.functions";
import { createDirectSellOrder } from "@/lib/direct-sell.functions";
import { createWithdrawalRequest } from "@/lib/withdrawals.functions";
import {
  createWallet,
  importWallet,
  setDefaultWallet,
  setWalletTransactionPassword,
} from "@/lib/wallets.functions";
import { formatUsdt, shortenHash } from "@/lib/chain";
import { selectActiveWallet, walletDisplayBalance } from "@/lib/wallet-state";

export const Route = createFileRoute("/mini-app")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab:
      search["tab"] === "p2p" ||
      search["tab"] === "trade" ||
      search["tab"] === "wallet" ||
      search["tab"] === "more" ||
      search["tab"] === "orders" ||
      search["tab"] === "profile"
        ? search["tab"]
        : "home",
    auth: search["auth"] === "register" ? "register" : "login",
    handoff: typeof search["handoff"] === "string" ? search["handoff"].slice(0, 256) : undefined,
  }),
  head: () => ({ meta: [{ title: "WTRON Telegram Mini App" }] }),
  component: TelegramMiniApp,
});

type Tab = "home" | "p2p" | "trade" | "wallet" | "more" | "orders" | "profile";
type PrimaryTab = "home" | "p2p" | "trade" | "wallet" | "more";

function normalizeTab(tab: Tab): PrimaryTab {
  if (tab === "orders" || tab === "profile") return "more";
  return tab;
}

interface TelegramWebApp {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
}

interface TelegramWindow extends Window {
  Telegram?: { WebApp?: TelegramWebApp };
}

interface ProfileSummary {
  balance?: number | string | null;
  locked_balance?: number | string | null;
  pending_balance?: number | string | null;
  email?: string | null;
  full_name?: string | null;
}

interface Overview {
  profile?: ProfileSummary | null;
  activeOrders?: unknown[];
  orders?: OrderRow[];
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
  entry_type?: string | null;
  currency?: string | null;
  amount?: number | string | null;
  bucket?: string | null;
  reference_id?: string | null;
  memo?: string | null;
  created_at?: string | null;
}

interface NotificationRow {
  id: string;
  title?: string | null;
  body?: string | null;
  severity?: string | null;
  read?: boolean | null;
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
}

interface WalletRow {
  id: string;
  name?: string | null;
  address?: string | null;
  network?: string | null;
  balance?: number | string | null;
  onchain_balance?: number | string | null;
  is_default?: boolean | null;
  custody?: string | null;
  wallet_type?: string | null;
  backup_status?: string | null;
  gas_sponsorship_status?: string | null;
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

function money(value: unknown, currency = "USDT") {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return currency === "INR" ? "₹0.00" : formatUsdt(0);
  if (currency === "INR") return `₹${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  return formatUsdt(number);
}

function clearHandoffFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("handoff")) return;
  url.searchParams.delete("handoff");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function completionRate(ad: AdRow) {
  const completed = Number(ad.merchants?.completed_orders ?? 0);
  const total = Number(ad.merchants?.total_orders ?? 0);
  if (!total) return "New";
  return `${Math.round((completed / total) * 100)}%`;
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
  const createDirectSell = useServerFn(createDirectSellOrder);
  const createWithdrawal = useServerFn(createWithdrawalRequest);
  const createPersonalWallet = useServerFn(createWallet);
  const importPersonalWallet = useServerFn(importWallet);
  const setMiniDefaultWallet = useServerFn(setDefaultWallet);
  const setMiniTransactionPassword = useServerFn(setWalletTransactionPassword);

  const [tab, setTab] = useState<PrimaryTab>(normalizeTab(search.tab as Tab));
  const [authMode, setAuthMode] = useState<"login" | "register">(
    search.auth as "login" | "register",
  );
  const [initData, setInitData] = useState("");
  const [handoffToken, setHandoffToken] = useState(search.handoff ?? "");
  const [launchChecked, setLaunchChecked] = useState(false);
  const [linked, setLinked] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [depositAddress, setDepositAddress] = useState<{
    address?: string;
    network?: string;
  } | null>(null);
  const [qr, setQr] = useState("");
  const [personalQr, setPersonalQr] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [p2pAmount, setP2pAmount] = useState("");
  const [directSellAmount, setDirectSellAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [miniWalletName, setMiniWalletName] = useState("Mini Wallet");
  const [miniImportPhrase, setMiniImportPhrase] = useState("");
  const [miniWalletPassword, setMiniWalletPassword] = useState("");
  const [miniPassword, setMiniPassword] = useState("");
  const [miniPasswordConfirm, setMiniPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(nextTab: PrimaryTab = tab, launch = initData, handoff = handoffToken) {
    if (!launch) return;
    setLoading(true);
    try {
      const verified = await verifyLaunch({ data: { initData: launch } });
      setLinked(Boolean(verified.authorized));
      const { data: sessionData } = await supabase.auth.getSession();
      if (verified.authorized && (handoff || !sessionData.session)) {
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
      if (!verified.authorized) return;

      if (nextTab === "p2p") {
        const p2p = await loadP2p({ data: { initData: launch } });
        setAds((p2p.marketplace ?? []) as AdRow[]);
        setOverview({ orders: (p2p.orders ?? []) as OrderRow[] });
      } else if (nextTab === "wallet") {
        const wallet = await loadWallet({ data: { initData: launch } });
        setOverview(wallet as Overview);
        setDeposits((wallet.deposits ?? []) as DepositRow[]);
        setDepositAddress(wallet.depositAddress as { address?: string; network?: string } | null);
      } else {
        const home = await loadHome({ data: { initData: launch } });
        setOverview(home as Overview);
      }
    } catch (error) {
      console.info("[telegram-mini] secure launch diagnostics", {
        sdkInitialized: true,
        initDataPresent: Boolean(launch),
        initDataLength: launch.length,
        handoffPresent: Boolean(handoff),
        validationResult: "failed",
      });
      toast.error(error instanceof Error ? error.message : "Telegram verification failed");
      setLinked(false);
    } finally {
      setLoading(false);
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
      void refresh(normalizeTab(search.tab as Tab), launch.initData, search.handoff);
      if (!launch.initData) setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => setHasSession(Boolean(data.session)));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!depositAddress?.address) {
      setQr("");
      return;
    }
    void QRCode.toDataURL(depositAddress.address, { width: 240, margin: 1 }).then(setQr);
  }, [depositAddress?.address]);

  const miniWallets = overview?.wallets ?? [];
  const selectedWallet = selectActiveWallet(miniWallets, selectedWalletId);

  useEffect(() => {
    if (!selectedWallet?.address) {
      setPersonalQr("");
      return;
    }
    void QRCode.toDataURL(selectedWallet.address, { width: 240, margin: 1 }).then(setPersonalQr);
  }, [selectedWallet?.address]);

  useEffect(() => {
    if (!selectedWalletId && selectedWallet?.id) setSelectedWalletId(selectedWallet.id);
  }, [selectedWallet?.id, selectedWalletId]);

  useEffect(() => {
    if (!linked || !initData) return;
    const channel = supabase
      .channel(`telegram-mini-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deposit_requests" },
        () => void refresh(tab),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ledger_entries" },
        () => void refresh(tab),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "p2p_orders" },
        () => void refresh(tab),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [linked, initData, tab]);

  const profile = overview?.profile ?? null;
  const totalAssets =
    Number(profile?.balance ?? 0) +
    Number(profile?.locked_balance ?? 0) +
    Number(profile?.pending_balance ?? 0);
  const latestDeposit = deposits[0];

  async function switchTab(nextTab: PrimaryTab) {
    setTab(nextTab);
    await refresh(nextTab);
  }

  async function submitAuth(event: React.FormEvent) {
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
      if (authMode === "login") {
        await loginTelegram({ data: { initData, email, password } });
      } else {
        await registerTelegram({ data: { initData, email, password } });
      }
      const session = await createTelegramSession({ data: { initData } });
      await supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      toast.success("Telegram account linked");
      setLinked(true);
      setHasSession(true);
      await refresh(tab);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not authenticate");
    } finally {
      setBusy(false);
    }
  }

  async function submitDeposit(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      const created = await createDeposit({ data: { initData, amount } });
      setDepositAmount("");
      toast.success(`Deposit request ${created.order_ref ?? created.id} created`);
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

  async function submitDirectSell(event: React.FormEvent) {
    event.preventDefault();
    if (!hasSession) {
      toast.error("Login once in the Mini App to create direct sell orders");
      return;
    }
    const amount = Number(directSellAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      const order = await createDirectSell({ data: { amount } });
      toast.success(`Direct sell ${order.order_ref ?? order.order_id} created`);
      setDirectSellAmount("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create direct sell order");
    } finally {
      setBusy(false);
    }
  }

  async function submitWithdrawal(event: React.FormEvent) {
    event.preventDefault();
    if (!hasSession) {
      toast.error("Login once in the Mini App to request withdrawals");
      return;
    }
    const amount = Number(withdrawAmount);
    setBusy(true);
    try {
      await createWithdrawal({
        data: {
          toAddress: withdrawAddress,
          amount,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      toast.success("Withdrawal request created");
      setWithdrawAddress("");
      setWithdrawAmount("");
      await refresh("wallet");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not request withdrawal");
    } finally {
      setBusy(false);
    }
  }

  async function submitMiniPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!hasSession) {
      toast.error("Login once in the Mini App to update wallet security");
      return;
    }
    if (miniPassword !== miniPasswordConfirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await setMiniTransactionPassword({ data: { password: miniPassword } });
      setMiniPassword("");
      setMiniPasswordConfirm("");
      toast.success("Transaction password saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save transaction password");
    } finally {
      setBusy(false);
    }
  }

  async function submitMiniCreateWallet(event: React.FormEvent) {
    event.preventDefault();
    if (!hasSession) {
      toast.error("Login once in the Mini App to create wallets");
      return;
    }
    setBusy(true);
    try {
      const created = await createPersonalWallet({
        data: {
          name: miniWalletName,
          network: "trc20-nile",
          walletType: "standard",
          makeDefault: true,
          transactionPassword: miniWalletPassword,
        },
      });
      const walletId = (created as { wallet?: { id?: string } }).wallet?.id;
      if (walletId) setSelectedWalletId(walletId);
      setMiniWalletPassword("");
      toast.success("Wallet created");
      await refresh("wallet");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create wallet");
    } finally {
      setBusy(false);
    }
  }

  async function submitMiniImportWallet(event: React.FormEvent) {
    event.preventDefault();
    if (!hasSession) {
      toast.error("Login once in the Mini App to import wallets");
      return;
    }
    setBusy(true);
    try {
      const imported = await importPersonalWallet({
        data: {
          name: miniWalletName,
          network: "trc20-nile",
          walletType: "standard",
          makeDefault: true,
          transactionPassword: miniWalletPassword,
          mnemonic: miniImportPhrase,
        },
      });
      const walletId = (imported as { wallet?: { id?: string } }).wallet?.id;
      if (walletId) setSelectedWalletId(walletId);
      setMiniWalletPassword("");
      setMiniImportPhrase("");
      toast.success("Wallet imported");
      await refresh("wallet");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import wallet");
    } finally {
      setBusy(false);
    }
  }

  async function activateMiniWallet(wallet: WalletRow) {
    if (!wallet.id) return;
    setSelectedWalletId(wallet.id);
    try {
      await setMiniDefaultWallet({ data: { walletId: wallet.id } });
      await refresh("wallet");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not switch wallet");
    }
  }

  async function takeAd(ad: AdRow) {
    if (!hasSession) {
      toast.error("Login once in the Mini App to place P2P orders");
      return;
    }
    const amount = Number(p2pAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid USDT amount");
      return;
    }
    setBusy(true);
    try {
      await takeP2pAd({ data: { adId: ad.id, amountUsdt: amount } });
      toast.success("P2P order created");
      setP2pAmount("");
      await refresh("p2p");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create P2P order");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !launchChecked) {
    return (
      <MiniFrame>
        <div className="grid min-h-[70vh] place-items-center text-center">
          <div>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Connecting securely to WTRON...</p>
          </div>
        </div>
      </MiniFrame>
    );
  }

  if (!initData) {
    return (
      <MiniFrame>
        <EmptyState
          title="Open WTRON through @wtron_bot"
          body="Telegram launch data is required for secure account linking."
          action={
            <a
              className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              href="https://t.me/wtron_bot"
            >
              OPEN BOT
            </a>
          }
        />
      </MiniFrame>
    );
  }

  if (!linked) {
    return (
      <MiniFrame>
        <div className="space-y-5 pt-8">
          <div>
            <p className="text-xs font-medium text-primary uppercase">WTRON</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {authMode === "login" ? "Login securely" : "Create your account"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Telegram identity is verified server-side, then linked to your WTRON account.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary p-1">
            <button
              className={`rounded-md px-3 py-2 text-sm ${authMode === "login" ? "bg-background text-foreground" : "text-muted-foreground"}`}
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
            <button
              className={`rounded-md px-3 py-2 text-sm ${authMode === "register" ? "bg-background text-foreground" : "text-muted-foreground"}`}
              onClick={() => setAuthMode("register")}
            >
              Register
            </button>
          </div>
          <form className="space-y-3" onSubmit={submitAuth}>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              type="email"
            />
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type="password"
            />
            {authMode === "register" ? (
              <Input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm password"
                type="password"
              />
            ) : null}
            <Button className="w-full" disabled={busy}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              {authMode === "login" ? "Login and link" : "Register and link"}
            </Button>
          </form>
          {authMode === "login" ? (
            <button
              className="text-sm text-primary"
              onClick={() => toast.info("Use the website password reset flow for now.")}
            >
              Forgot Password
            </button>
          ) : null}
        </div>
      </MiniFrame>
    );
  }

  return (
    <MiniFrame>
      <div className="space-y-4 pb-20">
        {tab === "home" ? (
          <>
            <Header title="Home" subtitle="P2P wallet and order overview" />
            <BalancePanel total={totalAssets} profile={profile} />
            <div className="grid grid-cols-4 gap-2">
              <QuickAction
                icon={ArrowDownToLine}
                label="Deposit"
                onClick={() => void switchTab("wallet")}
              />
              <QuickAction
                icon={ArrowUpFromLine}
                label="Send"
                onClick={() => void switchTab("wallet")}
              />
              <QuickAction
                icon={BadgeIndianRupee}
                label="Buy"
                onClick={() => void switchTab("p2p")}
              />
              <QuickAction
                icon={BriefcaseBusiness}
                label="Sell"
                onClick={() => void switchTab("p2p")}
              />
            </div>
            <DirectSellForm
              amount={directSellAmount}
              setAmount={setDirectSellAmount}
              busy={busy}
              onSubmit={submitDirectSell}
            />
            <ListPanel title="Active Orders">
              {(overview?.activeOrders as OrderRow[] | undefined)?.length ? (
                (overview?.activeOrders as OrderRow[]).map((order) => (
                  <OrderItem key={order.id} order={order} />
                ))
              ) : (
                <EmptyLine>No active orders.</EmptyLine>
              )}
            </ListPanel>
            <TransactionList rows={overview?.transactions ?? []} />
          </>
        ) : null}

        {tab === "trade" ? (
          <>
            <Header title="WTRON Trade" subtitle="Company buy and sell flows" />
            <BalancePanel total={totalAssets} profile={profile} />
            <DirectSellForm
              amount={directSellAmount}
              setAmount={setDirectSellAmount}
              busy={busy}
              onSubmit={submitDirectSell}
            />
            <ListPanel title="Buy from WTRON">
              <EmptyLine>Verified vendor inventory will appear here when configured.</EmptyLine>
            </ListPanel>
            <ListPanel title="Recent company trades">
              {overview?.orders?.length ? (
                overview.orders
                  .slice(0, 5)
                  .map((order) => <OrderItem key={order.id} order={order} />)
              ) : (
                <EmptyLine>No company trades yet.</EmptyLine>
              )}
            </ListPanel>
          </>
        ) : null}

        {tab === "wallet" ? (
          <>
            <Header title="Wallet" subtitle="USDT balances, deposits and withdrawals" />
            <BalancePanel total={totalAssets} profile={profile} />
            <ListPanel title="PERSONAL WALLET RECEIVE">
              {selectedWallet?.address ? (
                <div className="flex items-center gap-3">
                  <div className="grid h-28 w-28 place-items-center rounded-lg bg-white p-2">
                    {personalQr ? (
                      <img src={personalQr} alt="Personal wallet QR" className="h-full w-full" />
                    ) : (
                      <QrCode className="h-8 w-8 text-black" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {selectedWallet.name ?? "Wallet"} - {selectedWallet.network ?? "TRC20"}
                    </p>
                    <p className="mono mt-1 break-all text-sm">{selectedWallet.address}</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      onClick={() => {
                        if (selectedWallet.address)
                          void navigator.clipboard.writeText(selectedWallet.address);
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyLine>No personal wallet yet</EmptyLine>
              )}
            </ListPanel>
            <ListPanel title="PLATFORM DEPOSIT">
              <div className="flex items-center gap-3">
                <div className="grid h-28 w-28 place-items-center rounded-lg bg-white p-2">
                  {qr ? (
                    <img src={qr} alt="Deposit QR" className="h-full w-full" />
                  ) : (
                    <QrCode className="h-8 w-8 text-black" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Company deposit address</p>
                  <p className="mono mt-1 break-all text-sm">
                    {depositAddress?.address ?? "No active address"}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={() => {
                      if (depositAddress?.address)
                        void navigator.clipboard.writeText(depositAddress.address);
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                </div>
              </div>
            </ListPanel>
            <form className="panel space-y-3 p-4" onSubmit={submitMiniPassword}>
              <p className="text-sm font-medium">Set transaction password</p>
              <Input
                value={miniPassword}
                onChange={(event) => setMiniPassword(event.target.value)}
                placeholder="Password"
                type="password"
              />
              <Input
                value={miniPasswordConfirm}
                onChange={(event) => setMiniPasswordConfirm(event.target.value)}
                placeholder="Confirm password"
                type="password"
              />
              <Button className="w-full" variant="secondary" disabled={busy}>
                Save password
              </Button>
            </form>
            <form className="panel space-y-3 p-4" onSubmit={submitMiniCreateWallet}>
              <p className="text-sm font-medium">Create personal wallet</p>
              <Input
                value={miniWalletName}
                onChange={(event) => setMiniWalletName(event.target.value)}
                placeholder="Wallet name"
              />
              <Input
                value={miniWalletPassword}
                onChange={(event) => setMiniWalletPassword(event.target.value)}
                placeholder="Transaction password"
                type="password"
              />
              <Button className="w-full" disabled={busy}>
                Create wallet
              </Button>
            </form>
            <form className="panel space-y-3 p-4" onSubmit={submitMiniImportWallet}>
              <p className="text-sm font-medium">Import with recovery phrase</p>
              <Input
                value={miniImportPhrase}
                onChange={(event) => setMiniImportPhrase(event.target.value)}
                placeholder="Recovery phrase"
              />
              <Input
                value={miniWalletPassword}
                onChange={(event) => setMiniWalletPassword(event.target.value)}
                placeholder="Transaction password"
                type="password"
              />
              <Button className="w-full" variant="secondary" disabled={busy}>
                Import wallet
              </Button>
            </form>
            <form className="panel space-y-3 p-4" onSubmit={submitDeposit}>
              <p className="text-sm font-medium">Create deposit request</p>
              <Input
                value={depositAmount}
                onChange={(event) => setDepositAmount(event.target.value)}
                placeholder="Amount in USDT"
              />
              <Button className="w-full" disabled={busy}>
                Create request
              </Button>
            </form>
            <form className="panel space-y-3 p-4" onSubmit={submitWithdrawal}>
              <p className="text-sm font-medium">Send USDT</p>
              <Input
                value={withdrawAddress}
                onChange={(event) => setWithdrawAddress(event.target.value)}
                placeholder="TRC20 destination address"
              />
              <Input
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                placeholder="Amount in USDT"
              />
              <Button className="w-full" variant="secondary" disabled={busy}>
                Request withdrawal
              </Button>
            </form>
            <ListPanel title="Recent deposits">
              {deposits.length ? (
                deposits.map((deposit) => <DepositItem key={deposit.id} deposit={deposit} />)
              ) : (
                <EmptyLine>No deposits yet.</EmptyLine>
              )}
            </ListPanel>
            <ListPanel title="My Wallets">
              {overview?.wallets?.length ? (
                overview.wallets.map((wallet) => (
                  <WalletItem
                    key={wallet.id}
                    wallet={wallet}
                    active={wallet.id === selectedWallet?.id}
                    onSelect={() => void activateMiniWallet(wallet)}
                  />
                ))
              ) : (
                <EmptyLine>No personal wallet yet</EmptyLine>
              )}
            </ListPanel>
          </>
        ) : null}

        {tab === "p2p" ? (
          <>
            <Header title="P2P" subtitle="Buy and sell USDT for INR" />
            <Input
              value={p2pAmount}
              onChange={(event) => setP2pAmount(event.target.value)}
              placeholder="USDT amount"
            />
            <DirectSellForm
              amount={directSellAmount}
              setAmount={setDirectSellAmount}
              busy={busy}
              onSubmit={submitDirectSell}
            />
            <ListPanel title="Marketplace">
              {ads.length ? (
                ads.map((ad) => (
                  <div key={ad.id} className="rounded-lg border border-border bg-card/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {ad.merchants?.display_name ?? "Advertiser"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {completionRate(ad)} completion •{" "}
                          {(ad.payment_methods ?? ["upi"]).join(", ").toUpperCase()}
                        </p>
                      </div>
                      <p className="mono text-base font-semibold">{money(ad.price_inr, "INR")}</p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <Metric label="Available" value={money(ad.available_usdt)} />
                      <Metric label="Min" value={money(ad.min_order_inr, "INR")} />
                      <Metric label="Max" value={money(ad.max_order_inr, "INR")} />
                    </div>
                    <Button className="mt-3 w-full" onClick={() => void takeAd(ad)} disabled={busy}>
                      {ad.side === "sell" ? "Buy USDT" : "Sell USDT"}
                    </Button>
                  </div>
                ))
              ) : (
                <EmptyLine>No active ads.</EmptyLine>
              )}
            </ListPanel>
          </>
        ) : null}

        {tab === "more" ? (
          <>
            <Header title="More" subtitle="Orders, history, profile and security" />
            <div className="grid grid-cols-2 gap-2">
              {[
                "Orders",
                "Analytics",
                "Bank Accounts",
                "History",
                "Profile",
                "Notifications",
                "Security",
                "Referral",
              ].map((label) => (
                <div
                  key={label}
                  className="rounded-lg border border-border bg-card/70 p-3 text-sm font-medium"
                >
                  {label}
                </div>
              ))}
            </div>
            <ListPanel title="Recent orders">
              {overview?.orders?.length ? (
                overview.orders.map((order) => <OrderItem key={order.id} order={order} />)
              ) : (
                <EmptyLine>No orders yet.</EmptyLine>
              )}
            </ListPanel>
            <TransactionList rows={overview?.transactions ?? []} />
            <ListPanel title="Account">
              <Metric label="Email" value={profile?.email ?? "Linked account"} />
              <Metric label="Name" value={profile?.full_name ?? "Not set"} />
              <Metric label="Telegram" value="Linked" />
              <Metric label="Session" value={hasSession ? "Authenticated" : "Telegram verified"} />
            </ListPanel>
            <ListPanel title="Notifications">
              {overview?.notifications?.length ? (
                overview.notifications.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border bg-card/70 p-3">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
                  </div>
                ))
              ) : (
                <EmptyLine>No notifications.</EmptyLine>
              )}
            </ListPanel>
          </>
        ) : null}
      </div>
      <BottomNav tab={tab} setTab={(next) => void switchTab(next)} />
    </MiniFrame>
  );
}

function MiniFrame({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background px-4 py-4 text-foreground">{children}</div>;
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="pt-2">
      <p className="text-xs font-medium text-primary uppercase">WTRON</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function BalancePanel({ total, profile }: { total: number; profile: ProfileSummary | null }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted-foreground">Total Assets</p>
      <p className="mono mt-1 text-3xl font-semibold">{money(total)}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric label="Available" value={money(profile?.balance)} />
        <Metric label="Locked" value={money(profile?.locked_balance)} />
        <Metric label="Pending" value={money(profile?.pending_balance)} />
      </div>
    </div>
  );
}

function DirectSellForm({
  amount,
  setAmount,
  busy,
  onSubmit,
}: {
  amount: string;
  setAmount: (value: string) => void;
  busy: boolean;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <form className="panel space-y-3 p-4" onSubmit={onSubmit}>
      <div className="flex items-center gap-2">
        <BadgeIndianRupee className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">Sell USDT to platform</p>
      </div>
      <Input
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="Amount in USDT"
      />
      <Button className="w-full" disabled={busy}>
        Create direct sell
      </Button>
    </form>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-lg border border-border bg-card/70 px-2 py-3 text-center"
      onClick={onClick}
    >
      <Icon className="mx-auto h-5 w-5 text-primary" />
      <span className="mt-1 block text-xs">{label}</span>
    </button>
  );
}

function ListPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel space-y-3 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-secondary/60 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mono mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[70vh] place-items-center text-center">
      <div>
        <Lock className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        {action}
      </div>
    </div>
  );
}

function OrderItem({ order }: { order: OrderRow }) {
  return (
    <div className="rounded-lg border border-border bg-card/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="mono text-sm">{order.order_ref ?? shortenHash(order.id)}</p>
        <StatusBadge status={String(order.status ?? "created")} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <Metric label="USDT" value={money(order.usdt_amount)} />
        <Metric label="INR" value={money(order.total_inr, "INR")} />
      </div>
    </div>
  );
}

function DepositItem({ deposit }: { deposit: DepositRow }) {
  return (
    <div className="rounded-lg border border-border bg-card/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="mono text-sm">{deposit.order_ref ?? shortenHash(deposit.id)}</p>
        <StatusBadge status={String(deposit.status ?? "waiting")} />
      </div>
      <p className="mono mt-2 text-sm">
        {money(deposit.received_amount ?? deposit.expected_amount)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {deposit.confirmations ?? 0}/{deposit.required_confirmations ?? 0} confirmations
        {deposit.txid ? ` • ${shortenHash(deposit.txid)}` : ""}
      </p>
    </div>
  );
}

function WalletItem({
  wallet,
  active,
  onSelect,
}: {
  wallet: WalletRow;
  active: boolean;
  onSelect: () => void;
}) {
  const balance = walletDisplayBalance(wallet);
  return (
    <button
      type="button"
      className={`w-full rounded-lg border border-border bg-card/70 p-3 text-left ${
        active ? "ring-1 ring-primary" : ""
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {wallet.name ?? "Wallet"} {wallet.is_default ? "(Active)" : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {(wallet.wallet_type ?? "standard").toUpperCase()} - {wallet.network ?? "TRC20"}
          </p>
        </div>
        <p className="mono text-sm font-semibold">{money(balance)}</p>
      </div>
      <p className="mono mt-2 text-xs break-all text-muted-foreground">
        {shortenHash(wallet.address, 10)}
      </p>
      {wallet.wallet_type === "gasfree" ? (
        <p className="mt-2 text-xs text-warning">
          Gas sponsorship: {wallet.gas_sponsorship_status ?? "unavailable"}
        </p>
      ) : null}
    </button>
  );
}

function TransactionList({ rows }: { rows: TransactionRow[] }) {
  const filtered = useMemo(() => rows.slice(0, 8), [rows]);
  return (
    <ListPanel title="Recent Transactions">
      {filtered.length ? (
        filtered.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/70 p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {String(row.entry_type ?? "transaction").replaceAll("_", " ")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {row.memo ?? row.reference_id ?? "Ledger entry"}
              </p>
            </div>
            <p className="mono text-sm">{money(row.amount, row.currency ?? "USDT")}</p>
          </div>
        ))
      ) : (
        <EmptyLine>No ledger activity yet.</EmptyLine>
      )}
    </ListPanel>
  );
}

function BottomNav({ tab, setTab }: { tab: PrimaryTab; setTab: (tab: PrimaryTab) => void }) {
  const items = [
    { tab: "home" as const, label: "Home", icon: Home },
    { tab: "p2p" as const, label: "P2P", icon: BriefcaseBusiness },
    { tab: "trade" as const, label: "Trade", icon: BadgeIndianRupee },
    { tab: "wallet" as const, label: "Wallet", icon: Wallet },
    { tab: "more" as const, label: "More", icon: MoreHorizontal },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 py-2 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map((item) => (
          <button
            key={item.tab}
            className={`rounded-lg px-1 py-2 text-[11px] ${tab === item.tab ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setTab(item.tab)}
          >
            <item.icon className="mx-auto mb-1 h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
