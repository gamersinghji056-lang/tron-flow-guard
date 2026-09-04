import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  CreditCard,
  KeyRound,
  Link2,
  Lock,
  Settings,
  ShieldCheck,
  UserRound,
  Wallet2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { createP2pAvatarUpload, getP2pAvatarViewUrl, registerP2pAvatar } from "@/lib/p2p.functions";
import { updateUsername } from "@/lib/user-product.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";
import { V17Avatar } from "@/components/v17-avatar";

const PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

function profileUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  if (
    lower.includes("invalid_type") ||
    lower.includes("too_big") ||
    lower.includes("zod") ||
    lower.includes('"path"')
  ) {
    return "Could not upload profile photo";
  }
  return message || "Could not upload profile photo";
}

export const Route = createFileRoute("/_authenticated/profile-security")({
  head: () => ({ meta: [{ title: "Profile - WTRON" }] }),
  component: ProfileSecurityPage,
});

function ProfileSecurityPage() {
  const { user, profile, isAdmin } = useAuth();
  const saveUsername = useServerFn(updateUsername);
  const createAvatarUpload = useServerFn(createP2pAvatarUpload);
  const registerAvatar = useServerFn(registerP2pAvatar);
  const getAvatarUrl = useServerFn(getP2pAvatarViewUrl);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!profile?.avatar_path) return;
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

  async function submitUsername(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await saveUsername({ data: { username } });
      toast.success(`Username set to ${result.username}`);
      setUsername("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update username");
    }
  }

  async function uploadPhoto(file: File) {
    setAvatarUploading(true);
    try {
      if (!PROFILE_PHOTO_TYPES.has(file.type)) {
        throw new Error("Upload a JPEG, PNG, WebP or GIF image.");
      }
      if (file.size <= 0) throw new Error("Choose a valid image file.");
      if (file.size > PROFILE_PHOTO_MAX_BYTES) {
        throw new Error("Profile photo must be 2 MB or smaller.");
      }
      const upload = await createAvatarUpload({
        data: {
          fileName: file.name || "profile.jpg",
          contentType: file.type as never,
          sizeBytes: file.size,
        },
      });
      const { error } = await supabase.storage
        .from("user-avatars")
        .uploadToSignedUrl(upload.path, upload.token, file);
      if (error) throw error;
      await registerAvatar({
        data: {
          fileName: file.name || "profile.jpg",
          contentType: file.type as never,
          sizeBytes: file.size,
          storagePath: upload.path,
        },
      });
      const view = await getAvatarUrl({ data: { avatarPath: upload.path } });
      setAvatarUrl(view.url);
      toast.success("Profile photo updated");
    } catch (error) {
      toast.error(profileUploadError(error));
    } finally {
      setAvatarUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Profile"
        description="Account identity, security, wallets, payment methods and referral settings."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <Header icon={UserRound} title="Account" />
          <div className="mt-4 flex items-center gap-3">
            <V17Avatar
              src={avatarUrl}
              initials={profile?.full_name || user?.email || "WT"}
              size="lg"
              editable={!isAdmin}
              uploading={avatarUploading}
              onEdit={() => document.getElementById("profile-photo-input")?.click()}
            />
            <input
              id="profile-photo-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void uploadPhoto(file);
              }}
            />
            <div>
              <p className="text-sm font-semibold">{profile?.full_name || "WTRON account"}</p>
              <p className="text-xs text-muted-foreground">
                Profile photo is stored in the existing user avatar bucket.
              </p>
            </div>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Name" value={profile?.full_name || "Not set"} />
            <Row label="Email" value={user?.email ?? "-"} />
            <Row label="Role" value={isAdmin ? "ADMIN" : "USER"} />
            <Row label="Telegram" value="Linked where enabled" />
            <Row label="User ID" value={user?.id ?? "-"} mono />
          </dl>
          <form className="mt-5 flex gap-2" onSubmit={submitUsername}>
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Set unique username"
            />
            <Button disabled={!username.trim()}>Save</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Username is for display and referrals only. It is not a login credential.
          </p>
        </section>

        <section className="panel p-5">
          <Header icon={ShieldCheck} title="Security" />
          <div className="mt-4 grid gap-2">
            <Action to="/profile-security" icon={Lock} label="Change Password" disabled />
            <Action to="/wallet" icon={KeyRound} label="Transaction Password" />
            <Action to="/profile-security" icon={ShieldCheck} label="Active Sessions" disabled />
            <Action to="/profile-security" icon={Link2} label="Telegram Link Status" disabled />
          </div>
        </section>

        <section className="panel p-5">
          <Header icon={Wallet2} title="Wallets" />
          <div className="mt-4 grid gap-2">
            <Action to="/wallet" icon={Wallet2} label="Manage Wallets" />
            <Action to="/wallet" icon={KeyRound} label="Backup Wallet" />
            <Action to="/wallet" icon={Link2} label="Import Wallet" />
          </div>
        </section>

        <section className="panel p-5">
          <Header icon={CreditCard} title="Payments" />
          <div className="mt-4 grid gap-2">
            <Action to="/bank-accounts" icon={CreditCard} label="UPI and Bank Accounts" />
          </div>
        </section>

        <section className="panel p-5">
          <Header icon={Link2} title="Referral" />
          <div className="mt-4 grid gap-2">
            <Action to="/referral" icon={Link2} label="Refer & Earn" />
          </div>
        </section>

        <section className="panel p-5">
          <Header icon={Settings} title="Settings" />
          <div className="mt-4 grid gap-2">
            <Action to="/notifications" icon={Bell} label="Notifications" />
            <Action to="/profile-security" icon={Lock} label="Privacy" disabled />
            <Action to="/profile-security" icon={Settings} label="Theme" disabled />
          </div>
        </section>
      </div>
    </div>
  );
}

function Header({ icon: Icon, title }: { icon: typeof UserRound; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-md bg-secondary">
        <Icon className="h-5 w-5 text-primary" />
      </span>
      <h2 className="font-semibold">{title}</h2>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "mono text-right text-xs" : "text-right"}>{value}</dd>
    </div>
  );
}

function Action({
  to,
  icon: Icon,
  label,
  disabled,
}: {
  to: string;
  icon: typeof UserRound;
  label: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <button className="flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm text-muted-foreground opacity-70">
        <Icon className="h-4 w-4" />
        {label}
      </button>
    );
  }
  return (
    <Button asChild variant="secondary" className="justify-start">
      <Link to={to}>
        <Icon className="mr-2 h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}
