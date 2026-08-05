import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Blocks, Coins, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useListenerHeartbeat } from "@/hooks/use-listener-heartbeat";
import { formatUsdt, NETWORKS, type ChainNetwork } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHeader, StatCard } from "@/components/stat-card";
import { LiveDot } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Listener control — TRONDESK admin" },
      {
        name: "description",
        content:
          "Monitor the TRON blockchain listener, switch networks and review deposit settlement metrics.",
      },
      { property: "og:title", content: "Listener control — TRONDESK admin" },
      {
        property: "og:description",
        content: "Blockchain listener health, network selection and settlement metrics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminOverview,
});

interface LogRow {
  id: string;
  level: string;
  scope: string;
  message: string;
  latest_block: number | null;
  events_seen: number;
  deposits_updated: number;
  duration_ms: number | null;
  created_at: string;
}

function AdminOverview() {
  const { isAdmin, loading } = useAuth();
  const heartbeat = useListenerHeartbeat(isAdmin, 15_000);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [network, setNetwork] = useState<ChainNetwork | null>(null);
  const [confirmations, setConfirmations] = useState<number | null>(null);
  const [stats, setStats] = useState({ deposits: 0, confirmed: 0, credited: 0, traders: 0 });

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;

    async function load() {
      const [logRes, settingsRes, depositRes, profileRes] = await Promise.all([
        supabase
          .from("listener_logs")
          .select(
            "id, level, scope, message, latest_block, events_seen, deposits_updated, duration_ms, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(40),
        supabase.from("system_settings").select("key, value"),
        supabase.from("deposit_requests").select("status, received_amount"),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);

      if (!active) return;
      setLogs((logRes.data ?? []) as LogRow[]);

      const settings = Object.fromEntries((settingsRes.data ?? []).map((row) => [row.key, row.value]));
      setNetwork((settings["active_network"] as ChainNetwork) ?? null);
      setConfirmations(Number(settings["required_confirmations"] ?? 16));

      const deposits = depositRes.data ?? [];
      setStats({
        deposits: deposits.length,
        confirmed: deposits.filter((row) => row.status === "confirmed").length,
        credited: deposits
          .filter((row) => row.status === "confirmed")
          .reduce((sum, row) => sum + Number(row.received_amount ?? 0), 0),
        traders: profileRes.count ?? 0,
      });
    }

    void load();
    const channel = supabase
      .channel("admin-listener-logs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "listener_logs" },
        () => void load(),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  async function changeNetwork(next: ChainNetwork) {
    const { error } = await supabase
      .from("system_settings")
      .update({ value: next as never })
      .eq("key", "active_network");
    if (error) {
      toast.error("Could not switch network");
      return;
    }
    setNetwork(next);
    toast.success(`Listener switched to ${NETWORKS[next].label}`);
    void heartbeat.run();
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!isAdmin) {
    return (
      <div className="panel p-6">
        <h1 className="text-lg font-semibold">Admin access required</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This area is restricted to platform administrators.
        </p>
      </div>
    );
  }

  const levelColor: Record<string, string> = {
    info: "text-muted-foreground",
    warn: "text-warning",
    error: "text-destructive",
    success: "text-success",
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Listener status"
          value={
            <span className="flex items-center gap-2 text-base">
              <LiveDot online={heartbeat.online} />
              {heartbeat.online === false ? "Degraded" : heartbeat.online ? "Live" : "Idle"}
            </span>
          }
          icon={<Activity className="h-4 w-4" />}
          hint={`Required confirmations: ${confirmations ?? "—"}`}
        />
        <StatCard
          label="Latest block"
          value={heartbeat.lastBlock ? heartbeat.lastBlock.toLocaleString() : "—"}
          icon={<Blocks className="h-4 w-4" />}
          tone="info"
        />
        <StatCard
          label="Deposits settled"
          value={`${stats.confirmed}/${stats.deposits}`}
          icon={<Coins className="h-4 w-4" />}
          tone="success"
          hint={`${formatUsdt(stats.credited)} USDT credited`}
        />
        <StatCard label="Traders" value={stats.traders} icon={<Users className="h-4 w-4" />} />
      </div>

      <div className="panel p-5">
        <SectionHeader
          title="Network"
          description="Switching the network changes which chain the listener polls and which wallets are assigned."
          actions={
            <div className="flex items-center gap-2">
              <Select value={network ?? undefined} onValueChange={(value) => void changeNetwork(value as ChainNetwork)}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select network" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(NETWORKS).map((config) => (
                    <SelectItem key={config.id} value={config.id}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void heartbeat.run()}
                disabled={heartbeat.running}
              >
                <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", heartbeat.running && "animate-spin")} />
                Run pass
              </Button>
            </div>
          }
        />
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b px-5 py-3">
          <SectionHeader title="Listener log" description="Newest passes first." />
        </div>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-secondary/70 text-xs tracking-wide text-muted-foreground uppercase backdrop-blur">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Time</th>
                <th className="px-4 py-2.5 text-left font-medium">Scope</th>
                <th className="px-4 py-2.5 text-left font-medium">Message</th>
                <th className="px-4 py-2.5 text-left font-medium">Block</th>
                <th className="px-4 py-2.5 text-left font-medium">Events</th>
                <th className="px-4 py-2.5 text-left font-medium">Updated</th>
                <th className="px-4 py-2.5 text-left font-medium">ms</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No listener activity recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-secondary/30">
                    <td className="mono px-4 py-2 text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="mono px-4 py-2 text-xs">{log.scope}</td>
                    <td className={cn("px-4 py-2", levelColor[log.level])}>{log.message}</td>
                    <td className="mono px-4 py-2 text-xs">{log.latest_block ?? "—"}</td>
                    <td className="mono px-4 py-2 text-xs">{log.events_seen}</td>
                    <td className="mono px-4 py-2 text-xs">{log.deposits_updated}</td>
                    <td className="mono px-4 py-2 text-xs">{log.duration_ms ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
