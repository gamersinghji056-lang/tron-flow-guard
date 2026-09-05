import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Copy,
  ExternalLink,
  HandCoins,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wallet2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createDepositRequest } from "@/lib/deposits.functions";
import { useAuth } from "@/hooks/use-auth";
import { useListenerHeartbeat } from "@/hooks/use-listener-heartbeat";
import {
  DEFAULT_NETWORK,
  formatUsdt,
  networkConfig,
  shortenHash,
  type DepositStatus,
} from "@/lib/chain";
import type { ChainNetwork } from "@/lib/chain";
import { walletDisplayBalance } from "@/lib/wallet-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { StatCard, SectionHeader } from "@/components/stat-card";
import { LiveDot, StatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Deposit desk - WTRON" },
      {
        name: "description",
        content:
          "Create a USDT (TRC20) deposit request and watch the blockchain listener detect, confirm and credit it automatically.",
      },
      { property: "og:title", content: "Deposit desk - WTRON" },
      {
        property: "og:description",
        content: "Automatic TRC20 USDT deposit verification with live confirmation tracking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

interface DepositRow {
  id: string;
  order_ref: string;
  status: DepositStatus;
  network: "trc20-mainnet" | "trc20-nile";
  expected_amount: number;
  received_amount: number | null;
  confirmations: number;
  required_confirmations: number;
  txid: string | null;
  sender_address: string | null;
  failure_reason: string | null;
  expires_at: string;
  created_at: string;
  wallet_id: string;
}

interface WalletRow {
  id: string;
  name: string;
  address: string;
}

interface PersonalWalletRow {
  id: string;
  name: string;
  address: string;
  network: ChainNetwork | string | null;
  balance: number;
  onchain_balance?: number | null;
  onchain_trx_balance?: number | null;
  custody?: string | null;
  wallet_type?: string | null;
  wallet_role?: string | null;
}

function useDeposits(userId: string | undefined) {
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [wallets, setWallets] = useState<Record<string, WalletRow>>({});
  const [personalWallets, setPersonalWallets] = useState<PersonalWalletRow[]>([]);
  const [preservedWallets, setPreservedWallets] = useState<PersonalWalletRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    async function load() {
      const [{ data: rows }, { data: walletRows }, { data: personalRows, error: personalError }] =
        await Promise.all([
          supabase
            .from("deposit_requests")
            .select(
              "id, order_ref, status, network, expected_amount, received_amount, confirmations, required_confirmations, txid, sender_address, failure_reason, expires_at, created_at, wallet_id",
            )
            .order("created_at", { ascending: false })
            .limit(50),
          supabase.from("wallets").select("id, name, address"),
          supabase
            .from("user_wallets" as never)
            .select(
              "id, name, address, network, balance, onchain_balance, onchain_trx_balance, custody, wallet_type, wallet_role",
            )
            .eq("is_archived", false as never),
        ]);
      if (!active) return;
      setDeposits(
        (rows ?? []).map((row) => ({
          ...row,
          expected_amount: Number(row.expected_amount),
          received_amount: row.received_amount === null ? null : Number(row.received_amount),
        })) as DepositRow[],
      );
      setWallets(Object.fromEntries((walletRows ?? []).map((w) => [w.id, w as WalletRow])));
      if (personalError) toast.error("Unable to load personal wallet balance.");
      const normalizedPersonalRows = ((personalRows ?? []) as unknown as PersonalWalletRow[]).map(
        (wallet) => ({
          ...wallet,
          balance: Number(wallet.balance ?? 0),
          onchain_balance:
            wallet.onchain_balance == null ? null : Number(wallet.onchain_balance ?? 0),
          onchain_trx_balance:
            wallet.onchain_trx_balance == null ? null : Number(wallet.onchain_trx_balance ?? 0),
        }),
      );
      setPersonalWallets(
        normalizedPersonalRows.filter((wallet) => wallet.network === DEFAULT_NETWORK),
      );
      setPreservedWallets(
        normalizedPersonalRows.filter((wallet) => wallet.network !== DEFAULT_NETWORK),
      );
      setLoading(false);
    }

    void load();

    const channel = supabase
      .channel(`dashboard-deposits-${crypto.randomUUID()}`)
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
  }, [userId]);

  return { deposits, wallets, personalWallets, preservedWallets, loading, reload: () => void 0 };
}

