import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { refreshWalletBalance, revealRecoveryPhrase, sendTransfer } from "@/lib/wallets.functions";
import { formatUsdt, isTronAddress, networkConfig, shortenHash } from "@/lib/chain";
import type { ChainNetwork } from "@/lib/chain";
import { onChainSendEnabled, walletDisplayBalance } from "@/lib/wallet-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const searchSchema = z.object({
  tab: z.enum(["receive", "send", "activity"]).optional(),
});

export const Route = createFileRoute("/_authenticated/wallet/$walletId")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({ meta: [{ title: "Wallet detail - WTRON" }] }),
  component: WalletDetailPage,
});

interface WalletDetail {
  id: string;
  name: string;
  address: string;
  network: ChainNetwork;
  balance: number;
  onchain_balance?: number | null;
  onchain_trx_balance?: number | null;
  onchain_checked_at?: string | null;
  is_default: boolean;
  wallet_type?: "standard" | "gasfree";
  custody?: string;
  backup_status?: string;
  gas_sponsorship_status?: string;
}

interface LedgerRow {
  id: string;
  direction: "in" | "out";
  kind: string;
  status: string;
  amount: number;
  fee: number;
  currency?: string | null;
  counterparty_address: string | null;
  memo: string | null;
  txid: string | null;
  failure_reason: string | null;
  created_at: string;
}

