import type { ChangeEvent } from "react";
import { FileText, LogOut, ShieldCheck, Zap } from "lucide-react";
import { MiniIcons, type MiniIcon } from "@/components/mini-app/crypto-icons";
import {
  V17Button,
  V17ListRow,
  V17Metric,
  V17Screen,
  V17Section,
  V17SegmentedControl,
  V17StatusPill,
  V17Surface,
} from "@/components/mini-app/shared/v17-primitives";
import { V17Avatar } from "@/components/v17-avatar";
import { MINI_LOCALE_LABELS, type MiniLocale, type MiniT } from "@/lib/mini-i18n";
import type { MiniThemePreference } from "@/lib/mini-wallet-ui";

export interface MiniMoreProfile {
  email?: string | null;
  full_name?: string | null;
}

type MoreTargetScreen =
  | "profile"
  | "notifications"
  | "security"
  | "bank-accounts"
  | "orders"
  | "history"
  | "trade"
  | "wallet"
  | "wallet-backup"
  | "wallet-gasfree"
  | "analytics"
  | "referral";

export default function MoreScreen({
  profile,
  avatarUrl,
  avatarUploading,
  onUploadPhoto,
  vendorMode,
  onNavigate,
  locale,
  setLocale,
  theme,
  setTheme,
  t,
  onLogout,
}: {
  profile: MiniMoreProfile | null;
  avatarUrl: string;
  avatarUploading: boolean;
  onUploadPhoto: (file: File) => void;
  vendorMode: boolean;
  onNavigate: (screen: MoreTargetScreen) => Promise<void>;
  locale: MiniLocale;
  setLocale: (locale: MiniLocale) => void;
  theme: MiniThemePreference;
  setTheme: (theme: MiniThemePreference) => void;
  t: MiniT;
  onLogout: () => void | Promise<void>;
}) {
  const fileInputId = vendorMode ? "vendor-mini-profile-photo" : "trader-mini-profile-photo";
  const sections: Array<[string, Array<[MoreTargetScreen, string, string, MiniIcon]>]> = [
    [
      "Account",
      [
        ["profile", t("profile"), "Name, Telegram and account ID", MiniIcons.profile],
        ["notifications", t("notifications"), "Wallet and order alerts", MiniIcons.notifications],
        ["security", t("security"), "Transaction password and backup", MiniIcons.security],
      ],
    ],
    [
      vendorMode ? "Business & Orders" : "Payments & Orders",
      [
        [
          "bank-accounts",
          vendorMode ? "Vendor Payout Accounts" : "Bank & UPI",
          vendorMode
            ? "Limits, capacity, default and freeze state"
            : "Saved personal payout methods",
          MiniIcons.bank,
        ],
        ["orders", t("orders"), "P2P and WTRON order status", MiniIcons.orders],
        ["history", t("history"), "Company and vendor trade history", MiniIcons.history],
        ...(vendorMode
          ? ([
              ["trade", "Vendor Listings", "Liquidity, rates, limits and rails", MiniIcons.trade],
            ] as Array<[MoreTargetScreen, string, string, MiniIcon]>)
          : []),
      ],
    ],
    [
      "Wallet",
      [
        ["wallet", "Manage Wallets", "Create, import and switch wallets", MiniIcons.wallet],
        ["wallet-backup", "Backup", "Recovery phrase tools", MiniIcons.backup],
        ["wallet-gasfree", "GasFree", "Capability and sponsorship status", Zap],
      ],
    ],
    [
      "Insights & Growth",
      [
        ["analytics", "Analytics", "Real trading metrics", MiniIcons.analytics],
        ["referral", "Referral", "Invite and rewards", MiniIcons.referral],
      ],
    ],
  ];

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) onUploadPhoto(file);
  };

  return (
    <V17Screen title="More" subtitle="Account, trading and security tools" compact>
      <div className="flex items-center gap-3 pt-1">
        <V17Avatar
          src={avatarUrl}
          initials={profile?.full_name || profile?.email || (vendorMode ? "WV" : "WT")}
          size="lg"
          editable
          uploading={avatarUploading}
          onEdit={() => document.getElementById(fileInputId)?.click()}
        />
        <input
          id={fileInputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={onFile}
        />
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-semibold leading-tight">
            {profile?.full_name || profile?.email || (vendorMode ? "WTRON Vendor" : "WTRON Trader")}
          </h1>
          <p className="mt-1 text-[9.5px] text-slate-500">
            {vendorMode ? "Approved Vendor" : "Trader account"}
          </p>
          <div className="mt-2 flex gap-1.5">
            <V17StatusPill label={vendorMode ? "VENDOR" : "TRADER"} tone="info" />
            <V17StatusPill label="VERIFIED" tone="success" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-[9px]">
        <V17Metric label="Security" value="Protected" />
        <V17Metric label="Wallets" value="Mainnet" />
      </div>
      {sections.map(([title, items]) => (
        <V17Section key={title} title={title}>
          {items.map(([screen, label, body, Icon]) => (
            <V17ListRow
              key={screen}
              icon={Icon}
              title={label}
              body={body}
              onClick={() => onNavigate(screen)}
            />
          ))}
        </V17Section>
      ))}
      <V17Section title="Preferences">
        <V17Surface className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold">{t("appearance")}</p>
            <V17SegmentedControl
              value={theme}
              setValue={(value) => setTheme(value as MiniThemePreference)}
              items={[
                ["system", t("system")],
                ["light", t("light")],
                ["dark", t("dark")],
              ]}
            />
          </div>
          <div>
            <p className="text-sm font-semibold">Language</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {Object.entries(MINI_LOCALE_LABELS).map(([key, label]) => (
                <V17Button
                  key={key}
                  type="button"
                  variant={locale === key ? "default" : "secondary"}
                  onClick={() => setLocale(key as MiniLocale)}
                >
                  {label}
                </V17Button>
              ))}
            </div>
          </div>
        </V17Surface>
      </V17Section>
      <V17Section title="Legal & Help">
        <V17ListRow
          icon={FileText}
          title="Privacy Policy"
          body="Public legal page"
          onClick={() => {
            window.open("/privacy", "_blank", "noopener,noreferrer");
          }}
        />
        <V17ListRow
          icon={FileText}
          title="Terms"
          body="Public legal page"
          onClick={() => {
            window.open("/terms", "_blank", "noopener,noreferrer");
          }}
        />
        <V17ListRow
          icon={ShieldCheck}
          title="Risk Disclosure"
          body="Public legal page"
          onClick={() => {
            window.open("/risk-disclosure", "_blank", "noopener,noreferrer");
          }}
        />
        <V17ListRow
          icon={MiniIcons.notifications}
          title="Support"
          body="Order, account and wallet help"
          onClick={() => {
            window.open("https://t.me/laura_luxee", "_blank", "noopener,noreferrer");
          }}
        />
      </V17Section>
      <V17Section title="Session">
        <V17ListRow
          icon={LogOut}
          title="Logout"
          body="Close your Mini App session"
          onClick={() => void onLogout()}
        />
      </V17Section>
    </V17Screen>
  );
}
