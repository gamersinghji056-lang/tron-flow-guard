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
export type V17NavIconName = "home" | "p2p" | "trade" | "wallet" | "orders" | "more";

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
        className={`relative grid place-items-center overflow-hidden rounded-[31%] text-white shadow-[0_10px_26px_rgba(55,86,194,0.28)] ${markClassName ?? "h-9 w-9"}`}
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
        <span className="hidden h-full w-full place-items-center rounded-[31%] bg-gradient-to-br from-[#6488ff] via-[#3e62dc] to-[#273d91] text-sm font-semibold tracking-normal text-white">
          W
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

export function V17NavIcon({ name, className }: { name: V17NavIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-5 w-5"} aria-hidden="true" fill="none">
      {name === "home" ? (
        <path
          d="M4.2 10.2 12 3.8l7.8 6.4v8.3a1.8 1.8 0 0 1-1.8 1.8h-4v-5.8h-4v5.8H6a1.8 1.8 0 0 1-1.8-1.8v-8.3Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {name === "p2p" ? (
        <>
          <circle cx="8.3" cy="8" r="2.8" stroke="currentColor" strokeWidth="1.75" />
          <circle cx="16.3" cy="9.2" r="2.25" stroke="currentColor" strokeWidth="1.65" />
          <path
            d="M3.2 19.3c.8-3.2 2.5-4.9 5.1-4.9 2.7 0 4.4 1.7 5.2 4.9M13.5 15.2c.8-.7 1.8-1.1 3-1.1 2.1 0 3.6 1.4 4.3 3.9"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </>
      ) : null}
      {name === "trade" ? (
        <path
          d="M4 7.2h13.1M14.3 4.4l2.8 2.8-2.8 2.8M20 16.8H6.9M9.7 14l-2.8 2.8 2.8 2.8"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {name === "wallet" ? (
        <>
          <path
            d="M4 6.3A2.3 2.3 0 0 1 6.3 4h10.5A2.2 2.2 0 0 1 19 6.2V8.1H7.2a3.2 3.2 0 0 0 0 6.4H19v3.3a2.2 2.2 0 0 1-2.2 2.2H6.3A2.3 2.3 0 0 1 4 17.7V6.3Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M19 8.1H7.2a3.2 3.2 0 0 0 0 6.4H19V8.1Z"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <circle cx="8" cy="11.3" r=".95" fill="currentColor" />
        </>
      ) : null}
      {name === "orders" ? (
        <>
          <path
            d="M6.2 4.2h11.6a1.6 1.6 0 0 1 1.6 1.6v14l-2.7-1.5-4.7 1.8-4.7-1.8-2.7 1.5v-14a1.6 1.6 0 0 1 1.6-1.6Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M8.4 8.3h7.2M8.4 12h7.2M8.4 15.7h4.2"
            stroke="currentColor"
            strokeWidth="1.65"
            strokeLinecap="round"
          />
        </>
      ) : null}
      {name === "more" ? (
        <>
          <circle cx="5.5" cy="12" r="1.55" fill="currentColor" />
          <circle cx="12" cy="12" r="1.55" fill="currentColor" />
          <circle cx="18.5" cy="12" r="1.55" fill="currentColor" />
        </>
      ) : null}
    </svg>
  );
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
      className={`grid place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_0_3px_rgba(37,99,235,0.2)] ${className ?? "h-8 w-8"}`}
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
  deposit: ArrowDownToLine,
  profile: UserRound,
  referral: Gift,
  notifications: Bell,
  orders: ReceiptText,
  trade: Banknote,
};
