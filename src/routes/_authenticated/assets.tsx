import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, Wallet2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatUsdt } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { SectionHeader, StatCard } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/assets")({
  head: () => ({ meta: [{ title: "Assets - TRONDESK" }] }),
  component: AssetsPage,
});

interface WalletRow {
  id: string;
  name: string;
  balance: number;
  network: string;
  address: string;
}

interface TxRow {
  id: string;
  amount: number;
  direction: string;
  kind: string;
  status: string;
  created_at: string;
}

type RawWalletRow = Omit<WalletRow, "balance"> & { balance: unknown };
type RawTxRow = Omit<TxRow, "amount"> & { amount: unknown };
type ProfileWithLocks = { locked_balance?: unknown };

function AssetsPage() {
  const { profile } = useAuth();
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [transactions, setTransactions] = useState<TxRow[]>([]);

  async function load() {
    const [{ data: walletRows }, { data: txRows }] = await Promise.all([
      supabase
        .from("user_wallets")
        .select("id, name, balance, network, address")
        .eq("is_archived", false)
        .order("is_default", { ascending: false }),
      supabase
        .from("wallet_transactions")
        .select("id, amount, direction, kind, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setWallets(
      ((walletRows ?? []) as unknown as RawWalletRow[]).map((row) => ({
        ...row,
        balance: Number(row.balance ?? 0),
      })),
    );
    setTransactions(
      ((txRows ?? []) as unknown as RawTxRow[]).map((row) => ({
        ...row,
        amount: Number(row.amount ?? 0),
      })),
    );
  }

  useEffect(() => {
    void load();
  }, []);

  const walletTotal = useMemo(() => wallets.reduce((sum, row) => sum + row.balance, 0), [wallets]);
  const available = Number(profile?.balance ?? 0);
  const locked = Number((profile as ProfileWithLocks | null)?.locked_balance ?? 0);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Assets"
        description="Balances, wallets, deposits, withdrawals and transaction history."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link to="/deposits">
                <ArrowDownLeft className="mr-1.5 h-4 w-4" />
                Deposit
              </Link>
            </Button>
            <Button asChild>
              <Link to={"/withdraw" as never}>
                <ArrowUpRight className="mr-1.5 h-4 w-4" />
                Withdraw
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/wallet">
                <ArrowUpRight className="mr-1.5 h-4 w-4" />
                Wallets
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total assets"
          value={`${formatUsdt(available + locked)} USDT`}
          icon={<Wallet2 className="h-4 w-4" />}
        />
        <StatCard label="Available USDT" value={`${formatUsdt(available)} USDT`} tone="success" />
        <StatCard label="Locked USDT" value={`${formatUsdt(locked)} USDT`} tone="warning" />
        <StatCard label="Wallet total" value={`${formatUsdt(walletTotal)} USDT`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="panel overflow-hidden">
          <div className="border-b px-5 py-3 text-sm font-semibold">Wallets</div>
          <div className="divide-y">
            {wallets.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No wallets created yet.
              </div>
            ) : (
              wallets.map((wallet) => (
                <div key={wallet.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{wallet.name}</p>
                      <p className="mono truncate text-xs text-muted-foreground">
                        {wallet.address}
                      </p>
                    </div>
                    <p className="mono text-primary">{formatUsdt(wallet.balance)} USDT</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b px-5 py-3 text-sm font-semibold">Recent transactions</div>
          <div className="divide-y">
            {transactions.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No wallet transactions yet.
              </div>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{tx.kind}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="mono">
                      {tx.direction === "out" ? "-" : "+"}
                      {formatUsdt(tx.amount)} USDT
                    </p>
                    <p className="text-xs text-muted-foreground">{tx.status}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
