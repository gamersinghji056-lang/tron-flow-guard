import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { V17Avatar } from "@/components/v17-avatar";
import { StatusBadge } from "@/components/status-badge";
import {
  V17CompactEmpty,
  V17FormField,
  V17MetricGrid,
  V17Screen,
  V17StatusPill,
  V17Surface,
  V17Tabs,
} from "@/components/mini-app/shared/v17-primitives";
import { v17Money } from "@/components/mini-app/shared/v17-format";
import { paymentMethodDisplay } from "@/lib/mini-wallet-ui";
import { shortenHash } from "@/lib/chain";

export type P2pTab = "buy" | "sell" | "myAds" | "myOrders";
export type P2pFilters = {
  bestRate: boolean;
  verified: boolean;
  upi: boolean;
  highCompletion: boolean;
};

export interface MiniAdRow {
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
    success_rate?: number | string | null;
    verified?: boolean | null;
  } | null;
}

export interface MiniOrderRow {
  id: string;
  order_ref?: string | null;
  side?: string | null;
  status?: string | null;
  usdt_amount?: number | string | null;
  total_inr?: number | string | null;
  created_at?: string | null;
}

export interface MiniPaymentMethodRow {
  id: string;
  kind: "upi" | "bank";
  upi_id?: string | null;
  holder_name?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc?: string | null;
  label?: string | null;
  is_default?: boolean | null;
}

export interface MiniSourceWalletRow {
  id: string;
  name?: string | null;
  address?: string | null;
}

function completionRate(ad: MiniAdRow) {
  if (ad.merchants?.success_rate != null) return `${Number(ad.merchants.success_rate).toFixed(0)}%`;
  const total = Number(ad.merchants?.total_orders ?? 0);
  const complete = Number(ad.merchants?.completed_orders ?? 0);
  if (!total) return complete ? "100%" : "New";
  return `${Math.round((complete / total) * 100)}%`;
}

function applyP2pFilters(ads: MiniAdRow[], filters: P2pFilters) {
  let next = ads.filter((ad) => ad.side === "sell");
  if (filters.verified) {
    next = next.filter(
      (ad) => ad.merchants?.verified || Number(ad.merchants?.completed_orders ?? 0) > 0,
    );
  }
  if (filters.upi) {
    next = next.filter((ad) =>
      (ad.payment_methods ?? []).some((method) => String(method).toLowerCase().includes("upi")),
    );
  }
  if (filters.highCompletion) {
    next = next.filter((ad) => {
      const total = Number(ad.merchants?.total_orders ?? 0);
      const completed = Number(ad.merchants?.completed_orders ?? 0);
      const rate = Number(ad.merchants?.success_rate ?? (total ? (completed / total) * 100 : 0));
      return rate >= 90 || completed >= 10;
    });
  }
  if (filters.bestRate) {
    next = [...next].sort((a, b) => Number(a.price_inr ?? 0) - Number(b.price_inr ?? 0));
  }
  return next;
}

