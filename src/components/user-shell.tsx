import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BadgeIndianRupee,
  Bell,
  BarChart3,
  CircleDollarSign,
  CircleEllipsis,
  CreditCard,
  HandCoins,
  HelpCircle,
  History,
  Home,
  LogOut,
  ReceiptText,
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
import { WtronLogo } from "@/components/mini-app/crypto-icons";

const userLinks = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/p2p", label: "P2P", icon: BadgeIndianRupee },
  { to: "/trade", label: "Trade", icon: HandCoins },
  { to: "/wallet", label: "Wallet", icon: Wallet2 },
  { to: "/orders", label: "Orders", icon: History },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/bank-accounts", label: "Bank Accounts", icon: CreditCard },
  { to: "/history", label: "History", icon: History },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/referral", label: "Referral", icon: Radio },
  { to: "/profile-security", label: "Profile / Security", icon: Shield },
  { to: "/more", label: "Help / More", icon: HelpCircle },
];

const traderBottomLinks = [
  { to: "/dashboard", label: "Home", icon: CircleDollarSign },
  { to: "/p2p", label: "P2P", icon: BadgeIndianRupee },
  { to: "/trade", label: "Trade", icon: HandCoins },
  { to: "/wallet", label: "Wallet", icon: Wallet2 },
  { to: "/more", label: "More", icon: CircleEllipsis },
];

const vendorBottomLinks = [
  { to: "/vendor", label: "Home", icon: CircleDollarSign },
  { to: "/vendor?tab=trade", label: "Trade", icon: HandCoins },
  { to: "/vendor?tab=wallet", label: "Wallet", icon: Wallet2 },
  { to: "/vendor?tab=orders", label: "Orders", icon: ReceiptText },
  { to: "/vendor?tab=more", label: "More", icon: CircleEllipsis },
];

function isActivePath(pathname: string, target: string) {
  const path = target.split("?")[0];
  if (path === "/dashboard" || path === "/vendor") return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isTraderBottomActive(pathname: string, target: string) {
  if (target === "/more") {
    return [
      "/more",
      "/orders",
      "/analytics",
      "/bank-accounts",
      "/payment-methods",
      "/history",
      "/notifications",
      "/referral",
      "/profile-security",
      "/deposits",
    ].some((path) => pathname === path || pathname.startsWith(`${path}/`));
  }
  return isActivePath(pathname, target);
}

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
    <div className="wtron-product-shell min-h-screen bg-[#050505] pb-24 text-white md:pb-0">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/94 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <WtronLogo markClassName="h-8 w-8" textClassName="text-sm font-semibold" />
          </Link>

          <nav className="ml-2 hidden items-center gap-1 lg:flex">
            {userLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-white/8 hover:text-white",
                  isActivePath(pathname, link.to) &&
                    "bg-white/8 text-white shadow-[inset_0_-1px_0_rgba(240,68,68,0.45)]",
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden rounded-xl border border-white/10 bg-white/6 px-3 py-1.5 sm:block">
              <p className="text-[10px] tracking-wide text-slate-500 uppercase">Available</p>
              <p className="mono text-sm font-semibold text-primary">
                {formatUsdt(profile?.balance)} USDT
              </p>
            </div>
            <NotificationBell />
            <Button variant="ghost" size="icon" aria-label="Profile" asChild>
              <Link to="/profile-security">
                <UserRound className="h-5 w-5" />
              </Link>
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

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-50 bg-[#050505]/94 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 rounded-2xl border border-white/10 bg-[#111111]/95 p-1 shadow-[0_-20px_60px_-40px_rgba(0,0,0,0.95)]">
          {traderBottomLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                "relative flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium text-slate-500 transition",
                isTraderBottomActive(pathname, link.to) && "text-primary",
              )}
            >
              {isTraderBottomActive(pathname, link.to) ? (
                <span className="absolute top-1 h-0.5 w-7 rounded-full bg-primary" />
              ) : null}
              <link.icon className="h-5 w-5" />
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function VendorShell({ children }: { children: React.ReactNode }) {
  const location = useRouterState({ select: (state) => state.location });
  const activeTab = typeof location.search["tab"] === "string" ? location.search["tab"] : "home";

  return (
    <div className="wtron-product-shell min-h-screen bg-[#050505] pb-24 text-white md:pb-0">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/94 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:px-4">
          <Link to="/vendor" className="flex items-center gap-2">
            <WtronLogo markClassName="h-8 w-8" textClassName="text-sm font-semibold" />
            <span className="hidden rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary sm:inline-flex">
              Vendor
            </span>
          </Link>
        </div>
      </header>

      <main>{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-50 bg-[#050505]/94 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 rounded-2xl border border-white/10 bg-[#111111]/95 p-1 shadow-[0_-20px_60px_-40px_rgba(0,0,0,0.95)]">
          {vendorBottomLinks.map((link) => {
            const tab = link.label.toLowerCase();
            const active = tab === "home" ? activeTab === "home" : activeTab === tab;
            return (
              <Link
                key={link.label}
                to={link.to}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium text-slate-500 transition",
                  active && "text-primary",
                )}
              >
                {active ? (
                  <span className="absolute top-1 h-0.5 w-7 rounded-full bg-primary" />
                ) : null}
                <link.icon className="h-5 w-5" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
