import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { fetchUserAnalytics } from "@/lib/user-product.functions";
import { formatUsdt } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics - WTRON" }] }),
  component: AnalyticsPage,
});

type Range = "today" | "7d" | "30d";

interface Analytics {
  totalUsdtVolume: number;
  totalInrVolume: number;
  p2pBuyVolume: number;
  p2pSellVolume: number;
  companyTradeVolume: number;
  feesPaid: number;
  completedOrders: number;
  disputes: number;
  successRate: number;
  averageSettlementMinutes: number;
  walletInflow: number;
  walletOutflow: number;
  chart: { date: string; usdt: number; inr: number }[];
}

function AnalyticsPage() {
  const loadAnalytics = useServerFn(fetchUserAnalytics);
  const [range, setRange] = useState<Range>("30d");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadAnalytics({ data: { range } })
      .then((result) => setData(result as Analytics))
      .catch(() => toast.error("Unable to load analytics. Please try again."))
      .finally(() => setLoading(false));
  }, [loadAnalytics, range]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader
          title="Analytics"
          description="Your trading, fee and wallet movement metrics from live WTRON records."
        />
        <div className="flex gap-2">
          {(["today", "7d", "30d"] as const).map((item) => (
            <Button
              key={item}
              size="sm"
              variant={range === item ? "default" : "secondary"}
              onClick={() => setRange(item)}
            >
              {item === "today" ? "Today" : item.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="panel grid h-48 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <Empty />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Total USDT Volume" value={`${formatUsdt(data.totalUsdtVolume)} USDT`} />
            <Metric
              label="Total INR Volume"
              value={`INR ${data.totalInrVolume.toLocaleString("en-IN")}`}
            />
            <Metric label="Fees Paid" value={`${formatUsdt(data.feesPaid)} USDT`} />
            <Metric label="Success Rate" value={`${data.successRate}%`} />
            <Metric label="P2P Buy" value={`${formatUsdt(data.p2pBuyVolume)} USDT`} />
            <Metric label="P2P Sell" value={`${formatUsdt(data.p2pSellVolume)} USDT`} />
            <Metric label="Company Trade" value={`${formatUsdt(data.companyTradeVolume)} USDT`} />
            <Metric label="Completed Orders" value={String(data.completedOrders)} />
            <Metric label="Disputes" value={String(data.disputes)} />
            <Metric label="Avg Settlement" value={`${data.averageSettlementMinutes} min`} />
            <Metric label="Wallet Inflow" value={`${formatUsdt(data.walletInflow)} USDT`} />
            <Metric label="Wallet Outflow" value={`${formatUsdt(data.walletOutflow)} USDT`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartPanel title="USDT Volume">
              {data.chart.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.chart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="usdt" stroke="hsl(var(--primary))" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Empty />
              )}
            </ChartPanel>
            <ChartPanel title="INR Volume">
              {data.chart.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.chart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="inr" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Empty />
              )}
            </ChartPanel>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mono mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Empty() {
  return (
    <div className="grid h-40 place-items-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
      No data for this period.
    </div>
  );
}