function HomeAction({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof Wallet2;
  label: string;
}) {
  return (
    <Link to={to} className="text-center">
      <span className="mx-auto grid h-[45px] w-[45px] place-items-center rounded-[14px] border border-[#222837] bg-[#10131a] text-[#7ba0ff]">
        <Icon className="h-[19px] w-[19px]" />
      </span>
      <span className="mt-2 block text-[9.5px] text-slate-300">{label}</span>
    </Link>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center rounded-md border px-2 py-1 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mono mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return (
    <span className="mono">
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

function DashboardPage() {
  const { user, profile } = useAuth();
  const { deposits, wallets, personalWallets, preservedWallets, loading } = useDeposits(user?.id);
  const createDeposit = useServerFn(createDepositRequest);
  const [amount, setAmount] = useState("25");
  const [pending, setPending] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const active = useMemo(
    () => deposits.find((row) => ["waiting", "detected", "confirming"].includes(row.status)),
    [deposits],
  );

  const heartbeat = useListenerHeartbeat(Boolean(active));
  const wallet = active ? wallets[active.wallet_id] : undefined;
  const chain = networkConfig(active?.network);

  useEffect(() => {
    if (!wallet?.address) {
      setQr(null);
      return;
    }
    let active2 = true;
    void QRCode.toDataURL(wallet.address, {
      margin: 1,
      width: 320,
      color: { dark: "#0b0e13", light: "#ffffff" },
    }).then((url) => {
      if (active2) setQr(url);
    });
    return () => {
      active2 = false;
    };
  }, [wallet?.address]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid deposit amount");
      return;
    }
    setPending(true);
    try {
      const result = await createDeposit({ data: { amount: value } });
      toast.success(`Deposit ${result.orderRef} created`, {
        description: "Send the exact amount to the address shown below.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the deposit request");
    } finally {
      setPending(false);
    }
  }

  const confirmed = deposits.filter((row) => row.status === "confirmed");
  const totalCredited = confirmed.reduce((sum, row) => sum + (row.received_amount ?? 0), 0);
  const personalUsdt = personalWallets.reduce(
    (sum, wallet) => sum + walletDisplayBalance(wallet),
    0,
  );
  const personalTrx = personalWallets.reduce(
    (sum, wallet) => sum + Number(wallet.onchain_trx_balance ?? 0),
    0,
  );
  const preservedUsdt = preservedWallets.reduce(
    (sum, wallet) => sum + walletDisplayBalance(wallet),
    0,
  );
  const preservedTrx = preservedWallets.reduce(
    (sum, wallet) => sum + Number(wallet.onchain_trx_balance ?? 0),
    0,
  );

  return (
    <div className="mx-auto max-w-[430px] space-y-[23px] md:max-w-7xl">
      <section>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="kicker-v17">TRADER ACCOUNT</p>
            <h1 className="title-v17">Good day, {profile?.full_name || "WTRON Trader"}</h1>
            <p className="body-v17">Your personal WTRON wallet, P2P and direct trading overview.</p>
          </div>
        </div>
        <div className="mt-5">
          <p className="text-[9px] text-slate-500">Total portfolio</p>
          <p className="balance-v17">{formatUsdt(personalUsdt)} USDT</p>
          <p className="text-[10px] text-slate-500">
            Personal Mainnet wallets. {formatUsdt(personalTrx)} TRX
          </p>
        </div>
        <div className="mt-[18px] grid grid-cols-4 gap-[10px]">
          <HomeAction to="/deposits" icon={ArrowDownLeft} label="Deposit" />
          <HomeAction to="/wallet" icon={ArrowUpRight} label="Send" />
          <HomeAction to="/wallet" icon={Copy} label="Receive" />
          <HomeAction to="/trade" icon={HandCoins} label="Trade" />
        </div>
        <div className="mt-[18px] grid grid-cols-2 gap-[10px]">
          <StatCard label="WTRON balance" value={`${formatUsdt(profile?.balance)} USDT`} />
          <StatCard label="Wallet balance" value={`${formatUsdt(personalUsdt)} USDT`} />
        </div>
        {preservedWallets.length ? (
          <div className="panel mt-[10px] rounded-[17px] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold">Preserved wallet data</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {preservedWallets.length} historical wallet
                  {preservedWallets.length === 1 ? "" : "s"} visible read-only. These balances are
                  excluded from Mainnet portfolio totals.
                </p>
              </div>
              <Badge>READ ONLY</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric label="Historical USDT" value={`${formatUsdt(preservedUsdt)} USDT`} />
              <Metric label="Historical TRX" value={`${formatUsdt(preservedTrx)} TRX`} />
            </div>
          </div>
        ) : null}
      </section>

      <div className="grid gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Available balance"
          value={`${formatUsdt(personalUsdt)} USDT`}
          icon={<Wallet2 className="h-4 w-4" />}
          tone="success"
          hint="Personal wallet funds"
        />
        <StatCard
          label="Confirmed deposits"
          value={confirmed.length}
          icon={<ShieldCheck className="h-4 w-4" />}
          hint={`${formatUsdt(totalCredited)} USDT credited`}
          loading={loading}
        />
        <StatCard
          label="Open requests"
          value={
            deposits.filter((r) => ["waiting", "detected", "confirming"].includes(r.status)).length
          }
          loading={loading}
          hint="Awaiting on-chain settlement"
        />
        <StatCard
          label="Listener"
          value={
            <span className="flex items-center gap-2 text-base">
              <LiveDot online={heartbeat.online} />
              {heartbeat.online === false ? "Degraded" : heartbeat.online ? "Live" : "Idle"}
            </span>
          }
          hint={
            heartbeat.lastBlock ? `Block ${heartbeat.lastBlock.toLocaleString()}` : "No pass yet"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="panel p-5">
          <SectionHeader
            title="New deposit request"
            description="We assign the company wallet — you never paste a TXID."
          />
          <form className="mt-4 space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (USDT)</Label>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="mono"
                placeholder="25.00"
              />
              <p className="text-xs text-muted-foreground">
                Send the exact amount. Under-payments stay open, over-payments are credited at the
                received value.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={pending || Boolean(active)}>
              {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {active ? "Finish the open request first" : "Generate deposit address"}
            </Button>
          </form>

          <div className="mt-5 space-y-2 border-t pt-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Verification rules enforced on-chain</p>
            <ul className="space-y-1">
              <li>· Receiver must be the assigned company wallet</li>
              <li>
                · Token contract must be {chain.tokenSymbol} on {chain.label}
              </li>
              <li>· Transaction receipt must be SUCCESS</li>
              <li>· TXID must be unique (replay protected)</li>
              <li>· {active?.required_confirmations ?? 16} block confirmations required</li>
            </ul>
          </div>
        </div>

        <div className="panel p-5">
          {active ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Order {active.order_ref}
                  </p>
                  <p className="mono mt-1 text-2xl font-semibold">
                    {formatUsdt(active.expected_amount)} {chain.tokenSymbol}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Expires in <Countdown expiresAt={active.expires_at} /> · {chain.label}
                  </p>
                </div>
                <StatusBadge status={active.status} />
              </div>

              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="rounded-xl bg-white p-2">
                  {qr ? (
                    <img src={qr} alt="Deposit wallet QR code" className="h-36 w-36" />
                  ) : (
                    <div className="grid h-36 w-36 place-items-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    {wallet?.name ?? "Company wallet"}
                  </p>
                  <p className="mono text-sm break-all">{wallet?.address ?? "—"}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (!wallet?.address) return;
                        void navigator.clipboard.writeText(wallet.address);
                        toast.success("Address copied");
                      }}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy address
                    </Button>
                    {wallet?.address ? (
                      <Button size="sm" variant="ghost" asChild>
                        <a
                          href={chain.explorerAddress(wallet.address)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          Explorer
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Confirmations</span>
                  <span className="mono">
                    {active.confirmations} / {active.required_confirmations}
                  </span>
                </div>
                <Progress
                  value={Math.min(
                    100,
                    (active.confirmations / Math.max(1, active.required_confirmations)) * 100,
                  )}
                />
                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <p>
                    TXID:{" "}
                    {active.txid ? (
                      <a
                        className="mono text-primary hover:underline"
                        href={chain.explorerTx(active.txid)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortenHash(active.txid, 8)}
                      </a>
                    ) : (
                      <span className="mono">awaiting transfer</span>
                    )}
                  </p>
                  <p>
                    From: <span className="mono">{shortenHash(active.sender_address, 6)}</span>
                  </p>
                </div>
                {active.failure_reason ? (
                  <p className="text-xs text-destructive">{active.failure_reason}</p>
                ) : null}
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => void heartbeat.run()}
                disabled={heartbeat.running}
              >
                <RefreshCw
                  className={`mr-1.5 h-3.5 w-3.5 ${heartbeat.running ? "animate-spin" : ""}`}
                />
                Check the chain now
              </Button>
            </div>
          ) : (
            <div className="grid h-full min-h-56 place-items-center text-center">
              <div>
                <Wallet2 className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No open deposit request</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generate an address and the listener starts watching the wallet immediately.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b px-5 py-3">
          <SectionHeader title="Recent requests" description="Live from the blockchain listener." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Order</th>
                <th className="px-4 py-2.5 text-left font-medium">Expected</th>
                <th className="px-4 py-2.5 text-left font-medium">Received</th>
                <th className="px-4 py-2.5 text-left font-medium">Confirmations</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">TXID</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {deposits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    {loading ? "Loading…" : "No deposit requests yet."}
                  </td>
                </tr>
              ) : (
                deposits.map((row) => {
                  const rowChain = networkConfig(row.network);
                  return (
                    <tr key={row.id} className="hover:bg-secondary/30">
                      <td className="mono px-4 py-2.5">{row.order_ref}</td>
                      <td className="mono px-4 py-2.5">{formatUsdt(row.expected_amount)}</td>
                      <td className="mono px-4 py-2.5">
                        {row.received_amount === null ? "—" : formatUsdt(row.received_amount)}
                      </td>
                      <td className="mono px-4 py-2.5">
                        {row.confirmations}/{row.required_confirmations}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-2.5">
                        {row.txid ? (
                          <a
                            className="mono text-primary hover:underline"
                            href={rowChain.explorerTx(row.txid)}
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
    </div>
  );
}
