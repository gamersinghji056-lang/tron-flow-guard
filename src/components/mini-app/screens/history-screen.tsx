import {
  V17EmptyLine,
  V17MetricGrid,
  V17Screen,
} from "@/components/mini-app/shared/v17-primitives";
import { formatUsdt } from "@/lib/chain";

function money(value: unknown, currency = "USDT") {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return currency === "INR" ? "INR 0.00" : formatUsdt(0);
  if (currency === "INR") {
    return `INR ${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  return formatUsdt(number);
}

function GenericRow({ row }: { row: Record<string, unknown> }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/6 p-3">
      <p className="mono text-sm">{String(row["order_ref"] ?? row["id"] ?? "Trade")}</p>
      <V17MetricGrid
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

export default function HistoryScreen({ rows }: { rows: unknown[] }) {
  return (
    <V17Screen title="History" subtitle="Company and vendor trade history">
      {rows.length ? (
        rows.map((row, index) => <GenericRow key={index} row={row as Record<string, unknown>} />)
      ) : (
        <V17EmptyLine>No trades yet.</V17EmptyLine>
      )}
    </V17Screen>
  );
}
