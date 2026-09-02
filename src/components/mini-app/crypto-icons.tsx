import type { ComponentType, SVGProps } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  BarChart3,
  Bell,
  Clock3,
  Gift,
  History,
  KeyRound,
  Landmark,
  QrCode,
  ReceiptText,
  Repeat2,
  ShieldCheck,
  UsersRound,
  UserRound,
  WalletCards,
  Zap,
} from "lucide-react";
import { WTRON_OFFICIAL_MARK_PATH } from "@/lib/branding";

export type MiniIcon = ComponentType<SVGProps<SVGSVGElement>>;

export function WtronLogo({
  className,
  markClassName,
  textClassName,
  showText = true,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  showText?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <span
        className={`relative grid place-items-center overflow-hidden text-[#03130e] ${markClassName ?? "h-9 w-9"}`}
      >
        <img
          src={WTRON_OFFICIAL_MARK_PATH}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          onLoad={(event) => {
            event.currentTarget.nextElementSibling?.classList.add("hidden");
            event.currentTarget.nextElementSibling?.classList.remove("grid");
          }}
          onError={(event) => {
            event.currentTarget.classList.add("hidden");
            event.currentTarget.nextElementSibling?.classList.remove("hidden");
            event.currentTarget.nextElementSibling?.classList.add("grid");
          }}
        />
        <span className="hidden h-full w-full place-items-center rounded-xl bg-primary text-sm font-medium tracking-normal text-primary-foreground">
          WT
        </span>
      </span>
      {showText ? (
        <span className={textClassName ?? "font-medium tracking-tight"}>WTRON</span>
      ) : null}
    </div>
  );
}

export function WtronMark({ className }: { className?: string }) {
  return <WtronLogo showText={false} markClassName={className ?? "h-11 w-11"} />;
}

export function UsdtIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className ?? "h-8 w-8"} aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="#26A17B" />
      <path
        fill="#fff"
        d="M21.9 21.7v-.1c-.1 0-.9.1-1.9.1s-1.8 0-1.9-.1v.1c0 2.5.1 4.4.1 4.4h3.6s.1-1.9.1-4.4Z"
      />
      <path
        fill="#fff"
        d="M27.2 13.2H12.8v3.5h5.3v2.1c-4.3.2-7.5 1.1-7.5 2.2s3.2 2 7.5 2.2v-1.9c-2.5-.1-4.3-.5-4.3-.9s1.8-.8 4.3-.9v1.4c.6 0 1.2.1 1.9.1s1.3 0 1.9-.1v-1.4c2.5.1 4.3.5 4.3.9s-1.8.8-4.3.9v1.9c4.3-.2 7.5-1.1 7.5-2.2s-3.2-2-7.5-2.2v-2.1h5.3v-3.5Z"
      />
    </svg>
  );
}

export function TronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className ?? "h-8 w-8"} aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="#EF233C" />
      <path
        d="M10.4 9.8 31 13.6 19.1 31.2 10.4 9.8Zm3.4 3.6 5.7 13.9 2-10.5-7.7-3.4Zm2.2-1 6.3 2.8 3.4-.4-9.7-2.4Zm7.7 4.6-1.8 9.4 6.8-10.1-5 .7Z"
        fill="#fff"
      />
    </svg>
  );
}

export function GasFreeIcon({ className }: { className?: string }) {
  return (
    <div
      className={`grid place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_0_3px_rgba(240,68,68,0.18)] ${className ?? "h-8 w-8"}`}
    >
      <Zap className="h-4 w-4" />
    </div>
  );
}

export const MiniIcons = {
  wallet: WalletCards,
  receive: ArrowDownToLine,
  send: ArrowUpFromLine,
  swap: Repeat2,
  p2p: UsersRound,
  history: History,
  clock: Clock3,
  analytics: BarChart3,
  bank: Landmark,
  upi: QrCode,
  security: ShieldCheck,
  backup: KeyRound,
  profile: UserRound,
  referral: Gift,
  notifications: Bell,
  orders: ReceiptText,
  trade: Banknote,
};
