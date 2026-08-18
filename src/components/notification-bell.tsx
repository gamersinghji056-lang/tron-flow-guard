import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  severity: string;
  created_at: string;
  read_at: string | null;
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationRow[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, severity, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(25);
      if (active) setItems(data ?? []);
    }
    void load();

    const channel = supabase
      .channel(`notifications-feed-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => void load(),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const unread = items.filter((item) => !item.read_at).length;

  async function markAllRead() {
    const ids = items.filter((item) => !item.read_at).map((item) => item.id);
    if (!ids.length) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    setItems((prev) =>
      prev.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })),
    );
  }

  const severityColor: Record<string, string> = {
    info: "text-info",
    success: "text-success",
    warning: "text-warning",
    error: "text-destructive",
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          <Button variant="ghost" size="sm" onClick={() => void markAllRead()}>
            Mark read
          </Button>
        </div>
        <ScrollArea className="max-h-80">
          {items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id} className={cn("px-3 py-2.5", !item.read_at && "bg-secondary/40")}>
                  <p className={cn("text-sm font-medium", severityColor[item.severity])}>
                    {item.title}
                  </p>
                  {item.body ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
                  ) : null}
                  <p className="mono mt-1 text-[10px] text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
