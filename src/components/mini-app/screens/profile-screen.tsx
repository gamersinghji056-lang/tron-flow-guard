import type { ChangeEvent } from "react";
import { MiniIcons } from "@/components/mini-app/crypto-icons";
import {
  V17ListRow,
  V17Screen,
  V17Section,
  V17StatusPill,
  V17Surface,
} from "@/components/mini-app/shared/v17-primitives";
import { V17Avatar } from "@/components/v17-avatar";
import { shortenHash } from "@/lib/chain";
import { technicalTextDirection } from "@/lib/mini-i18n";

export interface MiniProfileSummary {
  id?: string | null;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  avatar_path?: string | null;
  avatar_updated_at?: string | null;
}

type ProfileTargetScreen = "wallet" | "bank-accounts" | "security" | "referral";

export default function ProfileScreen({
  profile,
  avatarUrl,
  avatarUploading,
  hasSession,
  onNavigate,
  onUploadPhoto,
}: {
  profile: MiniProfileSummary | null;
  avatarUrl: string;
  avatarUploading: boolean;
  hasSession: boolean;
  onNavigate: (screen: ProfileTargetScreen) => Promise<void>;
  onUploadPhoto: (file: File) => void;
}) {
  const fileInputId = "mini-profile-photo";
  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) onUploadPhoto(file);
  };

  return (
    <V17Screen title="Profile" subtitle="WTRON trader profile">
      <V17Surface className="p-4">
        <div className="flex items-center gap-3">
          <V17Avatar
            src={avatarUrl}
            initials={profile?.full_name || profile?.email || "WT"}
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
            <h2 className="truncate text-xl font-semibold tracking-normal">
              {profile?.full_name || "WTRON Trader"}
            </h2>
            <p className="truncate text-sm text-slate-400">
              {profile?.email || "Telegram linked account"}
            </p>
            <div className="mt-2 flex gap-1.5">
              <V17StatusPill label="TRADER" tone="info" />
              <V17StatusPill label={hasSession ? "LINKED" : "TELEGRAM"} tone="success" />
            </div>
          </div>
        </div>
        <p className="mono mt-2 text-[11px] text-slate-500" dir={technicalTextDirection()}>
          {profile?.id ? shortenHash(profile.id, 8) : "Account pending"}
        </p>
      </V17Surface>
      <V17Section title="Sections">
        <V17ListRow
          icon={MiniIcons.wallet}
          title="Manage Wallets"
          body="Personal wallet management"
          onClick={() => onNavigate("wallet")}
        />
        <V17ListRow
          icon={MiniIcons.bank}
          title="Payments"
          body="Bank accounts and UPI"
          onClick={() => onNavigate("bank-accounts")}
        />
        <V17ListRow
          icon={MiniIcons.security}
          title="Security"
          body={hasSession ? "Authenticated session" : "Telegram verified"}
          onClick={() => onNavigate("security")}
        />
        <V17ListRow
          icon={MiniIcons.referral}
          title="Refer & Earn"
          body="Referral rewards"
          onClick={() => onNavigate("referral")}
        />
      </V17Section>
    </V17Screen>
  );
}
