import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  Blocks,
  Bot,
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  FileKey2,
  Gavel,
  LayoutDashboard,
  LogOut,
  Radio,
  Receipt,
  ShieldAlert,
  SlidersHorizontal,
  UserRoundCog,
  Users,
  Wallet2,
  Webhook,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";

const adminLinks = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/p2p-orders", label: "P2P Orders", icon: BriefcaseBusiness },
  { to: "/admin/ads", label: "Ads", icon: BadgeDollarSign },
  { to: "/admin/direct-sell", label: "Direct Sell", icon: Building2 },
  { to: "/admin/trading-vendors", label: "Trading Vendors", icon: Building2 },
  { to: "/admin/disputes", label: "Disputes", icon: Gavel },
  { to: "/admin/deposits", label: "Deposits", icon: Receipt },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: Wallet2 },
  { to: "/admin/ledger", label: "Ledger", icon: BookOpenText },
  { to: "/admin/payment-operations", label: "Payment Operations", icon: BadgeDollarSign },
  { to: "/admin/wallets", label: "Company Wallets", icon: Wallet2 },
  { to: "/admin/user-wallets", label: "User Wallets", icon: Wallet2 },
  { to: "/admin/payment-methods", label: "Bank/UPI Management", icon: BadgeDollarSign },
  { to: "/admin/analytics", label: "Analytics", icon: Activity },
  { to: "/admin/blockchain-monitor", label: "Blockchain Monitor", icon: Blocks },
  { to: "/admin/api-management", label: "API Management", icon: FileKey2 },
  { to: "/admin/webhooks", label: "Webhooks", icon: Webhook },
  { to: "/admin/telegram", label: "Telegram", icon: Bot },
  { to: "/admin/risk-security", label: "Risk & Security", icon: ShieldAlert },
  { to: "/admin/fees", label: "Fees", icon: SlidersHorizontal },
  { to: "/admin/referrals", label: "Referral Program", icon: Radio },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: Activity },
  { to: "/admin/system-settings", label: "System Settings", icon: UserRoundCog },
];

export function AdminOpsShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="hidden border-r border-border/80 bg-card/40 lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="flex h-14 items-center gap-2 border-b px-4">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Radio className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">TRONDESK</p>
              <p className="text-[10px] uppercase text-muted-foreground">Operations</p>
            </div>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-3">
            {adminLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  pathname === link.to && "bg-secondary text-foreground",
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="border-t p-3">
            <Button variant="ghost" className="w-full justify-start" onClick={() => void signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4">
            <AlertTriangle className="h-4 w-4 text-warning lg:hidden" />
            <span className="text-sm font-medium lg:hidden">Operations Console</span>
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={() => void signOut()}
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t px-3 py-2 lg:hidden">
            {adminLinks.slice(0, 8).map((link) => (
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
        <main className="px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
