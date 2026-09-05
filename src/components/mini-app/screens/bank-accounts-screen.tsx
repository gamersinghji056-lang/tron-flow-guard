import type { FormEvent } from "react";
import {
  V17Button,
  V17EmptyLine,
  V17FormField,
  V17Input,
  V17MetricGrid,
  V17Screen,
  V17Section,
} from "@/components/mini-app/shared/v17-primitives";
import { paymentMethodDisplay } from "@/lib/mini-wallet-ui";

export interface MiniPaymentMethodRow {
  id: string;
  kind: string;
  label?: string | null;
  upi_id?: string | null;
  account_holder?: string | null;
  account_number?: string | null;
  ifsc?: string | null;
  bank_name?: string | null;
  is_default?: boolean | null;
  rail?: string | null;
  supported_rails?: string[] | null;
  min_inr?: number | string | null;
  max_inr?: number | string | null;
  daily_limit_inr?: number | string | null;
  daily_used_inr?: number | string | null;
  daily_remaining_inr?: number | string | null;
  status?: string | null;
  enabled?: boolean | null;
  frozen?: boolean | null;
}

function money(value: unknown, currency = "USDT") {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return currency === "INR" ? "₹0.00" : `0.00 ${currency}`;
  if (currency === "INR") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(numeric);
  }
  return `${numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} ${currency}`;
}

function vendorSupportedRails(method: MiniPaymentMethodRow) {
  const rails = method.supported_rails?.length
    ? method.supported_rails
    : method.rail === "all"
      ? ["imps", "neft", "rtgs"]
      : [method.rail ?? method.kind];
  return rails.filter(Boolean);
}

function PaymentMethodSummary({ method }: { method: MiniPaymentMethodRow | null | undefined }) {
  if (!method) return <V17EmptyLine>No payout method selected.</V17EmptyLine>;
  const display = paymentMethodDisplay(method);
  return (
    <div className="rounded-xl border border-white/10 bg-white/6 p-3">
      <p className="text-sm font-semibold">{display.title}</p>
      <div className="mt-2 space-y-1 text-xs text-slate-400">
        {display.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

export default function BankAccountsScreen(props: {
  vendorMode?: boolean;
  methods: MiniPaymentMethodRow[];
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
        <V17FormField key={key} label={label}>
          <V17Input
            value={props.vendorLimits[key]}
            onChange={(event) =>
              props.setVendorLimits({ ...props.vendorLimits, [key]: event.target.value })
            }
            placeholder={label}
            inputMode="decimal"
          />
        </V17FormField>
      ))}
    </div>
  ) : null;

  return (
    <V17Screen
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
        <V17Input
          value={props.upi.upiId}
          onChange={(event) => props.setUpi({ ...props.upi, upiId: event.target.value })}
          placeholder="UPI ID"
        />
        <V17Input
          value={props.upi.holderName}
          onChange={(event) => props.setUpi({ ...props.upi, holderName: event.target.value })}
          placeholder="Account Holder"
        />
        <V17Input
          value={props.upi.label}
          onChange={(event) => props.setUpi({ ...props.upi, label: event.target.value })}
          placeholder="Label"
        />
        {limitFields}
        <V17Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={props.busy}
        >
          Add UPI
        </V17Button>
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
        <V17Input
          value={props.bank.accountHolder}
          onChange={(event) => props.setBank({ ...props.bank, accountHolder: event.target.value })}
          placeholder="Account Holder"
        />
        <V17Input
          value={props.bank.accountNumber}
          onChange={(event) => props.setBank({ ...props.bank, accountNumber: event.target.value })}
          placeholder="Account Number"
        />
        <V17Input
          value={props.bank.ifsc}
          onChange={(event) => props.setBank({ ...props.bank, ifsc: event.target.value })}
          placeholder="IFSC"
        />
        <V17Input
          value={props.bank.bankName}
          onChange={(event) => props.setBank({ ...props.bank, bankName: event.target.value })}
          placeholder="Bank Name"
        />
        <V17Input
          value={props.bank.label}
          onChange={(event) => props.setBank({ ...props.bank, label: event.target.value })}
          placeholder="Label"
        />
        {limitFields}
        <V17Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={props.busy}
        >
          Add Bank
        </V17Button>
      </form>
      <V17Section title="Saved Methods">
        {props.methods.length ? (
          props.methods.map((method) => (
            <div key={method.id} className="rounded-xl border border-white/10 bg-white/6 p-3">
              <PaymentMethodSummary method={method} />
              {props.vendorMode ? (
                <V17MetricGrid
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
              <div className="mt-3 flex flex-wrap gap-2">
                <V17Button size="sm" variant="secondary" onClick={() => props.onDefault(method.id)}>
                  Set Default
                </V17Button>
                {props.vendorMode ? (
                  <>
                    <V17Button
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
                    </V17Button>
                    <V17Button
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
                    </V17Button>
                  </>
                ) : null}
                <V17Button size="sm" variant="secondary" onClick={() => props.onDelete(method.id)}>
                  {props.vendorMode ? "Archive" : "Delete"}
                </V17Button>
              </div>
            </div>
          ))
        ) : (
          <V17EmptyLine>No UPI or bank account yet.</V17EmptyLine>
        )}
      </V17Section>
    </V17Screen>
  );
}
