import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, Blocks, Coins, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { getAdminDashboard } from "@/lib/admin.functions";
import { triggerListenerTick } from "@/lib/deposits.functions";
import { formatUsdt } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { SectionHeader, StatCard } from "@/components/stat-card";
import { LiveDot } from "@/components/status-badge";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Operations dashboard - WTRON admin" },
      {
        name: "description",
        content:
          "Real platform metrics, P2P activity, direct sell state and blockchain worker health.",
      },
    ],
  }),
  component: AdminOverview,
});

type DashboardData = Awaited<ReturnType<typeof getAdminDashboard>>;

function AdminOverview() {
  const loadDashboard = useServerFn(getAdminDashboard);
  const runTick = useServerFn(triggerListenerTick);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setData(await loadDashboard());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load dashboard metrics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function triggerManualTick() {
    setRunning(true);
    try {
      const result = await runTick({ data: { mode: "manual" } });
      toast.success(result.ok ? "Listener pass completed" : "Listener pass completed with errors");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not trigger listener");
    } finally {
      setRunning(false);
    }
  }

  const health = data?.blockchainHealth;
  const healthy = health?.status === "healthy";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Operations dashboard"
        description="All values are computed from backend database state. Empty systems show zeros."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void triggerManualTick()}
            disabled={running}
          >
            <RefreshCw
              className={running ? "mr-1.5 h-3.5 w-3.5 animate-spin" : "mr-1.5 h-3.5 w-3.5"}
            />
            Trigger listener
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Users"
          value={data?.totalUsers ?? 0}
          icon={<Users className="h-4 w-4" />}
          loading={loading}
        />
        <StatCard
          label="Active Users 24H"
          value={data?.activeUsers24h ?? 0}
          icon={<Activity className="h-4 w-4" />}
          loading={loading}
        />
        <StatCard
          label="24H P2P Volume"
          value={`${formatUsdt(data?.p2pVolume24h)} USDT`}
          icon={<Coins className="h-4 w-4" />}
          loading={loading}
        />
        <StatCard
          label="Blockchain Health"
          value={
            <span className="flex items-center gap-2 text-base">
              <LiveDot online={healthy} />
              {healthy ? "HEALTHY" : health?.status === "degraded" ? "DEGRADED" : "OFFLINE"}
            </span>
          }
          icon={<Blocks className="h-4 w-4" />}
          tone={healthy ? "success" : "warning"}
          hint={health?.reason ?? "No worker heartbeat recorded"}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active P2P Orders" value={data?.activeP2pOrders ?? 0} loading={loading} />
        <StatCard label="Completed Orders" value={data?.completedOrders ?? 0} loading={loading} />
        <StatCard
          label="Open Disputes"
          value={data?.openDisputes ?? 0}
          loading={loading}
          tone="warning"
        />
        <StatCard
          label="Pending Direct Sell"
          value={data?.pendingDirectSellOrders ?? 0}
          loading={loading}
        />
        <StatCard label="Pending Deposits" value={data?.pendingDeposits ?? 0} loading={loading} />
        <StatCard label="Credited Deposits" value={data?.creditedDeposits ?? 0} loading={loading} />
        <StatCard
          label="Total USDT Deposited"
          value={`${formatUsdt(data?.totalUsdtDeposited)} USDT`}
          loading={loading}
        />
        <StatCard
          label="Total USDT Withdrawn"
          value={`${formatUsdt(data?.totalUsdtWithdrawn)} USDT`}
          loading={loading}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="panel overflow-hidden">
          <div className="border-b px-5 py-3">
            <SectionHeader
              title="Recent P2P Orders"
              description="Newest order records from the database."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Order</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">USDT</th>
                  <th className="px-4 py-2.5 text-left font-medium">INR</th>
                  <th className="px-4 py-2.5 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.recentP2pOrders ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      No P2P orders yet.
                    </td>
                  </tr>
                ) : (
                  data?.recentP2pOrders.map((row) => (
                    <tr key={row.id}>
                      <td className="mono px-4 py-2.5">{row.order_ref}</td>
                      <td className="px-4 py-2.5">{row.status}</td>
                      <td className="mono px-4 py-2.5">{formatUsdt(row.usdt_amount)}</td>
                      <td className="mono px-4 py-2.5">
                        {Number(row.total_inr ?? 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel p-5">
          <SectionHeader
            title="Blockchain Worker"
            description="Authoritative persisted worker/listener health."
          />
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Latest block</span>
              <span className="mono">{health?.latestBlock?.toLocaleString() ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Worker heartbeat</span>
              <span className="mono text-xs">
                {health?.workerUpdatedAt ? new Date(health.workerUpdatedAt).toLocaleString() : "-"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Listener heartbeat</span>
              <span className="mono text-xs">
                {health?.listenerUpdatedAt
                  ? new Date(health.listenerUpdatedAt).toLocaleString()
                  : "-"}
              </span>
            </div>
            {!healthy ? (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-warning">
                <AlertTriangle className="mr-1 inline h-4 w-4" />
                {health?.reason ?? "Worker is not reporting healthy state."}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
