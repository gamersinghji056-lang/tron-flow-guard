import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  fetchVendorApplication,
  fetchVendorPortal,
  saveVendorAccount,
  saveVendorListing,
  vendorConfirmPayment,
  vendorDisputePayment,
} from "@/lib/vendor.functions";
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
  "home" | "wallet" | "trade" | "orders" | "transactions" | "history" | "accounts" | "settings";

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
  balance?: number | string | null;
  onchain_balance?: number | string | null;
  onchain_trx_balance?: number | string | null;
  is_default?: boolean | null;
  wallet_type?: string | null;
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
  const getApplication = useServerFn(fetchVendorApplication);
  const getPortal = useServerFn(fetchVendorPortal);
  const saveAccount = useServerFn(saveVendorAccount);
  const saveListing = useServerFn(saveVendorListing);
  const confirmPayment = useServerFn(vendorConfirmPayment);
  const disputePayment = useServerFn(vendorDisputePayment);
  const [tab, setTab] = useState<VendorTab>("home");
  const [application, setApplication] = useState<VendorRow | null>(null);
  const [portal, setPortal] = useState<PortalData | null>(null);
  const [pending, setPending] = useState(true);
  const [accountForm, setAccountForm] = useState({
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
  });
  const [listingForm, setListingForm] = useState({
    amountUsdt: "",
    rateInr: "",
    paymentAccountId: "",
    minOrderInr: "",
    maxOrderInr: "",
    rail: "upi" as "upi" | "imps" | "neft" | "rtgs",
    terms: "",
  });

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

  const orders = portal?.orders ?? [];
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
          priority: 100,
          isDefault: !(portal?.accounts.length ?? 0),
          enabled: true,
          frozen: false,
        },
      });
      toast.success("Vendor account saved");
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
      setListingForm((current) => ({ ...current, amountUsdt: "", rateInr: "", terms: "" }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save listing");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/vendor/login", replace: true });
  }

  if (pending) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#05070B] text-white">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
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
          <Button className="mt-5 bg-blue-600" onClick={() => void signOut()}>
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
                className={`rounded-md px-3 py-1.5 text-sm capitalize ${tab === item ? "bg-blue-600" : "text-slate-400 hover:bg-white/10"}`}
                onClick={() => setTab(item)}
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
              className={`rounded-md px-3 py-1.5 text-sm capitalize ${tab === item ? "bg-blue-600" : "bg-white/6 text-slate-300"}`}
              onClick={() => setTab(item)}
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
            <p className="text-sm text-slate-400">
              Vendor wallets reuse the same personal TRON wallet backend and security model.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(portal.wallets ?? []).map((wallet) => (
                <div key={wallet.id} className="rounded-lg border border-white/10 bg-white/6 p-4">
                  <p className="font-semibold">{wallet.name ?? "Wallet"}</p>
                  <p className="mono mt-1 break-all text-xs text-slate-400">{wallet.address}</p>
                  <MetricGrid
                    items={[
                      ["USDT", formatUsdt(walletDisplayBalance(wallet))],
                      ["TRX", `${formatUsdt(wallet.onchain_trx_balance)} TRX`],
                      ["Type", wallet.wallet_type ?? "standard"],
                    ]}
                  />
                </div>
              ))}
            </div>
            <Button asChild className="mt-4 bg-blue-600">
              <Link to="/wallet">Open Wallet Tools</Link>
            </Button>
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
              <Button className="bg-blue-600 md:col-span-3">Add Account</Button>
            </form>
            <AccountRows rows={portal.accounts} />
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
              <Button className="bg-blue-600 md:col-span-3">Create Listing</Button>
            </form>
            <ListingRows rows={portal.listings} />
          </Panel>
        ) : null}

        {tab === "orders" ? (
          <Panel title="Vendor Orders">
            <ListingRows rows={portal.listings} />
            <OrderRows
              rows={orders}
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
            <Button className="mt-4 bg-blue-600" onClick={() => void signOut()}>
              Logout
            </Button>
          </Panel>
        ) : null}
      </div>
    </main>
  );
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

function AccountRows({ rows }: { rows: AccountRow[] }) {
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
        </div>
      ))}
    </div>
  );
}

function ListingRows({ rows }: { rows: ListingRow[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((row) => (
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
              ["Rails", (row.payment_rails ?? []).join(", ").toUpperCase()],
              ["Status", row.status ?? "active"],
            ]}
          />
        </div>
      ))}
    </div>
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
              <Button className="bg-blue-600" onClick={() => void confirm(row.id)}>
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
