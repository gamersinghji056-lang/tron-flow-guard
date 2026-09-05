import { Button } from "@/components/ui/button";
import {
  V17EmptyLine,
  V17MetricGrid,
  V17Screen,
  V17Section,
} from "@/components/mini-app/shared/v17-primitives";
import { formatUsdt } from "@/lib/chain";

export interface MiniReferralSummary {
  referralCode: string;
  referralLink: string;
  invitedUsers: { id: string; status: string; created_at: string }[];
  qualifiedReferrals: number;
  pendingEarnings: number;
  paidEarnings: number;
  totalReferralEarnings?: number;
  eligibleTradeVolume?: number;
  settings?: { key: string; value: unknown }[];
  rewards?: {
    id?: string;
    amount: number | string;
    currency?: string | null;
    status: string;
    trade_amount_usdt?: number | string | null;
    rate_percent?: number | string | null;
  }[];
}

function money(value: unknown, currency = "USDT") {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return currency === "INR" ? "INR 0.00" : formatUsdt(0);
  if (currency === "INR") {
    return `INR ${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  return formatUsdt(number);
}

function referralRatePercent(summary: MiniReferralSummary | null) {
  const setting = summary?.settings?.find((row) => row.key === "referral_direct_rate_percent");
  const value = Number(setting?.value ?? 0.2);
  return Number.isFinite(value) ? value : 0.2;
}

async function copyText(value: string, label = "Copied") {
  await navigator.clipboard?.writeText(value);
  return label;
}

export default function ReferralScreen({ summary }: { summary: MiniReferralSummary | null }) {
  const rate = referralRatePercent(summary);
  return (
    <V17Screen title="Refer & Earn" subtitle="Earn from users you directly invite">
      <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
        <p className="text-xs uppercase text-slate-400">Referral Code</p>
        <p className="mono mt-2 text-2xl font-semibold">{summary?.referralCode ?? "Loading"}</p>
        <p className="mono mt-2 break-all text-sm text-slate-400">{summary?.referralLink ?? ""}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() =>
              summary?.referralLink && void copyText(summary.referralLink, "Referral link copied")
            }
          >
            Copy
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              summary?.referralLink &&
              navigator.share?.({ text: summary.referralLink }).catch(() => undefined)
            }
          >
            Share
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-300">
          Earn up to {rate.toFixed(2)}% on eligible trades completed by users you directly refer.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Rewards apply only to eligible completed P2P and WTRON trades. Wallet transfers do not
          earn referral commission.
        </p>
      </div>
      <V17MetricGrid
        items={[
          ["Direct referrals", String(summary?.invitedUsers?.length ?? 0)],
          ["Qualified referrals", String(summary?.qualifiedReferrals ?? 0)],
          ["Eligible volume", money(summary?.eligibleTradeVolume)],
          ["Pending earnings", money(summary?.pendingEarnings)],
          ["Paid earnings", money(summary?.paidEarnings)],
          ["Total earnings", money(summary?.totalReferralEarnings)],
        ]}
      />
      <V17Section title="Recent Referral Rewards">
        {summary?.rewards?.length ? (
          summary.rewards.slice(0, 10).map((reward, index) => (
            <div
              key={reward.id ?? index}
              className="rounded-xl border border-white/10 bg-white/6 p-3"
            >
              <V17MetricGrid
                items={[
                  ["Reward", `${money(reward.amount)} ${reward.currency ?? "USDT"}`],
                  ["Trade amount", money(reward.trade_amount_usdt)],
                  ["Rate", `${Number(reward.rate_percent ?? rate).toFixed(2)}%`],
                  ["Status", reward.status],
                ]}
              />
            </div>
          ))
        ) : (
          <V17EmptyLine>No referral rewards yet.</V17EmptyLine>
        )}
      </V17Section>
    </V17Screen>
  );
}
