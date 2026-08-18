import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  CreditCard,
  History,
  KeyRound,
  ListOrdered,
  Shield,
  UserRound,
} from "lucide-react";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/more")({
  head: () => ({ meta: [{ title: "More - WTRON" }] }),
  component: MorePage,
});

const items = [
  { to: "/orders", label: "Orders", icon: ListOrdered },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/bank-accounts", label: "Bank Accounts", icon: CreditCard },
  { to: "/history", label: "History", icon: History },
  { to: "/profile-security", label: "Profile", icon: UserRound },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile-security", label: "Security", icon: Shield },
  { to: "/referral", label: "Referral", icon: KeyRound },
];

function MorePage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="More"
        description="Orders, analytics, payment methods and account tools."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="panel flex items-center gap-3 p-4 transition-colors hover:bg-secondary/50"
          >
            <span className="grid h-10 w-10 place-items-center rounded-md bg-secondary">
              <item.icon className="h-5 w-5 text-primary" />
            </span>
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
