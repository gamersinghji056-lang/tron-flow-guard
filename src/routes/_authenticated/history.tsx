import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchTradeHistory } from "@/lib/user-product.functions";
import { formatUsdt, shortenHash } from "@/lib/chain";
import { StatusBadge } from "@/components/status-badge";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Trade History - WTRON" }] }),
  component: HistoryPage,
});

interface TradeRow {
  id: string;
  order_ref: string | null;
  amount_usdt: number | string | null;
  rate_inr: number | string | null;
  expected_inr: number | string | null;
  fee_usdt: number | string | null;
  status: string | null;
  created_at: string | null;
  completed_at: string | null;
}

function HistoryPage() {
  const loadHistory = useServerFn(fetchTradeHistory);
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory()
      .then((result) => setRows((result ?? []) as TradeRow[]))
      .catch(() => toast.error("Unable to load trade history. Please try again."))
      .finally(() => setLoading(false));
  }, [loadHistory]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="History"
        description="Company/direct trade history. Wallet blockchain movements remain under Wallet activity."
      />
      <section className="panel overflow-hidden">
        {loading ? (
          <div className="grid h-40 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            No WTRON company trade history yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Order</th>
                <th className="px-4 py-2.5 text-left font-medium">Type</th>
                <th className="px-4 py-2.5 text-right font-medium">USDT</th>
                <th className="px-4 py-2.5 text-right font-medium">Rate</th>
                <th className="px-4 py-2.5 text-right font-medium">INR</th>
                <th className="px-4 py-2.5 text-right font-medium">Fee</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="mono px-4 py-2.5">{row.order_ref ?? shortenHash(row.id)}</td>
                  <td className="px-4 py-2.5">Sell to WTRON</td>
                  <td className="mono px-4 py-2.5 text-right">
                    {formatUsdt(row.amount_usdt)} USDT
                  </td>
                  <td className="mono px-4 py-2.5 text-right">INR {Number(row.rate_inr ?? 0)}</td>
                  <td className="mono px-4 py-2.5 text-right">
                    INR {Number(row.expected_inr ?? 0).toLocaleString("en-IN")}
                  </td>
                  <td className="mono px-4 py-2.5 text-right">{formatUsdt(row.fee_usdt)} USDT</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={String(row.status ?? "created")} />
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
