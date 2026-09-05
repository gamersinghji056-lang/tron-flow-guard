import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { V17Avatar } from "@/components/v17-avatar";
import {
  V17CompactEmpty,
  V17FormField,
  V17MetricGrid,
  V17Screen,
  V17SegmentedControl,
  V17StatusPill,
  V17Surface,
} from "@/components/mini-app/shared/v17-primitives";
import { v17Money } from "@/components/mini-app/shared/v17-format";
import { paymentMethodDisplay } from "@/lib/mini-wallet-ui";

export type TradeTab = "sell" | "buy";

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

export interface MiniVendorListingRow {
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

function VendorCard({ listing, onBuy }: { listing: MiniVendorListingRow; onBuy: () => void }) {
  const name = listing.trading_vendors?.name ?? "Verified Vendor";
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="border-b border-[#222837] py-[15px] last:border-b-0">
      <div className="flex items-start gap-[10px]">
        <V17Avatar initials={initials || "WV"} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">
            {name} <span className="text-[8.5px] text-emerald-300">VERIFIED</span>
          </p>
          <p className="mt-1 text-[9px] text-slate-500">
            {listing.trading_vendors?.completed_orders ?? 0} completed / Approved Vendor
          </p>
        </div>
        <V17StatusPill label="ACTIVE" tone="success" />
      </div>
      <div className="mt-[11px] grid grid-cols-3 gap-[7px]">
        <div className="rounded-[14px] border border-[#222837] bg-[#10131a] p-3">
          <p className="text-[9px] text-slate-500">Available</p>
          <p className="mt-1 text-[17px] font-semibold tabular-nums">
            {v17Money(listing.available_usdt)} U
          </p>
        </div>
        <div className="rounded-[14px] border border-[#222837] bg-[#10131a] p-3">
          <p className="text-[9px] text-slate-500">Rate</p>
          <p className="mt-1 text-[17px] font-semibold tabular-nums">
            {v17Money(listing.rate_inr, "INR")}
          </p>
        </div>
        <div className="rounded-[14px] border border-[#222837] bg-[#10131a] p-3">
          <p className="text-[9px] text-slate-500">Limits</p>
          <p className="mt-1 text-[17px] font-semibold tabular-nums">
            {v17Money(listing.min_order_inr, "INR")}-{v17Money(listing.max_order_inr, "INR")}
          </p>
        </div>
      </div>
      <p className="mt-[10px] text-[8.8px] text-slate-500">
        {(listing.payment_rails ?? []).join(" / ").toUpperCase()} / Vendor marketplace liquidity
      </p>
      <div className="mt-[10px] flex justify-end gap-2">
        <Button size="sm" variant="secondary" type="button">
          Details
        </Button>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={onBuy}
        >
          Buy USDT
        </Button>
      </div>
    </div>
  );
}

export default function TradeScreen(props: {
  vendorMode?: boolean;
  tab: TradeTab;
  setTab: (tab: TradeTab) => void;
  amount: string;
  setAmount: (value: string) => void;
  paymentMethods: MiniPaymentMethodRow[];
  selectedPaymentMethodId: string;
  setSelectedPaymentMethodId: (id: string) => void;
  vendors: MiniVendorListingRow[];
  vendorAmount: string;
  setVendorAmount: (value: string) => void;
  rail: "upi" | "imps" | "neft" | "rtgs";
  setRail: (rail: "upi" | "imps" | "neft" | "rtgs") => void;
  busy: boolean;
  onSell: (event: FormEvent) => void;
  onBuy: (listing: MiniVendorListingRow) => void;
  onAddPayment: () => void;
}) {
  return (
    <V17Screen
      title={props.vendorMode ? "Vendor Trade" : "WTRON Trade"}
      subtitle={
        props.vendorMode
          ? "Approved vendors can sell USDT to WTRON. Buy-side trader actions are hidden."
          : "Company and verified-vendor trading"
      }
    >
      {props.vendorMode ? null : (
        <V17SegmentedControl
          value={props.tab}
          setValue={(value) => props.setTab(value as TradeTab)}
          items={[
            ["sell", "Sell to WTRON"],
            ["buy", "Buy from Vendors"],
          ]}
        />
      )}
      {props.tab === "sell" ? (
        <form className="space-y-4" onSubmit={props.onSell}>
          <V17Surface className="p-4">
            <div className="flex w-full items-center justify-between gap-3">
              <h2 className="text-[15px] font-medium">
                {props.vendorMode ? "Create Vendor Sell Order" : "Sell USDT to WTRON"}
              </h2>
            </div>
            <V17MetricGrid
              items={[
                ["WTRON Buy Rate", "Configured by admin"],
                ["Payout", "Saved UPI or bank"],
              ]}
            />
            <div className="mt-4 space-y-3">
              <V17FormField label="USDT amount">
                <Input
                  value={props.amount}
                  onChange={(event) => props.setAmount(event.target.value)}
                  placeholder="USDT amount"
                />
              </V17FormField>
              {props.paymentMethods.length ? (
                <V17FormField label="Payout account">
                  <PaymentMethodPicker
                    methods={props.paymentMethods}
                    selectedId={props.selectedPaymentMethodId}
                    setSelectedId={props.setSelectedPaymentMethodId}
                  />
                </V17FormField>
              ) : (
                <V17CompactEmpty
                  title={props.vendorMode ? "Add payout account first" : "Add payout method first"}
                  body={
                    props.vendorMode
                      ? "Vendor Direct Sell requires an active vendor payout account."
                      : "Direct sell payouts require a saved payment account."
                  }
                />
              )}
            </div>
          </V17Surface>
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
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={props.busy || !props.paymentMethods.length || !props.selectedPaymentMethodId}
          >
            {props.vendorMode ? "Create Vendor Sell Order" : "Create Sell Order"}
          </Button>
        </form>
      ) : null}
      {!props.vendorMode && props.tab === "buy" ? (
        <div className="space-y-3">
          <V17FormField label="USDT amount">
            <Input
              value={props.vendorAmount}
              onChange={(event) => props.setVendorAmount(event.target.value)}
              placeholder="USDT amount"
            />
          </V17FormField>
          <V17SegmentedControl
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
            <V17CompactEmpty
              title="No offers"
              body="No verified vendor offers are active for this rail."
            />
          )}
        </div>
      ) : null}
    </V17Screen>
  );
}
