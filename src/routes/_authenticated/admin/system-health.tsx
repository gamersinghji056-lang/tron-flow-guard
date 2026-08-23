import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/admin/system-health")({
  component: SystemHealthPage,
});

interface HeartbeatRow {
  service: string;
  status?: string | null;
  last_heartbeat_at?: string | null;
  last_success_at?: string | null;
  last_error_at?: string | null;
  last_error_message?: string | null;
  error_count_24h?: number | null;
  metadata?: Record<string, unknown> | null;
}

interface ErrorRow {
  id: string;
  service: string;
  severity: string;
  error_code?: string | null;
  safe_message: string;
  related_order_id?: string | null;
  related_user_id?: string | null;
  related_txid?: string | null;
  stage?: string | null;
  address?: string | null;
  retryable?: boolean | null;
  metadata?: Record<string, unknown> | null;
  resolved_at?: string | null;
  created_at: string;
}

function SystemHealthPage() {
  const [heartbeats, setHeartbeats] = useState<HeartbeatRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [service, setService] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [resolved, setResolved] = useState("all");

  const load = useCallback(async () => {
    const [heartbeatRes, errorRes] = await Promise.all([
      supabase
        .from("service_heartbeats" as never)
        .select("*")
        .order("service", { ascending: true }),
      supabase
        .from("system_error_logs" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (heartbeatRes.error) toast.error(heartbeatRes.error.message);
    if (errorRes.error) toast.error(errorRes.error.message);
    setHeartbeats((heartbeatRes.data ?? []) as unknown as HeartbeatRow[]);
    setErrors((errorRes.data ?? []) as unknown as ErrorRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = errors.filter(
    (row) =>
      (service === "all" || row.service === service) &&
      (severity === "all" || row.severity === severity) &&
      (resolved === "all" || (resolved === "open" ? !row.resolved_at : Boolean(row.resolved_at))),
  );
  const services = [
    "WEB",
    "BLOCKCHAIN WORKER",
    "TELEGRAM WORKER",
    "ORDER WORKER",
    "SUPABASE",
    "API",
    "WEBHOOKS",
    "SIGNER",
    "GASFREE",
  ];

  async function markResolved(id: string) {
    const { error } = await supabase
      .from("system_error_logs" as never)
      .update({ resolved_at: new Date().toISOString() } as never)
      .eq("id", id as never);
    if (error) toast.error(error.message);
    await load();
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="System Health"
        description="Service heartbeats, safe error messages and blockchain-worker diagnostics."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {services.map((name) => {
          const row = heartbeats.find((item) => item.service === name);
          return (
            <div key={name} className="panel p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">{name}</h2>
                <span className="rounded-full bg-secondary px-2 py-1 text-xs">
                  {row?.status ?? "unknown"}
                </span>
              </div>
              <Metric label="Last heartbeat" value={formatTime(row?.last_heartbeat_at)} />
              <Metric label="Last success" value={formatTime(row?.last_success_at)} />
              <Metric label="Last error" value={formatTime(row?.last_error_at)} />
              <Metric label="Errors 24h" value={String(row?.error_count_24h ?? 0)} />
              {row?.last_error_message ? (
                <p className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  {row.last_error_message}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="panel p-4">
        <h2 className="font-semibold">Blockchain Detail</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {Object.entries(
            heartbeats.find((row) => row.service === "BLOCKCHAIN WORKER")?.metadata ?? {},
          ).map(([key, value]) => (
            <Metric key={key} label={key.replaceAll("_", " ")} value={String(value)} />
          ))}
        </div>
      </div>

      <div className="panel p-4">
        <h2 className="font-semibold">GasFree</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {Object.entries(heartbeats.find((row) => row.service === "GASFREE")?.metadata ?? {}).map(
            ([key, value]) => (
              <Metric key={key} label={key.replaceAll("_", " ")} value={String(value)} />
            ),
          )}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <h2 className="font-semibold">Errors</h2>
          <select
            className="ml-auto h-9 rounded-md border bg-background px-3 text-sm"
            value={service}
            onChange={(event) => setService(event.target.value)}
          >
            <option value="all">All services</option>
            {services.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
          >
            <option value="all">All severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="critical">Critical</option>
          </select>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={resolved}
            onChange={(event) => setResolved(event.target.value)}
          >
            <option value="all">All states</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Time</th>
              <th className="px-4 py-2 text-left">Service</th>
              <th className="px-4 py-2 text-left">Severity</th>
              <th className="px-4 py-2 text-left">Code</th>
              <th className="px-4 py-2 text-left">Stage</th>
              <th className="px-4 py-2 text-left">Safe Message</th>
              <th className="px-4 py-2 text-left">Reference</th>
              <th className="px-4 py-2 text-left">Retry</th>
              <th className="px-4 py-2 text-left">Resolved</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((row) => (
              <tr key={row.id}>
                <td className="mono px-4 py-2 text-xs">{formatTime(row.created_at)}</td>
                <td className="px-4 py-2">{row.service}</td>
                <td className="px-4 py-2">{row.severity}</td>
                <td className="mono px-4 py-2 text-xs">{row.error_code ?? "-"}</td>
                <td className="px-4 py-2">{row.stage ?? "-"}</td>
                <td className="px-4 py-2">{row.safe_message}</td>
                <td className="mono px-4 py-2 text-xs">
                  {row.related_txid ??
                    row.related_order_id ??
                    row.related_user_id ??
                    row.address ??
                    "-"}
                </td>
                <td className="px-4 py-2">{row.retryable ? "YES" : "NO"}</td>
                <td className="px-4 py-2">
                  {row.resolved_at ? (
                    formatTime(row.resolved_at)
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => void markResolved(row.id)}>
                      Mark resolved
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mono text-sm">{value}</p>
    </div>
  );
}

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}
