import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownLeft, ArrowUpRight, Copy, Loader2, Plus, Star, Wallet2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createWallet, setDefaultWallet } from "@/lib/wallets.functions";
import { DEFAULT_NETWORK, formatUsdt, networkConfig, shortenHash } from "@/lib/chain";
import type { ChainNetwork } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/wallet/")({
  head: () => ({
    meta: [
      { title: "My wallets — TRONDESK" },
      {
        name: "description",
        content:
          "Create and manage unlimited personal USDT (TRC20) wallets, view balances and move funds between wallets.",
      },
      { property: "og:title", content: "My wallets — TRONDESK" },
      {
        property: "og:description",
        content: "Personal custodial USDT wallets with instant internal transfers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WalletsPage,
});

export interface WalletRow {
  id: string;
  name: string;
  address: string;
  network: ChainNetwork;
  balance: number;
  is_default: boolean;
  created_at: string;
}

function WalletsPage() {
  const { user } = useAuth();
  const create = useServerFn(createWallet);
  const makeDefault = useServerFn(setDefaultWallet);

  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [network, setNetwork] = useState<ChainNetwork>(DEFAULT_NETWORK);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("user_wallets")
      .select("id, name, address, network, balance, is_default, created_at")
      .eq("is_archived", false)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setWallets(
      (data ?? []).map((row) => ({ ...row, balance: Number(row.balance) })) as WalletRow[],
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
    const channel = supabase
      .channel("wallet-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_wallets" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  const total = useMemo(
    () => wallets.reduce((sum, wallet) => sum + wallet.balance, 0),
    [wallets],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const wallet = await create({ data: { name: name.trim(), network } });
      toast.success(`${wallet.name} created`, { description: wallet.address });
      setOpen(false);
      setName("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the wallet");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My wallets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every wallet has its own permanent TRC20 address. Internal transfers settle instantly.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="panel px-4 py-2">
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Total holdings
            </p>
            <p className="mono text-lg font-semibold text-primary">{formatUsdt(total)} USDT</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1.5 h-4 w-4" />
                New wallet
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a wallet</DialogTitle>
                <DialogDescription>
                  A fresh TRC20 receiving address is derived for this wallet immediately.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={submit}>
                <div className="space-y-1.5">
                  <Label htmlFor="wallet-name">Wallet name</Label>
                  <Input
                    id="wallet-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Trading float"
                    maxLength={48}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wallet-network">Network</Label>
                  <Select
                    value={network}
                    onValueChange={(value) => setNetwork(value as ChainNetwork)}
                  >
                    <SelectTrigger id="wallet-network">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trc20-nile">TRON Nile Testnet (TRC20)</SelectItem>
                      <SelectItem value="trc20-mainnet">TRON Mainnet (TRC20)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={pending || !name.trim()}>
                    {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                    Create wallet
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {loading ? (
        <div className="panel grid h-40 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : wallets.length === 0 ? (
        <div className="panel grid place-items-center gap-3 p-12 text-center">
          <Wallet2 className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            You have no wallets yet. Create one to start receiving USDT.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wallets.map((wallet) => {
            const config = networkConfig(wallet.network);
            return (
              <div key={wallet.id} className="panel flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 font-medium">
                      {wallet.name}
                      {wallet.is_default ? (
                        <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{config.shortLabel}</p>
                  </div>
                  <button
                    type="button"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Copy address"
                    onClick={() => {
                      void navigator.clipboard.writeText(wallet.address);
                      toast.success("Address copied");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>

                <p className="mono text-2xl font-semibold text-primary">
                  {formatUsdt(wallet.balance)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">USDT</span>
                </p>
                <p className="mono text-xs break-all text-muted-foreground">
                  {shortenHash(wallet.address, 10)}
                </p>

                <div className="mt-auto flex items-center gap-2">
                  <Button asChild size="sm" variant="secondary" className="flex-1">
                    <Link to="/wallet/$walletId" params={{ walletId: wallet.id }}>
                      <ArrowDownLeft className="mr-1 h-3.5 w-3.5" />
                      Receive
                    </Link>
                  </Button>
                  <Button asChild size="sm" className="flex-1">
                    <Link
                      to="/wallet/$walletId"
                      params={{ walletId: wallet.id }}
                      search={{ tab: "send" }}
                    >
                      <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
                      Send
                    </Link>
                  </Button>
                </div>

                {wallet.is_default ? null : (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                      try {
                        await makeDefault({ data: { walletId: wallet.id } });
                        toast.success("Default wallet updated");
                        await load();
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Could not update the wallet",
                        );
                      }
                    }}
                  >
                    Make default deposit wallet
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
