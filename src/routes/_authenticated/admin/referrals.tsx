import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getAdminReferralOverview, updatePlatformSettings } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/admin/referrals")({
  head: () => ({ meta: [{ title: "Referral Program - WTRON Admin" }] }),
  component: AdminReferralsPage,
});

interface ReferralRewardRow {
  id: string;
  amount: number | string;
  currency?: string | null;
  status: string;
  sourceType?: string | null;
  sourceOrderId?: string | null;
  tradeAmountUsdt?: number | string | null;
  ratePercent?: number | string | null;
  createdAt?: string | null;
  referrerUserId?: string | null;
  referrerName?: string | null;
  referredUserId?: string | null;
  referredName?: string | null;
}

interface ReferralOverview {
  settings?: Record<string, unknown>;
  totalDirectReferrals?: number;
  qualifiedReferrals?: number;
  eligibleTradeVolume?: number | string;
  pendingRewards?: number | string;
  paidRewards?: number | string;
  totalRewards?: number | string;
  recentRewards?: ReferralRewardRow[];
}

function settingBoolean(
  settings: Record<string, unknown> | undefined,
  key: string,
  fallback: boolean,
) {
  const value = settings?.[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
}

function settingNumber(
  settings: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
) {
  const value = Number(settings?.[key] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function money(value: unknown, currency = "USDT") {
  const number = Number(value ?? 0);
  return `${number.toLocaleString("en-IN", { maximumFractionDigits: 6 })} ${currency}`;
}

function AdminReferralsPage() {
  const loadOverview = useServerFn(getAdminReferralOverview);
  const saveSettings = useServerFn(updatePlatformSettings);
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    enabled: true,
    rate: "0.20",
    p2p: true,
    directSell: true,
  });

  const load = useCallback(async () => {
    const next = (await loadOverview()) as ReferralOverview;
    setOverview(next);
    setForm({
      enabled: settingBoolean(next.settings, "referral_campaign_enabled", true),
      rate: String(settingNumber(next.settings, "referral_direct_rate_percent", 0.2)),
      p2p: settingBoolean(next.settings, "referral_eligible_p2p_enabled", true),
      directSell: settingBoolean(next.settings, "referral_eligible_direct_sell_enabled", true),
    });
  }, [loadOverview]);

  useEffect(() => {
    void load().catch((error) =>
      toast.error(error instanceof Error ? error.message : "Could not load referral overview"),
    );
  }, [load]);

  const safeRate = useMemo(() => {
    const value = Number(form.rate);
    if (!Number.isFinite(value)) return 0.2;
    return Math.min(0.2, Math.max(0.1, value));
  }, [form.rate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await saveSettings({
        data: {
          referralCampaignEnabled: form.enabled,
          referralDirectRatePercent: safeRate,
          referralEligibleP2pEnabled: form.p2p,
          referralEligibleDirectSellEnabled: form.directSell,
        },
      });
      toast.success("Referral settings saved");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save referral settings");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Referral Program"
        description="One-level direct referral settings, live metrics and reward ledger. No second-level rewards are created."
      />

      <form className="panel grid gap-4 p-5 md:grid-cols-2" onSubmit={submit}>
        <Toggle
          label="Referral enabled"
          checked={form.enabled}
          onChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
        />
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Direct referral percentage</label>
          <Input
            type="number"
            min="0.10"
            max="0.20"
            step="0.01"
            value={form.rate}
            onChange={(event) => setForm((current) => ({ ...current, rate: event.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            Safe range: 0.10% to 0.20%. Current save value: {safeRate.toFixed(2)}%.
          </p>
        </div>
        <Toggle
          label="Eligible P2P trades"
          checked={form.p2p}
          onChange={(p2p) => setForm((current) => ({ ...current, p2p }))}
        />
        <Toggle
          label="Eligible WTRON Direct Sell trades"
          checked={form.directSell}
          onChange={(directSell) => setForm((current) => ({ ...current, directSell }))}
        />
        <Button className="md:col-span-2" disabled={pending}>
          {pending ? "Saving..." : "Save Referral Settings"}
        </Button>
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          label="Total direct referrals"
          value={String(overview?.totalDirectReferrals ?? 0)}
        />
        <Metric label="Qualified referrals" value={String(overview?.qualifiedReferrals ?? 0)} />
        <Metric label="Eligible referred volume" value={money(overview?.eligibleTradeVolume)} />
        <Metric label="Pending rewards" value={money(overview?.pendingRewards)} />
        <Metric label="Paid rewards" value={money(overview?.paidRewards)} />
        <Metric label="Total rewards" value={money(overview?.totalRewards)} />
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b p-4">
          <p className="font-semibold">Recent referral rewards</p>
          <p className="text-sm text-muted-foreground">
            Rewards are generated only from completed eligible P2P and WTRON trades.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Created</th>
              <th className="px-4 py-2 text-left">Source order</th>
              <th className="px-4 py-2 text-left">Referrer</th>
              <th className="px-4 py-2 text-left">Referred user</th>
              <th className="px-4 py-2 text-right">Trade</th>
              <th className="px-4 py-2 text-right">Rate</th>
              <th className="px-4 py-2 text-right">Reward</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(overview?.recentRewards ?? []).length ? (
              overview?.recentRewards?.map((reward) => (
                <tr key={reward.id}>
                  <td className="px-4 py-2">
                    {reward.createdAt ? new Date(reward.createdAt).toLocaleString() : "-"}
                  </td>
                  <td className="mono px-4 py-2">
                    {reward.sourceType ?? "-"} / {reward.sourceOrderId ?? "-"}
                  </td>
                  <td className="px-4 py-2">{reward.referrerName ?? reward.referrerUserId}</td>
                  <td className="px-4 py-2">{reward.referredName ?? reward.referredUserId}</td>
                  <td className="mono px-4 py-2 text-right">{money(reward.tradeAmountUsdt)}</td>
                  <td className="mono px-4 py-2 text-right">
                    {Number(reward.ratePercent ?? 0).toFixed(2)}%
                  </td>
                  <td className="mono px-4 py-2 text-right">
                    {money(reward.amount, reward.currency ?? "USDT")}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No referral rewards yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-medium">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mono mt-1 break-all text-lg font-semibold">{value}</p>
    </div>
  );
}
