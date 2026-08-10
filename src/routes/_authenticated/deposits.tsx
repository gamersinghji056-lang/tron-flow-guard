import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { formatUsdt, networkConfig, shortenHash, type DepositStatus } from "@/lib/chain";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/deposits")({
  head: () => ({
    meta: [
      { title: "Deposit history — TRONDESK" },
      {
        name: "description",
        content:
          "Full audit trail of your USDT (TRC20) deposit requests, on-chain transactions and confirmation counts.",
      },
      { property: "og:title", content: "Deposit history — TRONDESK" },
      {
        property: "og:description",
        content: "Every deposit request with its verified on-chain transaction and status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DepositHistory,
});

interface Row {
  id: string;
  order_ref: string;
  status: DepositStatus;
  network: "trc20-mainnet" | "trc20-nile";
  expected_amount: number;
  received_amount: number | null;
  confirmations: number;
  required_confirmations: number;
  txid: string | null;
  failure_reason: string | null;
  created_at: string;
  confirmed_at: string | null;
}

function DepositHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase
        .from("deposit_requests")
        .select(
          "id, order_ref, status, network, expected_amount, received_amount, confirmations, required_confirmations, txid, failure_reason, created_at, confirmed_at",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (!active) return;
      setRows(
        (data ?? []).map((row) => ({
          ...row,
          expected_amount: Number(row.expected_amount),
          received_amount: row.received_amount === null ? null : Number(row.received_amount),
        })) as Row[],
      );
      setLoading(false);
    }
    void load();
    const channel = supabase
      .channel(`history-deposits-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deposit_requests" },
        () => void load(),
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.order_ref.toLowerCase().includes(needle) ||
        (row.txid ?? "").toLowerCase().includes(needle) ||
        row.status.includes(needle),
    );
  }, [rows, query]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Deposit history"
        description="Every request, its verified transaction and the confirmation trail."
        actions={
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search order ref, TXID or status"
            className="w-full sm:w-72"
          />
        }
      />

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Order</th>
              <th className="px-4 py-2.5 text-left font-medium">Created</th>
              <th className="px-4 py-2.5 text-left font-medium">Expected</th>
              <th className="px-4 py-2.5 text-left font-medium">Received</th>
              <th className="px-4 py-2.5 text-left font-medium">Conf.</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">TXID</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  {loading ? "Loading…" : "Nothing matches this filter."}
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const chain = networkConfig(row.network);
                return (
                  <tr key={row.id} className="hover:bg-secondary/30">
                    <td className="mono px-4 py-2.5">{row.order_ref}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="mono px-4 py-2.5">{formatUsdt(row.expected_amount)}</td>
                    <td className="mono px-4 py-2.5">
                      {row.received_amount === null ? "—" : formatUsdt(row.received_amount)}
                    </td>
                    <td className="mono px-4 py-2.5">
                      {row.confirmations}/{row.required_confirmations}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={row.status} />
                      {row.failure_reason ? (
                        <p className="mt-1 max-w-56 text-xs text-destructive">
                          {row.failure_reason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.txid ? (
                        <a
                          className="mono text-primary hover:underline"
                          href={chain.explorerTx(row.txid)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortenHash(row.txid)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
