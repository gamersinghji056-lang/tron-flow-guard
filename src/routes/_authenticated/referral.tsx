import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { fetchReferralSummary, recordReferralAttribution } from "@/lib/user-product.functions";
import { formatUsdt } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/referral")({
  head: () => ({ meta: [{ title: "Refer & Earn - WTRON" }] }),
  component: ReferralPage,
});

interface ReferralSummary {
  referralCode: string;
  referralLink: string;
  invitedUsers: { id: string; status: string; created_at: string }[];
  qualifiedReferrals: number;
  pendingEarnings: number;
  paidEarnings: number;
  totalReferralEarnings: number;
}

function ReferralPage() {
  const loadSummary = useServerFn(fetchReferralSummary);
  const recordAttribution = useServerFn(recordReferralAttribution);
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");

  async function load() {
    setLoading(true);
    try {
      setSummary((await loadSummary()) as ReferralSummary);
    } catch (error) {
      toast.error("Unable to load referral summary. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    try {
      await recordAttribution({ data: { referralCode: code, source: "manual" } });
      setCode("");
      toast.success("Referral applied");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply referral");
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Refer & Earn"
        description="Referral rewards are credited only after the configured qualification condition is met."
      />
      {loading ? (
        <div className="panel grid h-40 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !summary ? (
        <p className="panel p-8 text-center text-sm text-muted-foreground">
          Unable to load referral data.
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_.8fr]">
            <div className="panel p-5">
              <p className="text-xs tracking-wide text-muted-foreground uppercase">Referral Code</p>
              <p className="mono mt-2 text-3xl font-semibold">{summary.referralCode}</p>
              <p className="mono mt-2 break-all text-sm text-muted-foreground">
                {summary.referralLink}
              </p>
              <Button
                className="mt-4"
                onClick={() => {
                  void navigator.clipboard.writeText(summary.referralLink);
                  toast.success("Referral link copied");
                }}
              >
                <Copy className="mr-1.5 h-4 w-4" />
                Copy Link
              </Button>
            </div>
            <form className="panel space-y-3 p-5" onSubmit={submitCode}>
              <h2 className="font-semibold">Have a referral code?</h2>
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Enter code"
              />
              <Button variant="secondary" disabled={!code.trim()}>
                Apply Code
              </Button>
            </form>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Invited Users" value={String(summary.invitedUsers.length)} />
            <Metric label="Qualified" value={String(summary.qualifiedReferrals)} />
            <Metric
              label="Pending Earnings"
              value={`${formatUsdt(summary.pendingEarnings)} USDT`}
            />
            <Metric label="Paid Earnings" value={`${formatUsdt(summary.paidEarnings)} USDT`} />
            <Metric
              label="Total Earnings"
              value={`${formatUsdt(summary.totalReferralEarnings)} USDT`}
            />
          </div>

          <section className="panel overflow-hidden">
            <div className="border-b px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <Users className="h-4 w-4 text-primary" />
                Invited Users
              </h2>
            </div>
            {summary.invitedUsers.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No invited users yet.</p>
            ) : (
              <div className="divide-y">
                {summary.invitedUsers.map((row) => (
                  <div key={row.id} className="flex justify-between gap-3 p-4 text-sm">
                    <span className="mono">{row.id.slice(0, 8)}</span>
                    <span className="capitalize text-muted-foreground">{row.status}</span>
                    <span>{new Date(row.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mono mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
