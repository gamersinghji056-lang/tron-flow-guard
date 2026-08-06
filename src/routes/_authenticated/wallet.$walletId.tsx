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
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { archiveWallet, quoteTransfer, renameWallet, sendTransfer } from "@/lib/wallets.functions";
import { formatUsdt, isTronAddress, networkConfig, shortenHash } from "@/lib/chain";
import type { ChainNetwork } from "@/lib/chain";
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
  head: () => ({
    meta: [
      { title: "Wallet detail — TRONDESK" },
      {
        name: "description",
        content:
          "Receive USDT with a QR code, send USDT to any TRC20 address and review the full movement history of this wallet.",
      },
      { property: "og:title", content: "Wallet detail — TRONDESK" },
      {
        property: "og:description",
        content: "Receive, send and audit USDT movements for a single personal wallet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WalletDetailPage,
});

interface WalletDetail {
  id: string;
  name: string;
  address: string;
  network: ChainNetwork;
  balance: number;
  is_default: boolean;
  created_at: string;
}

interface LedgerRow {
  id: string;
  direction: "in" | "out";
  kind: string;
  status: string;
  amount: number;
  fee: number;
  counterparty_address: string | null;
  memo: string | null;
  txid: string | null;
  failure_reason: string | null;
  created_at: string;
}

const statusTone: Record<string, string> = {
  completed: "text-success",
  pending: "text-warning",
  broadcasting: "text-info",
  failed: "text-destructive",
};

function WalletDetailPage() {
  const { walletId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();

  const send = useServerFn(sendTransfer);
  const rename = useServerFn(renameWallet);
  const archive = useServerFn(archiveWallet);
  const quote = useServerFn(quoteTransfer);

  const [wallet, setWallet] = useState<WalletDetail | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState<string | null>(null);
  const [fee, setFee] = useState(1.5);

  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [sending, setSending] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const load = useCallback(async () => {
    const [{ data: walletRow, error }, { data: txRows }] = await Promise.all([
      supabase
        .from("user_wallets")
        .select("id, name, address, network, balance, is_default, created_at")
        .eq("id", walletId)
        .maybeSingle(),
      supabase
        .from("wallet_transactions")
        .select(
          "id, direction, kind, status, amount, fee, counterparty_address, memo, txid, failure_reason, created_at",
        )
        .eq("wallet_id", walletId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (error) toast.error(error.message);
    if (walletRow) {
      const detail = { ...walletRow, balance: Number(walletRow.balance) } as WalletDetail;
      setWallet(detail);
      setNameDraft(detail.name);
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
  }, [walletId]);

  useEffect(() => {
    void load();
    void quote({}).then((result) => setFee(result.fee));
    const channel = supabase
      .channel(`wallet-detail-${walletId}`)
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
  }, [walletId, load, quote]);

  const config = networkConfig(wallet?.network);
  const parsedAmount = Number(amount);
  const total = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount + fee : 0;
  const canSend =
    isTronAddress(toAddress) &&
    parsedAmount > 0 &&
    !!wallet &&
    total <= wallet.balance &&
    !sending;

  async function submitSend(event: React.FormEvent) {
    event.preventDefault();
    if (!wallet) return;
    setSending(true);
    try {
      const result = await send({
        data: {
          walletId: wallet.id,
          toAddress: toAddress.trim(),
          amount: parsedAmount,
          ...(memo.trim() ? { memo: memo.trim() } : {}),
        },
      });
      if (result.broadcastError) {
        toast.error("On-chain broadcast failed", { description: result.broadcastError });
      } else if (result.internal) {
        toast.success("Transfer completed instantly", {
          description: `${formatUsdt(parsedAmount)} USDT sent · ${formatUsdt(result.fee)} USDT fee`,
        });
      } else {
        toast.success("Transfer queued", {
          description: result.txid
            ? `Broadcast as ${shortenHash(result.txid, 8)}`
            : "External payout is awaiting on-chain broadcast",
        });
      }
      setToAddress("");
      setAmount("");
      setMemo("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transfer failed");
    } finally {
      setSending(false);
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
        <p className="text-sm text-muted-foreground">This wallet could not be found.</p>
        <Button asChild variant="secondary">
          <Link to="/wallet">Back to my wallets</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
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
            {config.shortLabel} balance
          </p>
          <p className="mono text-2xl font-semibold text-primary">
            {formatUsdt(wallet.balance)} USDT
          </p>
        </div>
      </div>

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
                alt={`QR code for the ${wallet.name} deposit address`}
                className="h-44 w-44 rounded-lg bg-white p-2"
              />
            ) : (
              <div className="grid h-44 w-44 place-items-center rounded-lg border">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Your {config.shortLabel} address</p>
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
                    View on explorer
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Send only {config.tokenSymbol} on {config.label}. Incoming transfers are detected
                automatically by the blockchain listener and credited after{" "}
                {config.isTestnet ? "the required" : "16"} confirmations.
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="send" className="mt-4">
          <form className="panel max-w-xl space-y-4 p-6" onSubmit={submitSend}>
            <div className="space-y-1.5">
              <Label htmlFor="to-address">Recipient TRC20 address</Label>
              <Input
                id="to-address"
                value={toAddress}
                onChange={(event) => setToAddress(event.target.value)}
                placeholder="T…"
                className="mono"
                maxLength={40}
                required
              />
              {toAddress && !isTronAddress(toAddress) ? (
                <p className="text-xs text-destructive">That is not a valid TRON address.</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (USDT)</Label>
              <Input
                id="amount"
                type="number"
                min="0.000001"
                step="0.000001"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="100.00"
                className="mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="memo">Memo (optional)</Label>
              <Textarea
                id="memo"
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="Internal reference"
                maxLength={140}
                rows={2}
              />
            </div>

            <dl className="space-y-1 rounded-lg border border-border/70 p-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="mono">{formatUsdt(parsedAmount > 0 ? parsedAmount : 0)} USDT</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Network fee</dt>
                <dd className="mono">{formatUsdt(fee)} USDT</dd>
              </div>
              <div className="flex justify-between border-t border-border/70 pt-1 font-medium">
                <dt>Total debited</dt>
                <dd className="mono text-primary">{formatUsdt(total)} USDT</dd>
              </div>
            </dl>

            {parsedAmount > 0 && total > wallet.balance ? (
              <p className="text-xs text-destructive">
                Insufficient balance — you need {formatUsdt(total)} USDT including the fee.
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={!canSend}>
              {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Send USDT
            </Button>
            <p className="text-xs text-muted-foreground">
              Transfers to another TRONDESK wallet settle instantly. External addresses are signed
              and broadcast to {config.label} when the administrator enables on-chain payouts.
            </p>
          </form>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          {ledger.length === 0 ? (
            <div className="panel grid place-items-center p-12 text-center text-sm text-muted-foreground">
              No movements on this wallet yet.
            </div>
          ) : (
            <div className="panel divide-y divide-border/70">
              {ledger.map((row) => (
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
                      {row.kind === "fee" ? "Fee collected" : `${row.kind} ${row.direction === "in" ? "received" : "sent"}`}
                    </p>
                    <p className="mono truncate text-xs text-muted-foreground">
                      {row.counterparty_address
                        ? shortenHash(row.counterparty_address, 8)
                        : "—"}
                      {row.memo ? ` · ${row.memo}` : ""}
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
                      {row.direction === "in" ? "+" : "−"}
                      {formatUsdt(row.amount)} USDT
                    </p>
                    <p className={`text-[10px] capitalize ${statusTone[row.status] ?? ""}`}>
                      {row.status}
                      {row.fee > 0 ? ` · fee ${formatUsdt(row.fee)}` : ""}
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
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="rename">Wallet name</Label>
          <Input
            id="rename"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            maxLength={48}
          />
        </div>
        <Button
          variant="secondary"
          disabled={!nameDraft.trim() || nameDraft === wallet.name}
          onClick={async () => {
            try {
              await rename({ data: { walletId: wallet.id, name: nameDraft.trim() } });
              toast.success("Wallet renamed");
              await load();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Rename failed");
            }
          }}
        >
          Save name
        </Button>
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={async () => {
            try {
              await archive({ data: { walletId: wallet.id } });
              toast.success("Wallet archived");
              navigate({ to: "/wallet" });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not archive the wallet");
            }
          }}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Archive
        </Button>
      </div>
    </div>
  );
}
