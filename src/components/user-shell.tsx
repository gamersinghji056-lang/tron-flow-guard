import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BadgeIndianRupee,
  Bell,
  CircleEllipsis,
  History,
  Home,
  LogOut,
  Radio,
  Shield,
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

const bottomLinks = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/p2p", label: "P2P", icon: BadgeIndianRupee },
  { to: "/trade", label: "Trade", icon: BadgeIndianRupee },
  { to: "/wallet", label: "Wallet", icon: Wallet2 },
  { to: "/more", label: "More", icon: CircleEllipsis },
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
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
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

      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border/80 bg-background/95 backdrop-blur md:hidden">
        {bottomLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={cn(
              "flex h-14 flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground",
              pathname === link.to && "text-primary",
            )}
          >
            <link.icon className="h-4 w-4" />
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
