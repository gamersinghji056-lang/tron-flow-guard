import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  LayoutDashboard,
  LogOut,
  Radio,
  Receipt,
  ShieldCheck,
  Wallet2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatUsdt } from "@/lib/chain";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient } from "@tanstack/react-query";

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  severity: string;
  created_at: string;
  read_at: string | null;
}

function NotificationBell() {
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
      .channel("notifications-feed")
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
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    setItems((prev) => prev.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const links = [
    { to: "/dashboard", label: "Deposit", icon: LayoutDashboard },
    { to: "/wallet", label: "Wallets", icon: Wallet2 },
    { to: "/deposits", label: "History", icon: Receipt },
    ...(isAdmin
      ? [
          { to: "/admin", label: "Admin", icon: ShieldCheck },
          { to: "/admin/wallets", label: "Company wallets", icon: Wallet2 },
          { to: "/admin/transactions", label: "Transactions", icon: Radio },
        ]
      : []),
  ];

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Radio className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">TRONDESK</span>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  pathname === link.to && "bg-secondary text-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="panel hidden px-3 py-1.5 sm:block">
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Balance</p>
              <p className="mono text-sm font-semibold text-primary">
                {formatUsdt(profile?.balance)} USDT
              </p>
            </div>
            <NotificationBell />
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void signOut()}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto border-t px-3 py-2 md:hidden">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap text-muted-foreground",
                pathname === link.to && "bg-secondary text-foreground",
              )}
            >
              <link.icon className="h-3.5 w-3.5" />
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
