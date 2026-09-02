import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Copy,
  Eye,
  Loader2,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Snowflake,
  Trash2,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  fetchVendorApplication,
  fetchVendorPortal,
  saveVendorAccount,
  saveVendorListing,
  updateVendorAccountState,
  updateVendorListingState,
  vendorConfirmPayment,
  vendorDisputePayment,
} from "@/lib/vendor.functions";
import {
  createWallet,
  importWallet,
  refreshWalletBalance,
  revealRecoveryPhrase,
  setDefaultWallet,
  setWalletTransactionPassword,
} from "@/lib/wallets.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsdt, shortenHash } from "@/lib/chain";
import { walletDisplayBalance } from "@/lib/wallet-state";

export const Route = createFileRoute("/_authenticated/vendor/")({
  head: () => ({ meta: [{ title: "Vendor Portal - WTRON" }] }),
  component: VendorPortalPage,
});

type VendorTab =
  | "home"
  | "wallet"
  | "trade"
  | "orders"
  | "transactions"
  | "history"
  | "accounts"
  | "settings"
  | "more";
type VendorOrderFilter =
  "all" | "active" | "payment_submitted" | "completed" | "disputed" | "expired" | "cancelled";

interface VendorRow {
  id: string;
  name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  telegram_username?: string | null;
  status?: string | null;
  rejection_reason?: string | null;
  suspension_reason?: string | null;
}

interface AccountRow {
  id: string;
  rail: "upi" | "imps" | "neft" | "rtgs";
  label?: string | null;
  account_ref?: string | null;
  holder_name?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc?: string | null;
  min_inr?: number | string | null;
  max_inr?: number | string | null;
  daily_limit_inr?: number | string | null;
  priority?: number | null;
  is_default?: boolean | null;
  enabled?: boolean | null;
  frozen?: boolean | null;
  status?: string | null;
}

interface ListingRow {
  id: string;
  total_usdt?: number | string | null;
  available_usdt?: number | string | null;
  reserved_usdt?: number | string | null;
  rate_inr?: number | string | null;
  min_order_inr?: number | string | null;
  max_order_inr?: number | string | null;
  payment_rails?: string[] | null;
  payment_account_id?: string | null;
  terms?: string | null;
  status?: string | null;
}

interface OrderRow {
  id: string;
  order_ref?: string | null;
  usdt_amount?: number | string | null;
  rate_inr?: number | string | null;
  total_inr?: number | string | null;
  buyer_fee_usdt?: number | string | null;
  vendor_fee_usdt?: number | string | null;
  payment_rail?: string | null;
  utr_reference?: string | null;
  paid_amount_inr?: number | string | null;
  payment_proof_path?: string | null;
  status?: string | null;
  payment_deadline?: string | null;
  payment_submitted_at?: string | null;
  created_at?: string | null;
}

interface WalletRow {
  id: string;
  name?: string | null;
  address?: string | null;
  network?: "trc20-mainnet" | "trc20-nile" | null;
  balance?: number | string | null;
  onchain_balance?: number | string | null;
  onchain_trx_balance?: number | string | null;
  is_default?: boolean | null;
  wallet_type?: string | null;
  gas_sponsorship_status?: string | null;
}

interface PortalData {
  vendor: VendorRow;
  accounts: AccountRow[];
  listings: ListingRow[];
  orders: OrderRow[];
  wallets: WalletRow[];
}