function WalletDetailPage() {
  const { walletId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const send = useServerFn(sendTransfer);
  const reveal = useServerFn(revealRecoveryPhrase);
  const refreshBalance = useServerFn(refreshWalletBalance);

  const [wallet, setWallet] = useState<WalletDetail | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState<string | null>(null);
  const [asset, setAsset] = useState<"USDT" | "TRX">("USDT");
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [transactionPassword, setTransactionPassword] = useState("");
  const [revealPassword, setRevealPassword] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [activityPage, setActivityPage] = useState(0);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: walletRow, error }, { data: txRows }] = await Promise.all([
      supabase
        .from("user_wallets" as never)
        .select(
          "id, name, address, network, balance, onchain_balance, onchain_trx_balance, onchain_checked_at, is_default, wallet_type, custody, backup_status, gas_sponsorship_status",
        )
        .eq("id", walletId as never)
        .maybeSingle(),
      supabase
        .from("wallet_transactions")
        .select(
          "id, direction, kind, status, amount, fee, currency, counterparty_address, memo, txid, failure_reason, created_at",
        )
        .eq("wallet_id", walletId)
        .order("created_at", { ascending: false })
        .range(activityPage * pageSize, activityPage * pageSize + pageSize),
    ]);

    if (error) toast.error("Unable to load wallet.");
    if (walletRow) {
      const detail = {
        ...(walletRow as unknown as WalletDetail),
        balance: Number((walletRow as unknown as WalletDetail).balance ?? 0),
        onchain_balance: Number((walletRow as unknown as WalletDetail).onchain_balance ?? 0),
        onchain_trx_balance: Number(
          (walletRow as unknown as WalletDetail).onchain_trx_balance ?? 0,
        ),
      };
      setWallet(detail);
      QRCode.toDataURL(detail.address, { width: 320, margin: 1 })
        .then(setQr)
        .catch(() => setQr(null));
    }
    setLedger(
      (txRows ?? []).map((row) => ({
        ...row,
        amount: Number(row.amount),
        fee: Number(row.fee),
      })) as LedgerRow[],
    );
    setLoading(false);
  }, [activityPage, walletId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`wallet-detail-${walletId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallet_transactions" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_wallets" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [walletId, load]);

  const config = networkConfig(wallet?.network);
  const parsedAmount = Number(amount);
  const estimatedNetworkTrx = asset === "USDT" ? 30 : 0.1;
  const total = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;
  const sendEnabled = onChainSendEnabled(wallet);
  const displayBalance =
    asset === "USDT" ? walletDisplayBalance(wallet) : Number(wallet?.onchain_trx_balance ?? 0);
  const visibleLedger = ledger.slice(0, pageSize);
  const hasNextActivityPage = ledger.length > pageSize;
  const canSend =
    sendEnabled &&
    isTronAddress(toAddress) &&
    parsedAmount > 0 &&
    Boolean(transactionPassword) &&
    !!wallet &&
    total <= displayBalance &&
    !sending;

  async function submitSend(event: React.FormEvent) {
    event.preventDefault();
    if (!wallet) return;
    setSending(true);
    try {
      const result = await send({
        data: {
          walletId: wallet.id,
          asset,
          toAddress: toAddress.trim(),
          amount: parsedAmount,
          transactionPassword,
          idempotencyKey: crypto.randomUUID(),
          ...(memo.trim() ? { memo: memo.trim() } : {}),
        },
      });
      const sendResult = result as unknown as {
        txid?: string | null;
        status?: string | null;
        safe_failure_message?: string | null;
      };
      const txid = sendResult.txid;
      const status = sendResult.status;
      const failure = sendResult.safe_failure_message;
      if (failure) {
        toast.error("On-chain send failed", { description: failure });
      } else {
        toast.success("Transfer broadcast", {
          description: txid
            ? `${status ?? "BROADCAST"} - ${shortenHash(txid, 8)}`
            : (status ?? "Request accepted"),
        });
      }
      setToAddress("");
      setAmount("");
      setMemo("");
      setTransactionPassword("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transfer failed");
    } finally {
      setSending(false);
    }
  }

  async function revealPhrase(event: React.FormEvent) {
    event.preventDefault();
    setRecoveryPhrase("");
    try {
      const result = await reveal({ data: { walletId, transactionPassword: revealPassword } });
      setRecoveryPhrase(result.recoveryPhrase);
      setRevealPassword("");
      toast.success("Recovery phrase unlocked");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reveal recovery phrase");
    }
  }

  async function refreshOnChainBalance() {
    if (!wallet) return;
    setRefreshingBalance(true);
    try {
      await refreshBalance({ data: { walletId: wallet.id } });
      toast.success("On-chain balance refreshed");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh balance");
    } finally {
      setRefreshingBalance(false);
    }
  }

  if (loading) {
    return (
      <div className="panel grid h-56 place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="panel grid place-items-center gap-3 p-12 text-center">
        <p className="text-sm text-muted-foreground">Unable to load wallet.</p>
        <Button asChild variant="secondary">
          <Link to="/wallet">Back to my wallets</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/wallet"
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            My wallets
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{wallet.name}</h1>
          <p className="mono mt-1 text-xs break-all text-muted-foreground">{wallet.address}</p>
        </div>
        <div className="panel px-4 py-2">
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
            {wallet.wallet_type === "gasfree" ? "GasFree" : "Standard"} {config.shortLabel}
          </p>
          <p className="mono text-2xl font-semibold text-primary">
            {formatUsdt(displayBalance)} USDT
          </p>
          <p className="mono text-xs text-muted-foreground">
            {formatUsdt(wallet.onchain_trx_balance ?? 0)} TRX
          </p>
          {wallet.custody === "non_custodial" ? (
            <button
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void refreshOnChainBalance()}
              disabled={refreshingBalance}
            >
              <RefreshCw className={`h-3 w-3 ${refreshingBalance ? "animate-spin" : ""}`} />
              Refresh chain balance
            </button>
          ) : null}
        </div>
      </header>

      <Tabs
        value={tab ?? "receive"}
        onValueChange={(value) =>
          navigate({
            to: "/wallet/$walletId",
            params: { walletId },
            search: { tab: value as "receive" | "send" | "activity" },
            replace: true,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="receive">Receive</TabsTrigger>
          <TabsTrigger value="send">Send</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="receive" className="mt-4">
          <div className="panel grid gap-6 p-6 md:grid-cols-[auto_1fr]">
            {qr ? (
              <img
                src={qr}
                alt={`QR code for ${wallet.name}`}
                className="h-44 w-44 rounded-lg bg-white p-2"
              />
            ) : (
              <div className="grid h-44 w-44 place-items-center rounded-lg border">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">PERSONAL WALLET RECEIVE</p>
                <p className="mono mt-1 text-sm break-all">{wallet.address}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(wallet.address);
                    toast.success("Address copied");
                  }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy address
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <a
                    href={config.explorerAddress(wallet.address)}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Explorer
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This is not your PLATFORM DEPOSIT address. Platform deposits use assigned company
                wallets, deposit requests, and the existing blockchain listener.
              </p>
              {wallet.wallet_type === "gasfree" ? (
                <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                  Gas sponsorship is {wallet.gas_sponsorship_status ?? "unavailable"}. If
                  unavailable, sends require normal TRON resources or enabled broadcast support.
                </p>
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="send" className="mt-4">
          <form className="panel max-w-xl space-y-4 p-6" onSubmit={submitSend}>
            <Field label="Recipient TRC20 address">
              <Input
                value={toAddress}
                onChange={(event) => setToAddress(event.target.value)}
                placeholder="T..."
                className="mono"
                maxLength={40}
                required
              />
            </Field>
            {toAddress && !isTronAddress(toAddress) ? (
              <p className="text-xs text-destructive">That is not a valid TRON address.</p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={asset === "USDT" ? "default" : "secondary"}
                onClick={() => setAsset("USDT")}
              >
                USDT
              </Button>
              <Button
                type="button"
                variant={asset === "TRX" ? "default" : "secondary"}
                onClick={() => setAsset("TRX")}
              >
                TRX
              </Button>
            </div>
            <Field label={`Amount (${asset})`}>
              <Input
                type="number"
                min="0.000001"
                step="0.000001"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={asset === "USDT" ? "100.00" : "10.00"}
                className="mono"
                required
              />
            </Field>
            <Field label="Memo (optional)">
              <Textarea
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                maxLength={140}
                rows={2}
              />
            </Field>
            <dl className="space-y-1 rounded-lg border border-border/70 p-3 text-sm">
              <Row
                label="Amount"
                value={`${formatUsdt(parsedAmount > 0 ? parsedAmount : 0)} ${asset}`}
              />
              <Row
                label="Platform fee"
                value={`${formatUsdt(asset === "USDT" ? 0 : 0)} ${asset}`}
              />
              <Row
                label="Estimated network requirement"
                value={`${formatUsdt(estimatedNetworkTrx)} TRX`}
              />
              <Row label="Total debit" value={`${formatUsdt(total)} ${asset}`} strong />
            </dl>
            <Field label="Transaction password">
              <Input
                type="password"
                value={transactionPassword}
                onChange={(event) => setTransactionPassword(event.target.value)}
                placeholder="Required"
                required
              />
            </Field>
            {!sendEnabled ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                On-chain sending is not enabled yet. This wallet uses an encrypted recovery phrase,
                but the server-side signer kill switch or environment flag is disabled.
              </p>
            ) : null}
            {parsedAmount > 0 && total > displayBalance ? (
              <p className="text-xs text-destructive">
                Insufficient balance. You need {formatUsdt(total)} {asset}.
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={!canSend}>
              {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Send {asset}
            </Button>
            <p className="text-xs text-muted-foreground">
              The server refreshes chain balances, verifies your transaction password, signs
              server-side, then waits for blockchain confirmation. Mainnet signing is disabled
              unless explicitly enabled by server-only configuration.
            </p>
          </form>
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-4">
          <form className="panel max-w-xl space-y-3 p-5" onSubmit={revealPhrase}>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-warning" />
              <div>
                <p className="text-sm font-medium">Backup recovery phrase</p>
                <p className="text-xs text-muted-foreground">
                  Requires transaction password. Never share the phrase, private key, seed or OTP.
                </p>
              </div>
            </div>
            <Input
              type="password"
              value={revealPassword}
              onChange={(event) => setRevealPassword(event.target.value)}
              placeholder="Transaction password"
            />
            <Button variant="secondary" disabled={!revealPassword}>
              Reveal phrase
            </Button>
            {recoveryPhrase ? (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
                <p className="select-all font-mono text-sm">{recoveryPhrase}</p>
              </div>
            ) : null}
          </form>

          {ledger.length === 0 ? (
            <div className="panel grid place-items-center p-12 text-center text-sm text-muted-foreground">
              No wallet activity yet.
            </div>
          ) : (
            <div className="panel divide-y divide-border/70">
              {visibleLedger.map((row) => (
                <div key={row.id} className="flex items-center gap-3 p-4">
                  <span
                    className={
                      row.direction === "in"
                        ? "grid h-8 w-8 place-items-center rounded-full bg-success/10 text-success"
                        : "grid h-8 w-8 place-items-center rounded-full bg-destructive/10 text-destructive"
                    }
                  >
                    {row.direction === "in" ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize">
                      {row.kind.replaceAll("_", " ")}
                    </p>
                    <p className="mono truncate text-xs text-muted-foreground">
                      {row.counterparty_address
                        ? shortenHash(row.counterparty_address, 8)
                        : "No counterparty"}
                      {row.memo ? ` - ${row.memo}` : ""}
                    </p>
                    {row.failure_reason ? (
                      <p className="text-xs text-warning">{row.failure_reason}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p
                      className={
                        row.direction === "in"
                          ? "mono text-sm font-semibold text-success"
                          : "mono text-sm font-semibold"
                      }
                    >
                      {row.direction === "in" ? "+" : "-"}
                      {formatUsdt(row.amount)} {row.currency ?? "USDT"}
                    </p>
                    <p className="text-[10px] capitalize text-muted-foreground">
                      {row.status}
                      {row.fee > 0 ? ` - fee ${formatUsdt(row.fee)}` : ""}
                    </p>
                    {row.txid ? (
                      <a
                        className="mono text-[10px] text-primary hover:underline"
                        href={config.explorerTx(row.txid)}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {shortenHash(row.txid, 5)}
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={activityPage === 0}
                  onClick={() => setActivityPage((page) => Math.max(0, page - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">Page {activityPage + 1}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!hasNextActivityPage}
                  onClick={() => setActivityPage((page) => page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between ${strong ? "border-t border-border/70 pt-1 font-medium" : ""}`}
    >
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className={strong ? "mono text-primary" : "mono"}>{value}</dd>
    </div>
  );
}
