import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Bell,
  BookOpenText,
  CreditCard,
  FileText,
  Gift,
  HelpCircle,
  History,
  KeyRound,
  Languages,
  LogOut,
  MessageCircle,
  Moon,
  Shield,
  UserRound,
  Wallet2,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getP2pAvatarViewUrl } from "@/lib/p2p.functions";
import { V17Avatar } from "@/components/v17-avatar";

export const Route = createFileRoute("/_authenticated/more")({
  head: () => ({ meta: [{ title: "More - WTRON" }] }),
  component: MorePage,
});

const groups = [
  {
    title: "Account",
    items: [
      {
        to: "/profile-security",
        label: "Profile",
        body: "Identity, profile photo and Telegram",
        icon: UserRound,
      },
      {
        to: "/notifications",
        label: "Notifications",
        body: "Wallet, order and system alerts",
        icon: Bell,
      },
      {
        to: "/profile-security",
        label: "Security",
        body: "Transaction password and wallet protection",
        icon: Shield,
      },
    ],
  },
  {
    title: "Payments & Orders",
    items: [
      {
        to: "/bank-accounts",
        label: "Bank & UPI",
        body: "Saved personal payout methods",
        icon: CreditCard,
      },
      { to: "/orders", label: "Orders", body: "P2P and WTRON orders", icon: FileText },
      { to: "/history", label: "History", body: "Wallet and trade activity", icon: History },
    ],
  },
  {
    title: "Wallet",
    items: [
      {
        to: "/wallet",
        label: "Manage Wallets",
        body: "Create, import, switch and default",
        icon: Wallet2,
      },
      { to: "/wallet", label: "Backup", body: "Recovery phrase and backup status", icon: KeyRound },
      { to: "/wallet", label: "GasFree", body: "GasFree capability and transfers", icon: Zap },
    ],
  },
  {
    title: "Insights & Growth",
    items: [
      {
        to: "/analytics",
        label: "Analytics",
        body: "Volume and performance insights",
        icon: BarChart3,
      },
      { to: "/referral", label: "Referral", body: "Invite users and track rewards", icon: Gift },
    ],
  },
  {
    title: "Preferences",
    items: [
      {
        to: "/profile-security",
        label: "Appearance",
        body: "System, Light or Dark where available",
        icon: Moon,
      },
      {
        to: "/profile-security",
        label: "Language",
        body: "Mini App language and locale",
        icon: Languages,
      },
    ],
  },
  {
    title: "Legal & Help",
    items: [
      { to: "/privacy", label: "Privacy Policy", body: "How WTRON handles data", icon: FileText },
      { to: "/terms", label: "Terms of Service", body: "Product terms", icon: BookOpenText },
      {
        to: "/risk-disclosure",
        label: "Risk Disclosure",
        body: "Crypto and trading risks",
        icon: Shield,
      },
      {
        href: "https://t.me/laura_luxee",
        label: "Support",
        body: "Order, account and wallet help",
        icon: HelpCircle,
      },
    ],
  },
] as const;

function MorePage() {
  const { profile } = useAuth();
  const getAvatarUrl = useServerFn(getP2pAvatarViewUrl);
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    let active = true;
    if (!profile?.avatar_path) {
      setAvatarUrl("");
      return;
    }
    void getAvatarUrl({ data: { avatarPath: profile.avatar_path } })
      .then((result) => {
        if (active) setAvatarUrl(result.url);
      })
      .catch(() => {
        if (active) setAvatarUrl("");
      });
    return () => {
      active = false;
    };
  }, [getAvatarUrl, profile?.avatar_path, profile?.avatar_updated_at]);

  return (
    <div className="mx-auto max-w-[430px] space-y-[19px] md:max-w-5xl">
      <section>
        <p className="kicker-v17">TRADER ACCOUNT</p>
        <h1 className="title-v17">More</h1>
        <p className="body-v17">Trader account, payment, wallet and application controls.</p>
      </section>

      <section className="flex items-center gap-3">
        <V17Avatar
          src={avatarUrl}
          initials={profile?.full_name || profile?.email || "WT"}
          size="lg"
        />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold">
            {profile?.full_name || "WTRON Trader"}
          </p>
          <p className="mt-1 text-[9.5px] text-muted-foreground">
            {profile?.email || "Trader account"}
          </p>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded-full border border-primary/20 bg-primary/10 px-[7px] py-[5px] text-[8.5px] font-semibold text-[#7ba0ff]">
              TRADER
            </span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-[7px] py-[5px] text-[8.5px] font-semibold text-emerald-300">
              VERIFIED
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-[9px]">
        <Stat label="Security" value="Protected" />
        <Stat label="Wallets" value="Mainnet" />
      </div>

      {groups.map((group) => (
        <section key={group.title}>
          <p className="mb-[7px] ml-1 text-[9px] font-extrabold tracking-[0.12em] text-muted-foreground uppercase">
            {group.title}
          </p>
          <div className="rounded-[15px] border border-[#222837] bg-[#10131a] px-3">
            {group.items.map((item) => (
              <MoreItem key={item.label} item={item} />
            ))}
          </div>
        </section>
      ))}

      <section>
        <p className="mb-[7px] ml-1 text-[9px] font-extrabold tracking-[0.12em] text-muted-foreground uppercase">
          Session
        </p>
        <div className="rounded-[15px] border border-[#222837] bg-[#10131a] px-3">
          <Link to="/trader/login" className="v17-listrow text-[#ff7e88]">
            <span className="flex items-center gap-[11px]">
              <span className="grid h-[33px] w-[33px] place-items-center rounded-[10px] bg-[#151925]">
                <LogOut className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[12.5px] font-semibold">Logout</span>
                <span className="block text-[9.5px] text-muted-foreground">
                  Return to Trader login
                </span>
              </span>
            </span>
            <span>›</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[#222837] bg-[#10131a] p-3">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[17px] font-semibold tracking-[-0.03em]">{value}</p>
    </div>
  );
}

function MoreItem({
  item,
}: {
  item: {
    readonly to?: string;
    readonly href?: string;
    readonly label: string;
    readonly body: string;
    readonly icon: typeof UserRound;
  };
}) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-[11px]">
        <span className="grid h-[33px] w-[33px] shrink-0 place-items-center rounded-[10px] bg-[#151925] text-[#7ba0ff]">
          <item.icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-semibold">{item.label}</span>
          <span className="block truncate text-[9.5px] text-muted-foreground">{item.body}</span>
        </span>
      </span>
      <span className="text-muted-foreground">›</span>
    </>
  );

  if (item.href) {
    return (
      <a href={item.href} className="v17-listrow">
        {content}
      </a>
    );
  }
  return (
    <Link to={item.to ?? "/more"} className="v17-listrow">
      {content}
    </Link>
  );
}