function inr(value: unknown) {
  const number = Number(value ?? 0);
  return `INR ${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function VendorPortalPage() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (state) => state.location.search });
  const getApplication = useServerFn(fetchVendorApplication);
  const getPortal = useServerFn(fetchVendorPortal);
  const saveAccount = useServerFn(saveVendorAccount);
  const saveListing = useServerFn(saveVendorListing);
  const accountState = useServerFn(updateVendorAccountState);
  const listingState = useServerFn(updateVendorListingState);
  const confirmPayment = useServerFn(vendorConfirmPayment);
  const disputePayment = useServerFn(vendorDisputePayment);
  const createVendorWallet = useServerFn(createWallet);
  const importVendorWallet = useServerFn(importWallet);
  const refreshVendorWallet = useServerFn(refreshWalletBalance);
  const revealVendorWallet = useServerFn(revealRecoveryPhrase);
  const setVendorWalletDefault = useServerFn(setDefaultWallet);
  const setVendorWalletPassword = useServerFn(setWalletTransactionPassword);
  const [tab, setTab] = useState<VendorTab>(() => vendorTabFromSearch(search));
  const [application, setApplication] = useState<VendorRow | null>(null);
  const [portal, setPortal] = useState<PortalData | null>(null);
  const [pending, setPending] = useState(true);
  const [accountForm, setAccountForm] = useState({
    id: "",
    rail: "upi" as "upi" | "imps" | "neft" | "rtgs",
    label: "",
    holderName: "",
    accountRef: "",
    bankName: "",
    accountNumber: "",
    ifsc: "",
    minInr: "100",
    maxInr: "100000",
    dailyLimitInr: "500000",
    priority: "100",
    enabled: true,
    frozen: false,
  });
  const [listingForm, setListingForm] = useState({
    id: "",
    amountUsdt: "",
    rateInr: "",
    paymentAccountId: "",
    minOrderInr: "",
    maxOrderInr: "",
    rail: "upi" as "upi" | "imps" | "neft" | "rtgs",
    terms: "",
  });
  const [walletForm, setWalletForm] = useState({
    name: "Vendor Wallet",
    walletType: "standard" as "standard" | "gasfree",
    transactionPassword: "",
    mnemonic: "",
    mode: "create" as "create" | "import" | "password",
  });
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [walletQr, setWalletQr] = useState("");
  const [createdWalletPhrase, setCreatedWalletPhrase] = useState("");
  const [revealedWalletPhrase, setRevealedWalletPhrase] = useState("");
  const [orderFilter, setOrderFilter] = useState<VendorOrderFilter>("all");

  const load = useCallback(async () => {
    setPending(true);
    try {
      const app = (await getApplication()) as VendorRow | null;
      setApplication(app);
      if (app?.status === "approved") {
        const data = (await getPortal()) as unknown as PortalData;
        setPortal(data);
        setListingForm((current) => ({
          ...current,
          paymentAccountId: current.paymentAccountId || data.accounts[0]?.id || "",
        }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load vendor portal");
    } finally {
      setPending(false);
    }
  }, [getApplication, getPortal]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTab(vendorTabFromSearch(search));
  }, [search]);

  const orders = portal?.orders ?? [];
  const filteredOrders = orders.filter((order) => {
    const status = String(order.status ?? "");
    if (orderFilter === "all") return true;
    if (orderFilter === "active") {
      return ["reserved", "payment_pending", "payment_submitted", "confirming"].includes(status);
    }
    return status === orderFilter;
  });
  const submitted = orders.filter((order) => order.status === "payment_submitted");
  const completed = orders.filter((order) => order.status === "completed");
  const disputes = orders.filter((order) => order.status === "disputed");
  const available = (portal?.listings ?? []).reduce(
    (sum, listing) => sum + Number(listing.available_usdt ?? 0),
    0,
  );
  const reserved = (portal?.listings ?? []).reduce(
    (sum, listing) => sum + Number(listing.reserved_usdt ?? 0),
    0,
  );
  const pendingInr = orders
    .filter((order) => ["payment_pending", "payment_submitted"].includes(String(order.status)))
    .reduce((sum, order) => sum + Number(order.total_inr ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayVolume = completed
    .filter((order) => String(order.created_at ?? "").startsWith(today))
    .reduce((sum, order) => sum + Number(order.usdt_amount ?? 0), 0);

  async function submitAccount(event: FormEvent) {
    event.preventDefault();
    try {
      await saveAccount({
        data: {
          ...(accountForm.id ? { id: accountForm.id } : {}),
          rail: accountForm.rail,
          label: accountForm.label || undefined,
          holderName: accountForm.holderName,
          accountRef: accountForm.accountRef,
          bankName: accountForm.bankName || undefined,
          accountNumber: accountForm.accountNumber || undefined,
          ifsc: accountForm.ifsc || undefined,
          minInr: Number(accountForm.minInr),
          maxInr: Number(accountForm.maxInr),
          dailyLimitInr: Number(accountForm.dailyLimitInr),
          priority: Number(accountForm.priority),
          isDefault: !(portal?.accounts.length ?? 0),
          enabled: accountForm.enabled,
          frozen: accountForm.frozen,
        },
      });
      toast.success("Vendor account saved");
      setAccountForm((current) => ({
        ...current,
        id: "",
        label: "",
        holderName: "",
        accountRef: "",
        bankName: "",
        accountNumber: "",
        ifsc: "",
      }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save account");
    }
  }

  async function submitListing(event: FormEvent) {
    event.preventDefault();
    try {
      await saveListing({
        data: {
          ...(listingForm.id ? { id: listingForm.id } : {}),
          amountUsdt: Number(listingForm.amountUsdt),
          rateInr: Number(listingForm.rateInr),
          paymentAccountId: listingForm.paymentAccountId,
          minOrderInr: Number(listingForm.minOrderInr),
          maxOrderInr: Number(listingForm.maxOrderInr),
          paymentRails: [listingForm.rail],
          terms: listingForm.terms || undefined,
          status: "active",
        },
      });
      toast.success("Listing saved");
      setListingForm((current) => ({
        ...current,
        id: "",
        amountUsdt: "",
        rateInr: "",
        terms: "",
      }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save listing");
    }
  }

  async function submitWallet(event: FormEvent) {
    event.preventDefault();
    try {
      if (walletForm.mode === "password") {
        await setVendorWalletPassword({ data: { password: walletForm.transactionPassword } });
        toast.success("Transaction password saved");
      } else if (walletForm.mode === "import") {
        await importVendorWallet({
          data: {
            name: walletForm.name,
            network: "trc20-mainnet",
            walletType: "standard",
            makeDefault: !(portal?.wallets.length ?? 0),
            transactionPassword: walletForm.transactionPassword,
            mnemonic: walletForm.mnemonic,
            networkConfirmed: true,
          },
        });
        toast.success("Wallet imported");
      } else {
        const result = await createVendorWallet({
          data: {
            name: walletForm.name,
            network: "trc20-mainnet",
            walletType: "standard",
            makeDefault: !(portal?.wallets.length ?? 0),
            transactionPassword: walletForm.transactionPassword,
          },
        });
        const phrase = (result as { recoveryPhrase?: string }).recoveryPhrase;
        setCreatedWalletPhrase(phrase ?? "");
        toast.success(
          phrase ? "Wallet created. Back up the recovery phrase now." : "Wallet created",
        );
      }
      setWalletForm((current) => ({ ...current, transactionPassword: "", mnemonic: "" }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Wallet action failed");
    }
  }

  async function walletAction(
    wallet: WalletRow,
    action: "refresh" | "default" | "copy" | "qr" | "reveal",
  ) {
    try {
      if (action === "refresh") await refreshVendorWallet({ data: { walletId: wallet.id } });
      if (action === "default") await setVendorWalletDefault({ data: { walletId: wallet.id } });
      if (action === "copy" && wallet.address) {
        await navigator.clipboard.writeText(wallet.address);
        toast.success("Address copied");
      }
      if (action === "qr" && wallet.address) {
        setSelectedWalletId(wallet.id);
        setWalletQr(await QRCode.toDataURL(wallet.address, { width: 280, margin: 1 }));
      }
      if (action === "reveal") {
        const password = window.prompt("Transaction password");
        if (!password) return;
        const result = await revealVendorWallet({
          data: { walletId: wallet.id, transactionPassword: password },
        });
        setSelectedWalletId(wallet.id);
        setRevealedWalletPhrase(result.recoveryPhrase);
      }
      if (action !== "copy" && action !== "qr") await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Wallet action failed");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/vendor/login", replace: true });
  }

  if (pending) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#05070B] text-white">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  if (!application || application.status !== "approved" || !portal) {
    const title =
      application?.status === "rejected"
        ? "Vendor Application Rejected"
        : application?.status === "suspended"
          ? "Vendor Account Suspended"
          : application?.status === "disabled"
            ? "Vendor Account Disabled"
            : "Vendor Application Under Review";
    return (
      <main className="min-h-screen bg-[#05070B] px-4 py-10 text-white">
        <section className="mx-auto max-w-lg rounded-lg border border-white/10 bg-white/6 p-6">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-3 text-sm text-slate-300">
            {application?.rejection_reason ||
              application?.suspension_reason ||
              "Admin approval is required before the full Vendor Portal is available."}
          </p>
          <Button className="mt-5 bg-primary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </section>
      </main>
    );
  }

  const tabs: VendorTab[] = [
    "home",
    "wallet",
    "trade",
    "orders",
    "transactions",
    "history",
    "accounts",
    "settings",
    "more",
  ];

  return (
    <main className="min-h-screen bg-[#05070B] text-white">
      <header className="border-b border-white/10 bg-black/40">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
          <Link to="/" className="text-lg font-semibold">
            WTRON Vendor
          </Link>
          <nav className="hidden gap-1 md:flex">
            {tabs.map((item) => (
              <button
                key={item}
                className={`rounded-md px-3 py-1.5 text-sm capitalize ${tab === item ? "bg-primary" : "text-slate-400 hover:bg-secondary"}`}
                onClick={() => {
                  setTab(item);
                  window.history.replaceState(
                    null,
                    "",
                    item === "home" ? "/vendor" : `/vendor?tab=${item}`,
                  );
                }}
              >
                {item}
              </button>
            ))}
          </nav>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={() => void signOut()}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3 md:hidden">
          {tabs.map((item) => (
            <button
              key={item}
              className={`rounded-md px-3 py-1.5 text-sm capitalize ${tab === item ? "bg-primary" : "bg-white/6 text-slate-300"}`}
              onClick={() => {
                setTab(item);
                window.history.replaceState(
                  null,
                  "",
                  item === "home" ? "/vendor" : `/vendor?tab=${item}`,
                );
              }}
            >
              {item}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {tab === "home" ? (
          <>
            <h1 className="text-2xl font-semibold">{portal.vendor.name}</h1>
            <MetricGrid
              items={[
                ["Available USDT", formatUsdt(available)],
                ["Frozen USDT", formatUsdt(reserved)],
                ["Listed USDT", formatUsdt(available + reserved)],
                ["Pending INR", inr(pendingInr)],
                ["Today Volume", formatUsdt(todayVolume)],
                ["Completed Orders", String(completed.length)],
                ["Disputes", String(disputes.length)],
                [
                  "Fees",
                  `${formatUsdt(orders.reduce((sum, order) => sum + Number(order.vendor_fee_usdt ?? 0), 0))} USDT`,
                ],
              ]}
            />
            <Panel title="Pending Transactions">
              <OrderRows
                rows={submitted}
                onConfirm={confirmPayment}
                onDispute={disputePayment}
                reload={load}
              />
            </Panel>
          </>
        ) : null}

        {tab === "wallet" ? (
          <Panel title="Vendor Wallet">
            <form className="grid gap-3 md:grid-cols-4" onSubmit={submitWallet}>
              <select
                className="h-10 rounded-md bg-black/50 px-3"
                value={walletForm.mode}
                onChange={(event) =>
                  setWalletForm({
                    ...walletForm,
                    mode: event.target.value as typeof walletForm.mode,
                  })
                }
              >
                <option value="create">Create</option>
                <option value="import">Import</option>
                <option value="password">Password</option>
              </select>
              {walletForm.mode !== "password" ? (
                <>
                  <Input
                    placeholder="Wallet name"
                    value={walletForm.name}
                    onChange={(event) => setWalletForm({ ...walletForm, name: event.target.value })}
                  />
                </>
              ) : null}
              <Input
                type="password"
                placeholder="Transaction password"
                value={walletForm.transactionPassword}
                onChange={(event) =>
                  setWalletForm({ ...walletForm, transactionPassword: event.target.value })
                }
              />
              {walletForm.mode === "import" ? (
                <textarea
                  className="min-h-20 rounded-md bg-black/50 p-3 md:col-span-4"
                  placeholder="Recovery phrase"
                  value={walletForm.mnemonic}
                  onChange={(event) =>
                    setWalletForm({ ...walletForm, mnemonic: event.target.value })
                  }
                />
              ) : null}
              <Button className="bg-primary md:col-span-4">
                {walletForm.mode === "password"
                  ? "Save Transaction Password"
                  : walletForm.mode === "import"
                    ? "Import Wallet"
                    : "Create Wallet"}
              </Button>
            </form>
            {createdWalletPhrase ? (
              <div className="rounded-lg border border-amber-300/40 bg-amber-300/10 p-3">
                <p className="text-sm font-semibold text-amber-100">
                  Back up this recovery phrase now
                </p>
                <p className="mono mt-2 select-all rounded bg-black/50 p-3 text-sm">
                  {createdWalletPhrase}
                </p>
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(portal.wallets ?? []).map((wallet) => (
                <div key={wallet.id} className="rounded-lg border border-white/10 bg-white/6 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{wallet.name ?? "Wallet"}</p>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase">
                      {wallet.is_default ? "default" : (wallet.wallet_type ?? "standard")}
                    </span>
                  </div>
                  <p className="mono mt-1 break-all text-xs text-slate-400">{wallet.address}</p>
                  <MetricGrid
                    items={[
                      ["USDT", formatUsdt(walletDisplayBalance(wallet))],
                      ["TRX", `${formatUsdt(wallet.onchain_trx_balance)} TRX`],
                      ["Type", wallet.wallet_type ?? "standard"],
                      ["GasFree", wallet.gas_sponsorship_status ?? "unavailable"],
                    ]}
                  />
                  {selectedWalletId === wallet.id && walletQr ? (
                    <img
                      src={walletQr}
                      alt="Vendor wallet receive QR"
                      className="mt-3 h-36 w-36 rounded-md bg-white p-2"
                    />
                  ) : null}
                  {selectedWalletId === wallet.id && revealedWalletPhrase ? (
                    <div className="mt-3 rounded-lg border border-amber-300/40 bg-amber-300/10 p-3">
                      <p className="text-xs font-semibold text-amber-100">Recovery phrase</p>
                      <p className="mono mt-2 select-all break-words rounded bg-black/50 p-2 text-xs">
                        {revealedWalletPhrase}
                      </p>
                    </div>
                  ) : null}
                  {wallet.wallet_type !== "gasfree" && wallet.network === "trc20-mainnet" ? (
                    <p className="mt-3 text-xs text-emerald-200">
                      Send and receive are available from the wallet detail screen.
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <IconAction
                      label="Refresh"
                      icon={RefreshCw}
                      onClick={() => void walletAction(wallet, "refresh")}
                    />
                    <IconAction
                      label="Receive QR"
                      icon={Eye}
                      onClick={() => void walletAction(wallet, "qr")}
                    />
                    <IconAction
                      label="Copy"
                      icon={Copy}
                      onClick={() => void walletAction(wallet, "copy")}
                    />
                    <IconAction
                      label="Default"
                      icon={Plus}
                      onClick={() => void walletAction(wallet, "default")}
                    />
                    <IconAction
                      label="Backup"
                      icon={Eye}
                      onClick={() => void walletAction(wallet, "reveal")}
                    />
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/wallet/$walletId" params={{ walletId: wallet.id }}>
                        History
                      </Link>
                    </Button>
                    {wallet.wallet_type !== "gasfree" && wallet.network === "trc20-mainnet" ? (
                      <Button asChild size="sm" variant="secondary">
                        <Link
                          to="/wallet/$walletId"
                          params={{ walletId: wallet.id }}
                          search={{ tab: "send" }}
                        >
                          Send
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        {tab === "accounts" ? (
          <Panel title="Vendor Accounts">
            <form className="grid gap-3 md:grid-cols-3" onSubmit={submitAccount}>
              <select
                className="h-10 rounded-md bg-black/50 px-3"
                value={accountForm.rail}
                onChange={(event) =>
                  setAccountForm({
                    ...accountForm,
                    rail: event.target.value as typeof accountForm.rail,
                  })
                }
              >
                <option value="upi">UPI</option>
                <option value="imps">IMPS</option>
                <option value="neft">NEFT</option>
                <option value="rtgs">RTGS</option>
              </select>
              <Input
                placeholder="Label"
                value={accountForm.label}
                onChange={(event) => setAccountForm({ ...accountForm, label: event.target.value })}
              />
              <Input
                placeholder="Holder"
                value={accountForm.holderName}
                onChange={(event) =>
                  setAccountForm({ ...accountForm, holderName: event.target.value })
                }
              />
              <Input
                placeholder="UPI ID / Account Ref"
                value={accountForm.accountRef}
                onChange={(event) =>
                  setAccountForm({ ...accountForm, accountRef: event.target.value })
                }
              />
              <Input
                placeholder="Bank"
                value={accountForm.bankName}
                onChange={(event) =>
                  setAccountForm({ ...accountForm, bankName: event.target.value })
                }
              />
              <Input
                placeholder="Account Number"
                value={accountForm.accountNumber}
                onChange={(event) =>
                  setAccountForm({ ...accountForm, accountNumber: event.target.value })
                }
              />
              <Input
                placeholder="IFSC"
                value={accountForm.ifsc}
                onChange={(event) => setAccountForm({ ...accountForm, ifsc: event.target.value })}
              />
              <Input
                placeholder="Min INR"
                value={accountForm.minInr}
                onChange={(event) => setAccountForm({ ...accountForm, minInr: event.target.value })}
              />
              <Input
                placeholder="Max INR"
                value={accountForm.maxInr}
                onChange={(event) => setAccountForm({ ...accountForm, maxInr: event.target.value })}
              />
              <Input
                placeholder="Daily Limit"
                value={accountForm.dailyLimitInr}
                onChange={(event) =>
                  setAccountForm({ ...accountForm, dailyLimitInr: event.target.value })
                }
              />
              <Input
                placeholder="Priority"
                value={accountForm.priority}
                onChange={(event) =>
                  setAccountForm({ ...accountForm, priority: event.target.value })
                }
              />
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accountForm.enabled}
                  onChange={(event) =>
                    setAccountForm({ ...accountForm, enabled: event.target.checked })
                  }
                />
                Enabled
              </label>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accountForm.frozen}
                  onChange={(event) =>
                    setAccountForm({ ...accountForm, frozen: event.target.checked })
                  }
                />
                Frozen
              </label>
              <Button className="bg-primary md:col-span-3">
                {accountForm.id ? "Update Account" : "Add Account"}
              </Button>
            </form>
            <AccountRows
              rows={portal.accounts}
              onEdit={(row) =>
                setAccountForm({
                  id: row.id,
                  rail: row.rail,
                  label: row.label ?? "",
                  holderName: row.holder_name ?? "",
                  accountRef: row.account_ref ?? "",
                  bankName: row.bank_name ?? "",
                  accountNumber: row.account_number ?? "",
                  ifsc: row.ifsc ?? "",
                  minInr: String(row.min_inr ?? 100),
                  maxInr: String(row.max_inr ?? 100000),
                  dailyLimitInr: String(row.daily_limit_inr ?? 500000),
                  priority: String(row.priority ?? 100),
                  enabled: Boolean(row.enabled ?? true),
                  frozen: Boolean(row.frozen ?? false),
                })
              }
              onAction={async (accountId, action) => {
                try {
                  await accountState({ data: { accountId, action } });
                  await load();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Account action failed");
                }
              }}
            />
          </Panel>
        ) : null}

        {tab === "trade" ? (
          <Panel title="Create USDT Sell Listing">
            <form className="grid gap-3 md:grid-cols-3" onSubmit={submitListing}>
              <Input
                placeholder="USDT amount"
                value={listingForm.amountUsdt}
                onChange={(event) =>
                  setListingForm({ ...listingForm, amountUsdt: event.target.value })
                }
              />
              <Input
                placeholder="INR rate"
                value={listingForm.rateInr}
                onChange={(event) =>
                  setListingForm({ ...listingForm, rateInr: event.target.value })
                }
              />
              <select
                className="h-10 rounded-md bg-black/50 px-3"
                value={listingForm.paymentAccountId}
                onChange={(event) =>
                  setListingForm({ ...listingForm, paymentAccountId: event.target.value })
                }
              >
                <option value="">Payment account</option>
                {portal.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label || account.account_ref}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Min INR"
                value={listingForm.minOrderInr}
                onChange={(event) =>
                  setListingForm({ ...listingForm, minOrderInr: event.target.value })
                }
              />
              <Input
                placeholder="Max INR"
                value={listingForm.maxOrderInr}
                onChange={(event) =>
                  setListingForm({ ...listingForm, maxOrderInr: event.target.value })
                }
              />
              <select
                className="h-10 rounded-md bg-black/50 px-3"
                value={listingForm.rail}
                onChange={(event) =>
                  setListingForm({
                    ...listingForm,
                    rail: event.target.value as typeof listingForm.rail,
                  })
                }
              >
                <option value="upi">UPI</option>
                <option value="imps">IMPS</option>
                <option value="neft">NEFT</option>
                <option value="rtgs">RTGS</option>
              </select>
              <textarea
                className="min-h-20 rounded-md bg-black/50 p-3 md:col-span-3"
                placeholder="Terms"
                value={listingForm.terms}
                onChange={(event) => setListingForm({ ...listingForm, terms: event.target.value })}
              />
              <Button className="bg-primary md:col-span-3">Create Listing</Button>
            </form>
            <ListingRows
              rows={portal.listings}
              accounts={portal.accounts}
              onEdit={(row) =>
                setListingForm({
                  id: row.id,
                  amountUsdt: String(row.total_usdt ?? ""),
                  rateInr: String(row.rate_inr ?? ""),
                  paymentAccountId: row.payment_account_id ?? "",
                  minOrderInr: String(row.min_order_inr ?? ""),
                  maxOrderInr: String(row.max_order_inr ?? ""),
                  rail: ((row.payment_rails ?? ["upi"])[0] as typeof listingForm.rail) ?? "upi",
                  terms: row.terms ?? "",
                })
              }
              onAction={async (listingId, action) => {
                try {
                  await listingState({ data: { listingId, action } });
                  await load();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Listing action failed");
                }
              }}
            />
          </Panel>
        ) : null}

        {tab === "orders" ? (
          <Panel title="Vendor Orders">
            <ListingRows rows={portal.listings} accounts={portal.accounts} />
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["active", "Active"],
                  ["payment_submitted", "Payment Submitted"],
                  ["completed", "Completed"],
                  ["disputed", "Disputed"],
                  ["expired", "Expired"],
                  ["cancelled", "Cancelled"],
                ] satisfies Array<[VendorOrderFilter, string]>
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={orderFilter === value ? "default" : "secondary"}
                  className={orderFilter === value ? "bg-primary" : ""}
                  onClick={() => setOrderFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <OrderRows
              rows={filteredOrders}
              onConfirm={confirmPayment}
              onDispute={disputePayment}
              reload={load}
            />
          </Panel>
        ) : null}

        {tab === "transactions" ? (
          <Panel title="Vendor Transactions">
            <OrderRows
              rows={submitted}
              onConfirm={confirmPayment}
              onDispute={disputePayment}
              reload={load}
            />
          </Panel>
        ) : null}

        {tab === "history" ? (
          <Panel title="Vendor History">
            <OrderRows
              rows={orders.filter((order) =>
                ["completed", "disputed", "expired", "cancelled"].includes(String(order.status)),
              )}
              onConfirm={confirmPayment}
              onDispute={disputePayment}
              reload={load}
            />
          </Panel>
        ) : null}

        {tab === "settings" ? (
          <Panel title="Vendor Settings">
            <MetricGrid
              items={[
                ["Business", portal.vendor.name ?? "-"],
                ["Contact", portal.vendor.contact_name ?? "-"],
                ["Email", portal.vendor.email ?? "-"],
                ["Telegram", portal.vendor.telegram_username ?? "-"],
              ]}
            />
            <Button className="mt-4 bg-primary" onClick={() => void signOut()}>
              Logout
            </Button>
          </Panel>
        ) : null}

        {tab === "more" ? (
          <Panel title="More">
            <MetricGrid
              items={[
                ["Business", portal.vendor.name ?? "-"],
                ["Contact", portal.vendor.contact_name ?? "-"],
                ["Email", portal.vendor.email ?? "-"],
                ["Telegram", portal.vendor.telegram_username ?? "-"],
              ]}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Payment Accounts", "accounts"],
                ["Transaction Review", "transactions"],
                ["History", "history"],
                ["Settings", "settings"],
              ].map(([label, nextTab]) => (
                <button
                  key={label}
                  className="rounded-lg border border-white/10 bg-black/30 p-4 text-left text-sm font-medium text-slate-100 transition hover:border-primary/60"
                  onClick={() => {
                    setTab(nextTab as VendorTab);
                    window.history.replaceState(null, "", `/vendor?tab=${nextTab}`);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button className="mt-4 bg-primary" onClick={() => void signOut()}>
              Logout
            </Button>
          </Panel>
        ) : null}
      </div>
    </main>
  );
}

function vendorTabFromSearch(search: Record<string, unknown>): VendorTab {
  const value = typeof search["tab"] === "string" ? search["tab"] : "home";
  return isVendorTab(value) ? value : "home";
}

function isVendorTab(value: string): value is VendorTab {
  return [
    "home",
    "wallet",
    "trade",
    "orders",
    "transactions",
    "history",
    "accounts",
    "settings",
    "more",
  ].includes(value);
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/6 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function MetricGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-white/10 bg-black/30 p-3">
          <p className="text-xs text-slate-400">{label}</p>
          <p className="mono mt-1 text-sm font-semibold">{value}</p>
        </div>
      ))}
    </div>
  );
}

function AccountRows({
  rows,
  onEdit,
  onAction,
}: {
  rows: AccountRow[];
  onEdit?: (row: AccountRow) => void;
  onAction?: (
    accountId: string,
    action: "enable" | "disable" | "freeze" | "unfreeze" | "archive" | "default",
  ) => Promise<void>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border border-white/10 bg-black/30 p-4">
          <p className="font-semibold">{row.label || row.account_ref}</p>
          <MetricGrid
            items={[
              ["Rail", row.rail.toUpperCase()],
              ["Holder", row.holder_name ?? "-"],
              ["Min", inr(row.min_inr)],
              ["Max", inr(row.max_inr)],
              ["Daily", inr(row.daily_limit_inr)],
              ["Status", row.status ?? "active"],
            ]}
          />
          {onEdit || onAction ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {onEdit ? <IconAction label="Edit" icon={Eye} onClick={() => onEdit(row)} /> : null}
              {onAction ? (
                <>
                  <IconAction
                    label={row.enabled ? "Disable" : "Enable"}
                    icon={row.enabled ? Pause : Play}
                    onClick={() => void onAction(row.id, row.enabled ? "disable" : "enable")}
                  />
                  <IconAction
                    label={row.frozen ? "Unfreeze" : "Freeze"}
                    icon={Snowflake}
                    onClick={() => void onAction(row.id, row.frozen ? "unfreeze" : "freeze")}
                  />
                  <IconAction
                    label="Default"
                    icon={Plus}
                    onClick={() => void onAction(row.id, "default")}
                  />
                  <IconAction
                    label="Archive"
                    icon={Trash2}
                    onClick={() => void onAction(row.id, "archive")}
                  />
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ListingRows({
  rows,
  accounts = [],
  onEdit,
  onAction,
}: {
  rows: ListingRow[];
  accounts?: AccountRow[];
  onEdit?: (row: ListingRow) => void;
  onAction?: (listingId: string, action: "pause" | "resume" | "close") => Promise<void>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((row) => {
        const account = accounts.find((item) => item.id === row.payment_account_id);
        return (
          <div key={row.id} className="rounded-lg border border-white/10 bg-black/30 p-4">
            <p className="font-semibold">{shortenHash(row.id)}</p>
            <MetricGrid
              items={[
                ["Total", `${formatUsdt(row.total_usdt)} USDT`],
                ["Available", `${formatUsdt(row.available_usdt)} USDT`],
                ["Reserved", `${formatUsdt(row.reserved_usdt)} USDT`],
                ["Rate", inr(row.rate_inr)],
                ["Min", inr(row.min_order_inr)],
                ["Max", inr(row.max_order_inr)],
                ["Account", account?.label || account?.account_ref || "-"],
                ["Rails", (row.payment_rails ?? []).join(", ").toUpperCase()],
                ["Status", row.status ?? "active"],
              ]}
            />
            {onEdit || onAction ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {onEdit ? <IconAction label="Edit" icon={Eye} onClick={() => onEdit(row)} /> : null}
                {onAction ? (
                  <>
                    <IconAction
                      label={row.status === "active" ? "Pause" : "Resume"}
                      icon={row.status === "active" ? Pause : Play}
                      onClick={() =>
                        void onAction(row.id, row.status === "active" ? "pause" : "resume")
                      }
                    />
                    <IconAction
                      label="Close"
                      icon={Trash2}
                      onClick={() => void onAction(row.id, "close")}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function IconAction({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <Button type="button" size="sm" variant="secondary" onClick={onClick} title={label}>
      <Icon className="mr-1.5 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

function OrderRows({
  rows,
  onConfirm,
  onDispute,
  reload,
}: {
  rows: OrderRow[];
  onConfirm: ReturnType<typeof useServerFn<typeof vendorConfirmPayment>>;
  onDispute: ReturnType<typeof useServerFn<typeof vendorDisputePayment>>;
  reload: () => Promise<void>;
}) {
  async function confirm(orderId: string) {
    try {
      await onConfirm({ data: { orderId } });
      toast.success("Payment confirmed");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not confirm");
    }
  }

  async function dispute(orderId: string) {
    const reason = window.prompt("Dispute reason");
    if (!reason?.trim()) return;
    try {
      await onDispute({ data: { orderId, reason: reason.trim() } });
      toast.success("Order disputed");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not dispute");
    }
  }

  if (!rows.length) return <p className="text-sm text-slate-400">No records yet.</p>;
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border border-white/10 bg-black/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="mono font-semibold">{row.order_ref ?? shortenHash(row.id)}</p>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{row.status}</span>
          </div>
          <MetricGrid
            items={[
              ["USDT", `${formatUsdt(row.usdt_amount)} USDT`],
              ["INR", inr(row.total_inr)],
              ["Rate", inr(row.rate_inr)],
              ["Fee", `${formatUsdt(row.vendor_fee_usdt)} USDT`],
              ["Rail", row.payment_rail?.toUpperCase() ?? "-"],
              ["UTR", row.utr_reference ?? "-"],
              ["Proof", row.payment_proof_path ? "Attached" : "-"],
              [
                "Deadline",
                row.payment_deadline ? new Date(row.payment_deadline).toLocaleString() : "-",
              ],
            ]}
          />
          {row.status === "payment_submitted" ? (
            <div className="mt-3 flex gap-2">
              <Button className="bg-primary" onClick={() => void confirm(row.id)}>
                Confirm
              </Button>
              <Button variant="secondary" onClick={() => void dispute(row.id)}>
                Dispute
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
