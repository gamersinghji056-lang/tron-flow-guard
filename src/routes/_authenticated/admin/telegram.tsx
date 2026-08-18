import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, ShieldOff, Unlink } from "lucide-react";
import { toast } from "sonner";
import { fetchAdminTelegramOverview, setTelegramAccountStatus } from "@/lib/telegram.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/admin/telegram")({
  head: () => ({ meta: [{ title: "Telegram operations - TRONDESK" }] }),
  component: AdminTelegramPage,
});

interface TelegramOverview {
  health: {
    service: string;
    status: string;
    detail: string | null;
    bot_username: string | null;
    mini_app_url: string | null;
    last_ok_at: string | null;
    last_error: string | null;
    updated_at: string;
  }[];
  accounts: {
    id: string;
    user_id: string;
    telegram_user_id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    status: string;
    linked_at: string;
    last_seen_at: string;
    profile?: { email: string | null; full_name: string | null } | null;
  }[];
  queue: {
    id: string;
    user_id: string;
    event: string;
    title: string;
    status: string;
    attempts: number;
    next_retry_at: string;
    last_error: string | null;
    created_at: string;
  }[];
  audit: {
    id: string;
    user_id: string | null;
    telegram_user_id: number | null;
    action: string;
    reason: string | null;
    created_at: string;
  }[];
}

function AdminTelegramPage() {
  const loadOverview = useServerFn(fetchAdminTelegramOverview);
  const setStatus = useServerFn(setTelegramAccountStatus);
  const [overview, setOverview] = useState<TelegramOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setOverview((await loadOverview()) as TelegramOverview);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load Telegram status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function updateAccount(id: string, status: "active" | "disabled" | "unlinked") {
    if (status !== "active" && reason.trim().length < 3) {
      toast.error("Enter an admin reason first");
      return;
    }
    setBusyId(id);
    try {
      await setStatus({ data: { telegramAccountId: id, status, reason: reason || undefined } });
      toast.success("Telegram account updated");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update Telegram account");
    } finally {
      setBusyId(null);
    }
  }

  const health = overview?.health[0];
  const pending = overview?.queue.filter((item) => item.status === "pending").length ?? 0;
  const failed = overview?.queue.filter((item) => item.status === "failed").length ?? 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Telegram"
        description="Bot health, Mini App linking, and notification delivery operations."
      />

      {loading ? (
        <div className="panel grid min-h-48 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Metric
              label="Bot status"
              value={health ? <StatusBadge status={health.status} /> : "Not started"}
            />
            <Metric label="Mini App URL" value={health?.mini_app_url ?? "Not configured"} />
            <Metric label="Linked users" value={overview?.accounts.length ?? 0} />
            <Metric label="Queue health" value={`${pending} pending / ${failed} failed`} />
          </div>

          <div className="panel overflow-x-auto">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <Bot className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Linked users</h2>
              <Input
                className="ml-auto max-w-sm"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason for disable/unlink actions"
              />
            </div>
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Platform user</th>
                  <th className="px-4 py-2 text-left font-medium">Telegram</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Linked</th>
                  <th className="px-4 py-2 text-left font-medium">Last seen</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {overview?.accounts.length ? (
                  overview.accounts.map((account) => (
                    <tr key={account.id}>
                      <td className="px-4 py-2">
                        <p>
                          {account.profile?.full_name ?? account.profile?.email ?? account.user_id}
                        </p>
                        <p className="mono text-xs text-muted-foreground">{account.user_id}</p>
                      </td>
                      <td className="px-4 py-2">
                        <p>@{account.username ?? "unknown"}</p>
                        <p className="mono text-xs text-muted-foreground">
                          {account.telegram_user_id}
                        </p>
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={account.status} />
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(account.linked_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(account.last_seen_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId === account.id}
                            onClick={() => void updateAccount(account.id, "disabled")}
                          >
                            <ShieldOff className="mr-2 h-4 w-4" />
                            Disable
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busyId === account.id}
                            onClick={() => void updateAccount(account.id, "unlinked")}
                          >
                            <Unlink className="mr-2 h-4 w-4" />
                            Unlink
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No linked Telegram users.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <LogPanel
              title="Notification queue"
              rows={(overview?.queue ?? []).map((item) => ({
                id: item.id,
                main: item.title,
                meta: `${item.event} • ${item.status} • attempts ${item.attempts}`,
                detail: item.last_error ?? new Date(item.created_at).toLocaleString(),
              }))}
            />
            <LogPanel
              title="Link audit"
              rows={(overview?.audit ?? []).map((item) => ({
                id: item.id,
                main: item.action,
                meta: item.telegram_user_id ? String(item.telegram_user_id) : "system",
                detail: item.reason ?? new Date(item.created_at).toLocaleString(),
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-2 break-words text-sm font-medium">{value}</div>
    </div>
  );
}

function LogPanel({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; main: string; meta: string; detail: string }[];
}) {
  return (
    <section className="panel overflow-hidden">
      <h2 className="border-b px-4 py-3 text-sm font-semibold">{title}</h2>
      <div className="divide-y">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.id} className="px-4 py-3">
              <p className="text-sm font-medium">{row.main}</p>
              <p className="text-xs text-muted-foreground">{row.meta}</p>
              <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>
            </div>
          ))
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">No records.</p>
        )}
      </div>
    </section>
  );
}