function PaymentMethodPicker({
  methods,
  selectedId,
  setSelectedId,
}: {
  methods: MiniPaymentMethodRow[];
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
            <p className="text-sm font-semibold">{display.title}</p>
            <p className="mt-1 text-xs text-slate-500">{display.lines.join(" / ")}</p>
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
  wallets: MiniSourceWalletRow[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  availability: Record<string, number>;
}) {
  if (!wallets.length) {
    return (
      <V17CompactEmpty
        title="No funded Mainnet wallet"
        body="Create or import a standard Mainnet wallet before selling USDT."
      />
    );
  }
  return (
    <V17FormField label="Source wallet">
      <div className="space-y-2">
        {wallets.map((wallet) => (
          <button
            key={wallet.id}
            type="button"
            className={`w-full rounded-xl border p-3 text-left ${
              selectedId === wallet.id
                ? "border-primary bg-primary/12"
                : "border-white/10 bg-white/6"
            }`}
            onClick={() => setSelectedId(wallet.id)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{wallet.name ?? "Mainnet Wallet"}</p>
                <p className="mono truncate text-xs text-slate-500">{wallet.address}</p>
              </div>
              <p className="text-xs font-semibold text-slate-300">
                {v17Money(availability[wallet.id] ?? 0)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </V17FormField>
  );
}

function AdCard({ ad, onTake }: { ad: MiniAdRow; onTake: () => void }) {
  const name = ad.merchants?.display_name ?? "Advertiser";
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const verified =
    Number(ad.merchants?.completed_orders ?? 0) > 0 || Boolean(ad.merchants?.verified);
  return (
    <div className="border-b border-[#222837] py-[15px] last:border-b-0">
      <div className="flex items-start gap-[9px]">
        <V17Avatar initials={initials || "WT"} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">
            {name}{" "}
            <span
              className={verified ? "text-[8.5px] text-emerald-300" : "text-[8.5px] text-amber-300"}
            >
              {verified ? "VERIFIED" : "UNVERIFIED"}
            </span>
          </p>
          <p className="mt-1 text-[9px] text-slate-500">WTRON member / release tracked by orders</p>
        </div>
        <V17StatusPill label="Online" tone="success" />
      </div>
      <div className="mt-[10px] grid grid-cols-3 gap-[7px]">
        <div className="rounded-[14px] border border-[#222837] bg-[#10131a] p-3">
          <p className="text-[9px] text-slate-500">Total trades</p>
          <p className="mt-1 text-[17px] font-semibold tabular-nums">
            {String(ad.merchants?.completed_orders ?? 0)}
          </p>
        </div>
        <div className="rounded-[14px] border border-[#222837] bg-[#10131a] p-3">
          <p className="text-[9px] text-slate-500">Success rate</p>
          <p className="mt-1 text-[17px] font-semibold tabular-nums">{completionRate(ad)}</p>
        </div>
        <div className="rounded-[14px] border border-[#222837] bg-[#10131a] p-3">
          <p className="text-[9px] text-slate-500">WTRON wallet</p>
          <p className="mt-1 text-[17px] font-semibold tabular-nums">
            {v17Money(ad.available_usdt)} U
          </p>
        </div>
      </div>
      <p className="mt-[10px] text-[22px] font-semibold tracking-[-0.04em] tabular-nums">
        {v17Money(ad.price_inr, "INR")}{" "}
        <span className="text-[9px] font-normal text-slate-500">/ USDT</span>
      </p>
      <p className="mt-1 text-[8.8px] text-slate-500">
        {v17Money(ad.min_order_inr, "INR")}-{v17Money(ad.max_order_inr, "INR")} /{" "}
        {(ad.payment_methods ?? ["upi"]).join(" / ").toUpperCase()} / {v17Money(ad.available_usdt)}U
        available
      </p>
      <div className="mt-[10px] border-t border-dashed border-[#222837] pt-[7px] text-[9px]">
        <div className="flex justify-between">
          <span className="text-slate-500">Successful trades</span>
          <b>{ad.merchants?.completed_orders ?? 0}</b>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-slate-500">30-day completion</span>
          <b>{completionRate(ad)}</b>
        </div>
      </div>
      <div className="mt-[10px] flex justify-end gap-2">
        <Button size="sm" variant="secondary" type="button">
          Chat
        </Button>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={onTake}
        >
          {ad.side === "sell" ? "Buy" : "Sell"}
        </Button>
      </div>
    </div>
  );
}

function OrderList({ orders, empty }: { orders: MiniOrderRow[]; empty: string }) {
  if (!orders.length)
    return <V17CompactEmpty title={empty} body="Activity appears here as it happens." />;
  return (
    <div className="space-y-2">
      {orders.map((order) => (
        <div key={order.id} className="rounded-xl border border-white/10 bg-white/6 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="mono text-sm">{order.order_ref ?? shortenHash(order.id)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {(order.side ?? "order").toUpperCase()} ·{" "}
                {order.created_at ? new Date(order.created_at).toLocaleString() : "Created"}
              </p>
            </div>
            <StatusBadge status={String(order.status ?? "pending")} />
          </div>
          <V17MetricGrid
            items={[
              ["USDT", v17Money(order.usdt_amount)],
              ["INR", v17Money(order.total_inr, "INR")],
            ]}
          />
        </div>
      ))}
    </div>
  );
}

export default function P2pScreen(props: {
  vendorMode?: boolean;
  tab: P2pTab;
  setTab: (tab: P2pTab) => void;
  ads: MiniAdRow[];
  orders: MiniOrderRow[];
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
  paymentMethods: MiniPaymentMethodRow[];
  selectedPaymentMethodId: string;
  setSelectedPaymentMethodId: (id: string) => void;
  sourceWallets: MiniSourceWalletRow[];
  selectedSourceWalletId: string;
  setSelectedSourceWalletId: (id: string) => void;
  walletAvailability: Record<string, number>;
  filters: P2pFilters;
  setFilters: (filters: P2pFilters) => void;
  busy: boolean;
  onTakeAd: (ad: MiniAdRow) => void;
  onCreateAd: (event: FormEvent) => void;
}) {
  const filteredAds = applyP2pFilters(props.ads, props.filters);
  const buyAds = props.ads.filter((ad) => ad.side === "buy");
  const toggleFilter = (key: keyof P2pFilters) =>
    props.setFilters({ ...props.filters, [key]: !props.filters[key] });
  const filterItems: Array<[keyof P2pFilters, string]> = [
    ["bestRate", "Best rate"],
    ["verified", "Verified"],
    ["upi", "UPI"],
    ["highCompletion", "High completion"],
  ];
  return (
    <V17Screen
      title={props.vendorMode ? "P2P Sell" : "P2P Market"}
      subtitle={props.vendorMode ? "Vendor seller tools only" : "User-to-user USDT trading only"}
    >
      <V17Tabs
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
          <div className="flex gap-[7px] overflow-x-auto pb-1">
            {filterItems.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`shrink-0 rounded-full border px-[9px] py-[7px] text-[9px] ${
                  props.filters[key]
                    ? "border-white bg-white text-[#080a0f]"
                    : "border-[#222837] bg-[#10131a] text-slate-500"
                }`}
                onClick={() => toggleFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <V17FormField label="USDT amount">
            <Input
              value={props.p2pAmount}
              onChange={(event) => props.setP2pAmount(event.target.value)}
              placeholder="USDT amount"
            />
          </V17FormField>
          {filteredAds.length ? (
            filteredAds.map((ad) => (
              <AdCard key={ad.id} ad={ad} onTake={() => props.onTakeAd(ad)} />
            ))
          ) : (
            <V17CompactEmpty
              title="No seller ads"
              body="Create a sell ad from the Sell tab or check again later."
            />
          )}
        </div>
      ) : null}
      {props.tab === "sell" ? (
        <div className="space-y-3">
          {!props.vendorMode ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/6 p-3">
              <div>
                <p className="text-[11px] font-semibold text-white">Sell into buyer ads</p>
                <p className="mt-1 text-[10px] text-slate-500">
                  Select a funded Mainnet wallet before accepting a buyer request.
                </p>
              </div>
              <V17FormField label="USDT amount">
                <Input
                  value={props.p2pAmount}
                  onChange={(event) => props.setP2pAmount(event.target.value)}
                  placeholder="USDT amount"
                />
              </V17FormField>
              {props.paymentMethods.length ? (
                <V17FormField label="Payout UPI">
                  <PaymentMethodPicker
                    methods={props.paymentMethods}
                    selectedId={props.selectedPaymentMethodId}
                    setSelectedId={props.setSelectedPaymentMethodId}
                  />
                </V17FormField>
              ) : (
                <V17CompactEmpty
                  title="Add UPI ID first"
                  body="A saved active UPI account is required when you sell into buyer ads."
                />
              )}
              <SourceWalletPicker
                wallets={props.sourceWallets}
                selectedId={props.selectedSourceWalletId}
                setSelectedId={props.setSelectedSourceWalletId}
                availability={props.walletAvailability}
              />
              {buyAds.length ? (
                buyAds.map((ad) => <AdCard key={ad.id} ad={ad} onTake={() => props.onTakeAd(ad)} />)
              ) : (
                <V17CompactEmpty
                  title="No buyer ads"
                  body="Create your own sell ad below or check buyer requests later."
                />
              )}
            </div>
          ) : null}
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
                <V17FormField key={field} label={label}>
                  <Input
                    value={props.sellAd[field]}
                    onChange={(event) =>
                      props.setSellAd({ ...props.sellAd, [field]: event.target.value })
                    }
                    placeholder={label}
                  />
                </V17FormField>
              );
            })}
            {props.paymentMethods.length ? (
              <V17FormField label="Saved UPI">
                <PaymentMethodPicker
                  methods={props.paymentMethods}
                  selectedId={props.selectedPaymentMethodId}
                  setSelectedId={props.setSelectedPaymentMethodId}
                />
              </V17FormField>
            ) : (
              <V17CompactEmpty
                title="Add UPI ID first"
                body="A saved active UPI account is required for sell ads."
              />
            )}
            <SourceWalletPicker
              wallets={props.sourceWallets}
              selectedId={props.selectedSourceWalletId}
              setSelectedId={props.setSelectedSourceWalletId}
              availability={props.walletAvailability}
            />
            <textarea
              className="min-h-20 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none focus:border-primary"
              value={props.sellAd.terms}
              onChange={(event) => props.setSellAd({ ...props.sellAd, terms: event.target.value })}
              placeholder="Terms"
            />
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={
                props.busy ||
                !props.paymentMethods.length ||
                !props.selectedPaymentMethodId ||
                !props.sourceWallets.length ||
                !props.selectedSourceWalletId
              }
            >
              Create Sell Ad
            </Button>
          </form>
        </div>
      ) : null}
      {props.tab === "myAds" ? (
        <V17CompactEmpty title="No ads yet" body="Your sell ads will appear here after creation." />
      ) : null}
      {props.tab === "myOrders" ? (
        <OrderList orders={props.orders} empty="No P2P orders yet." />
      ) : null}
    </V17Screen>
  );
}
