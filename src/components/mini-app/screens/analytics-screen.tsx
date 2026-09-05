import {
  V17EmptyLine,
  V17MetricGrid,
  V17Screen,
  V17Tabs,
} from "@/components/mini-app/shared/v17-primitives";
import { formatUsdt } from "@/lib/chain";

export interface MiniAnalyticsSummary {
  totalUsdtVolume: number;
  p2pBuyVolume: number;
  p2pSellVolume: number;
  companyTradeVolume: number;
  feesPaid: number;
  completedOrders: number;
  disputes: number;
  chart: { date: string; usdt: number }[];
}

function money(value: unknown, currency = "USDT") {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return currency === "INR" ? "INR 0.00" : formatUsdt(0);
  if (currency === "INR") {
    return `INR ${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  return formatUsdt(number);
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
              className="flex-1 rounded-t bg-primary"
              style={{ height: `${Math.max(4, (Number(row.usdt ?? 0) / max) * 100)}%` }}
            />
          ))
      ) : (
        <p className="m-auto text-sm text-slate-400">No chart data</p>
      )}
    </div>
  );
}

export default function AnalyticsScreen({ data }: { data: MiniAnalyticsSummary | null }) {
  return (
    <V17Screen title="Analytics" subtitle="Real WTRON trading metrics">
      <V17Tabs
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
          <V17MetricGrid
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
        <V17EmptyLine>No analytics data yet.</V17EmptyLine>
      )}
    </V17Screen>
  );
}
