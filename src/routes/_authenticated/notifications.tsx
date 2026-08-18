import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications - TRONDESK" }] }),
  component: NotificationsPage,
});

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  severity: string;
  read_at: string | null;
  created_at: string;
}

function NotificationsPage() {
  const [rows, setRows] = useState<NotificationRow[]>([]);

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, severity, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setRows((data ?? []) as NotificationRow[]);
  }

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`notifications-page-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  async function markAllRead() {
    const unread = rows.filter((row) => !row.read_at).map((row) => row.id);
    if (unread.length === 0) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unread);
    await load();
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Notifications"
        description="Account, order, deposit and operations messages."
        actions={
          <Button variant="secondary" onClick={() => void markAllRead()}>
            <CheckCheck className="mr-1.5 h-4 w-4" />
            Mark all read
          </Button>
        }
      />

      <div className="panel divide-y overflow-hidden">
        {rows.length === 0 ? (
          <div className="grid place-items-center gap-3 px-5 py-16 text-center text-sm text-muted-foreground">
            <Bell className="h-8 w-8" />
            No notifications yet.
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex gap-3 px-5 py-4">
              <span
                className={
                  row.read_at
                    ? "mt-1 h-2 w-2 rounded-full bg-muted"
                    : "mt-1 h-2 w-2 rounded-full bg-primary"
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
                {row.body ? <p className="mt-1 text-sm text-muted-foreground">{row.body}</p> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
