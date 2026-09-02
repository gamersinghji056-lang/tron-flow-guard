import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BadgeIndianRupee,
  Bell,
  CircleEllipsis,
  HandCoins,
  History,
  Home,
  LogOut,
  ReceiptText,
  Radio,
  Shield,
  Store,
  UserRound,
  Wallet2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatUsdt } from "@/lib/chain";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";

const userLinks = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/p2p", label: "P2P", icon: BadgeIndianRupee },
  { to: "/trade", label: "Trade", icon: BadgeIndianRupee },
  { to: "/wallet", label: "Wallet", icon: Wallet2 },
  { to: "/orders", label: "Orders", icon: History },
  { to: "/analytics", label: "Analytics", icon: History },
  { to: "/bank-accounts", label: "Bank Accounts", icon: BadgeIndianRupee },
  { to: "/history", label: "History", icon: History },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/referral", label: "Referral", icon: Radio },
  { to: "/profile-security", label: "Profile / Security", icon: Shield },
];

const traderBottomLinks = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/p2p", label: "P2P", icon: BadgeIndianRupee },
  { to: "/trade", label: "Trade", icon: BadgeIndianRupee },
  { to: "/wallet", label: "Wallet", icon: Wallet2 },
  { to: "/more", label: "More", icon: CircleEllipsis },
];

const vendorBottomLinks = [
  { to: "/vendor", label: "Home", icon: Home },
  { to: "/vendor?tab=trade", label: "Trade", icon: HandCoins },
  { to: "/vendor?tab=wallet", label: "Wallet", icon: Wallet2 },
  { to: "/vendor?tab=orders", label: "Orders", icon: ReceiptText },
  { to: "/vendor?tab=more", label: "More", icon: CircleEllipsis },
];

export function UserShell({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/trader/login", replace: true });
  }

  return (
    <div className="min-h-screen pb-16 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-[#050505]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground shadow-[0_0_24px_-10px_rgba(240,68,68,0.8)]">
              <Radio className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">WTRON</span>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 lg:flex">
            {userLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  pathname === link.to &&
                    "bg-secondary text-foreground shadow-[inset_0_-1px_0_rgba(240,68,68,0.45)]",
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden rounded-md border border-border bg-secondary/50 px-3 py-1.5 sm:block">
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Available</p>
              <p className="mono text-sm font-semibold text-primary">
                {formatUsdt(profile?.balance)} USDT
              </p>
            </div>
            <NotificationBell />
            <Button variant="ghost" size="icon" aria-label="Profile">
              <UserRound className="h-5 w-5" />
            </Button>
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
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border/80 bg-[#050505]/95 px-1 pb-[max(env(safe-area-inset-bottom),0px)] backdrop-blur-xl md:hidden">
        {traderBottomLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={cn(
              "relative flex h-14 flex-col items-center justify-center gap-1 rounded-md text-[10px] text-muted-foreground",
              pathname === link.to && "text-primary",
            )}
          >
            {pathname === link.to ? (
              <span className="absolute top-1 h-0.5 w-7 rounded-full bg-primary" />
            ) : null}
            <link.icon className="h-4 w-4" />
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function VendorShell({ children }: { children: React.ReactNode }) {
  const location = useRouterState({ select: (state) => state.location });
  const activeTab = typeof location.search["tab"] === "string" ? location.search["tab"] : "home";

  return (
    <div className="min-h-screen pb-16 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-[#050505]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link to="/vendor" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground shadow-[0_0_24px_-10px_rgba(240,68,68,0.8)]">
              <Store className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">WTRON Vendor</span>
          </Link>
        </div>
      </header>

      <main>{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border/80 bg-[#050505]/95 px-1 pb-[max(env(safe-area-inset-bottom),0px)] backdrop-blur-xl md:hidden">
        {vendorBottomLinks.map((link) => (
          <Link
            key={link.label}
            to={link.to}
            className={cn(
              "relative flex h-14 flex-col items-center justify-center gap-1 rounded-md text-[10px] text-muted-foreground",
              activeTab === link.label.toLowerCase() && "text-primary",
            )}
          >
            {activeTab === link.label.toLowerCase() ? (
              <span className="absolute top-1 h-0.5 w-7 rounded-full bg-primary" />
            ) : null}
            <link.icon className="h-4 w-4" />
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
