import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, Wallet2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_NETWORK, formatUsdt, networkConfig } from "@/lib/chain";
import { walletDisplayBalance } from "@/lib/wallet-state";
import { Button } from "@/components/ui/button";
import { SectionHeader, StatCard } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/assets")({
  head: () => ({ meta: [{ title: "Assets - WTRON" }] }),
  component: AssetsPage,
});

interface WalletRow {
  id: string;
  name: string;
  balance: number;
  onchain_balance?: number | null;
  onchain_trx_balance?: number | null;
  custody?: string | null;
  network: string;
  address: string;
  wallet_type?: string | null;
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
  const [preservedWallets, setPreservedWallets] = useState<WalletRow[]>([]);
  const [transactions, setTransactions] = useState<TxRow[]>([]);

  async function load() {
    const [{ data: walletRows }, { data: txRows }] = await Promise.all([
      supabase
        .from("user_wallets")
        .select(
          "id, name, balance, onchain_balance, onchain_trx_balance, custody, network, address, wallet_type",
        )
        .eq("is_archived", false)
        .order("is_default", { ascending: false }),
      supabase
        .from("wallet_transactions")
        .select("id, amount, direction, kind, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const normalizedWallets = ((walletRows ?? []) as unknown as RawWalletRow[]).map((row) => ({
      ...row,
      balance: Number(row.balance ?? 0),
      onchain_balance: row.onchain_balance == null ? null : Number(row.onchain_balance ?? 0),
      onchain_trx_balance:
        row.onchain_trx_balance == null ? null : Number(row.onchain_trx_balance ?? 0),
    }));
    setWallets(normalizedWallets.filter((wallet) => wallet.network === DEFAULT_NETWORK));
    setPreservedWallets(normalizedWallets.filter((wallet) => wallet.network !== DEFAULT_NETWORK));
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

  const walletTotal = useMemo(
    () => wallets.reduce((sum, row) => sum + walletDisplayBalance(row), 0),
    [wallets],
  );
  const walletTrxTotal = useMemo(
    () => wallets.reduce((sum, row) => sum + Number(row.onchain_trx_balance ?? 0), 0),
    [wallets],
  );
  const preservedTotal = useMemo(
    () => preservedWallets.reduce((sum, row) => sum + walletDisplayBalance(row), 0),
    [preservedWallets],
  );
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
          value={`${formatUsdt(walletTotal)} USDT`}
          icon={<Wallet2 className="h-4 w-4" />}
        />
        <StatCard label="Available USDT" value={`${formatUsdt(available)} USDT`} tone="success" />
        <StatCard label="Locked USDT" value={`${formatUsdt(locked)} USDT`} tone="warning" />
        <StatCard label="Wallet TRX" value={`${formatUsdt(walletTrxTotal)} TRX`} />
      </div>
      {preservedWallets.length ? (
        <div className="panel rounded-[17px] p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Preserved wallet data</p>
          <p className="mt-1">
            {preservedWallets.length} historical wallet
            {preservedWallets.length === 1 ? "" : "s"} visible read-only. Historical balance:{" "}
            {formatUsdt(preservedTotal)} USDT. These rows are excluded from Mainnet totals.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="panel overflow-hidden">
          <div className="border-b px-5 py-3 text-sm font-semibold">Wallets</div>
          <div className="divide-y">
            {wallets.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                {preservedWallets.length
                  ? "No active Mainnet wallet yet. Preserved wallet data is listed below."
                  : "No wallets created yet."}
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
                    <p className="mono text-primary">
                      {formatUsdt(walletDisplayBalance(wallet))} USDT
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {preservedWallets.length ? (
          <div className="panel overflow-hidden">
            <div className="border-b px-5 py-3 text-sm font-semibold">
              Preserved / Historical Wallets
            </div>
            <div className="divide-y">
              {preservedWallets.map((wallet) => {
                const networkLabel = wallet.network
                  ? networkConfig(wallet.network as never).label
                  : "Legacy / Unclassified Network";
                return (
                  <div key={wallet.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{wallet.name}</p>
                        <p className="mono truncate text-xs text-muted-foreground">
                          {wallet.address}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {networkLabel} · {(wallet.wallet_type ?? "standard").toUpperCase()} · READ
                          ONLY
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="mono text-primary">
                          {formatUsdt(walletDisplayBalance(wallet))} USDT
                        </p>
                        <p className="mono text-xs text-muted-foreground">
                          {formatUsdt(Number(wallet.onchain_trx_balance ?? 0))} TRX
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

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
