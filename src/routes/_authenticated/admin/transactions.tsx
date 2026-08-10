import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatUsdt, networkConfig, shortenHash } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/transactions")({
  head: () => ({
    meta: [
      { title: "On-chain transactions — TRONDESK admin" },
      {
        name: "description",
        content:
          "Every TRC20 USDT transfer the listener has ingested, with verification result, confirmations and matched deposit request.",
      },
      { property: "og:title", content: "On-chain transactions — TRONDESK admin" },
      {
        property: "og:description",
        content: "Ingested transfers, verification results and confirmation counts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminTransactions,
});

interface TxRow {
  id: string;
  txid: string;
  network: "trc20-mainnet" | "trc20-nile";
  amount: number;
  token_symbol: string;
  sender_address: string | null;
  receiver_address: string;
  confirmations: number;
  chain_status: string | null;
  verified: boolean;
  processed: boolean;
  verification_error: string | null;
  block_number: number | null;
  block_timestamp: string | null;
  deposit_request_id: string | null;
  created_at: string;
}

function AdminTransactions() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("transactions")
        .select(
          "id, txid, network, amount, token_symbol, sender_address, receiver_address, confirmations, chain_status, verified, processed, verification_error, block_number, block_timestamp, deposit_request_id, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (!active) return;
      setRows(
        (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) })) as TxRow[],
      );
    }

    void load();
    const channel = supabase
      .channel(`admin-transactions-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => void load())
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.txid.toLowerCase().includes(needle) ||
        row.receiver_address.toLowerCase().includes(needle) ||
        (row.sender_address ?? "").toLowerCase().includes(needle),
    );
  }, [rows, query]);

  function exportCsv() {
    const header = [
      "txid",
      "network",
      "amount",
      "token",
      "sender",
      "receiver",
      "confirmations",
      "chain_status",
      "verified",
      "processed",
      "block",
      "seen_at",
    ];
    const lines = filtered.map((row) =>
      [
        row.txid,
        row.network,
        row.amount,
        row.token_symbol,
        row.sender_address ?? "",
        row.receiver_address,
        row.confirmations,
        row.chain_status ?? "",
        row.verified,
        row.processed,
        row.block_number ?? "",
        row.created_at,
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trondesk-transactions-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!isAdmin) {
    return (
      <div className="panel p-6">
        <h1 className="text-lg font-semibold">Admin access required</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This area is restricted to platform administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="On-chain transactions"
        description="Everything the listener ingested, verified or rejected."
        actions={
          <div className="flex w-full gap-2 sm:w-auto">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search TXID or address"
              className="w-full sm:w-64"
            />
            <Button variant="secondary" onClick={exportCsv}>
              <Download className="mr-1.5 h-4 w-4" />
              CSV
            </Button>
          </div>
        }
      />

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">TXID</th>
              <th className="px-4 py-2.5 text-left font-medium">Amount</th>
              <th className="px-4 py-2.5 text-left font-medium">From → To</th>
              <th className="px-4 py-2.5 text-left font-medium">Block</th>
              <th className="px-4 py-2.5 text-left font-medium">Conf.</th>
              <th className="px-4 py-2.5 text-left font-medium">Receipt</th>
              <th className="px-4 py-2.5 text-left font-medium">Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No transactions ingested yet.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const chain = networkConfig(row.network);
                return (
                  <tr key={row.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-2.5">
                      <a
                        className="mono text-primary hover:underline"
                        href={chain.explorerTx(row.txid)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortenHash(row.txid, 8)}
                      </a>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(row.created_at).toLocaleString()}
                      </p>
                    </td>
                    <td className="mono px-4 py-2.5">
                      {formatUsdt(row.amount)} {row.token_symbol}
                    </td>
                    <td className="mono px-4 py-2.5 text-xs">
                      {shortenHash(row.sender_address, 5)} → {shortenHash(row.receiver_address, 5)}
                    </td>
                    <td className="mono px-4 py-2.5 text-xs">
                      {row.block_number?.toLocaleString() ?? "—"}
                    </td>
                    <td className="mono px-4 py-2.5">{row.confirmations}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "mono text-xs",
                          row.chain_status === "SUCCESS" ? "text-success" : "text-warning",
                        )}
                      >
                        {row.chain_status ?? "pending"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          row.verified ? "text-success" : "text-destructive",
                        )}
                      >
                        {row.verified ? (row.processed ? "Verified · credited" : "Verified") : "Rejected"}
                      </span>
                      {row.verification_error ? (
                        <p className="max-w-56 text-[11px] text-muted-foreground">
                          {row.verification_error}
                        </p>
                      ) : null}
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
