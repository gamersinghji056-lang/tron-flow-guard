import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Power, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  addCompanyWallet,
  makeCompanyWalletDefault,
  removeCompanyWalletPurpose,
  setCompanyWalletActive,
  updateCompanyWallet,
} from "@/lib/admin.functions";
import { isTronAddress, NETWORKS, networkConfig, type ChainNetwork } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader } from "@/components/stat-card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/wallets")({
  head: () => ({
    meta: [
      { title: "Company wallets - WTRON admin" },
      {
        name: "description",
        content:
          "Manage the TRC20 company wallets the blockchain listener monitors for incoming USDT deposits.",
      },
    ],
  }),
  component: AdminWallets,
});

interface WalletRow {
  id: string;
  name: string;
  address: string;
  network: ChainNetwork;
  purpose?: string | null;
  priority?: number | null;
  min_deposit?: number | string | null;
  max_deposit?: number | string | null;
  onchain_usdt_balance?: number | string | null;
  onchain_trx_balance?: number | string | null;
  onchain_checked_at?: string | null;
  last_listener_scan_at?: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

interface WalletDetailRow {
  id: string;
  wallet_id?: string | null;
  txid?: string | null;
  status?: string | null;
  amount?: number | string | null;
  expected_amount?: number | string | null;
  received_amount?: number | string | null;
  user_id?: string | null;
  created_at?: string | null;
}

interface PurposeAssignmentRow {
  wallet_id: string;
  purpose: string;
  is_active?: boolean | null;
}

function AdminWallets() {
  const { isAdmin, loading } = useAuth();
  const addCompanyWalletFn = useServerFn(addCompanyWallet);
  const updateCompanyWalletFn = useServerFn(updateCompanyWallet);
  const removeCompanyWalletPurposeFn = useServerFn(removeCompanyWalletPurpose);
  const setCompanyWalletActiveFn = useServerFn(setCompanyWalletActive);
  const makeCompanyWalletDefaultFn = useServerFn(makeCompanyWalletDefault);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [purposeAssignments, setPurposeAssignments] = useState<Record<string, string[]>>({});
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState<ChainNetwork>("trc20-nile");
  const [walletId, setWalletId] = useState("");
  const [purpose, setPurpose] = useState("USER_DEPOSIT");
  const [priority, setPriority] = useState("100");
  const [minDeposit, setMinDeposit] = useState("");
  const [maxDeposit, setMaxDeposit] = useState("");
  const [detailWallet, setDetailWallet] = useState<WalletRow | null>(null);
  const [depositRows, setDepositRows] = useState<WalletDetailRow[]>([]);
  const [eventRows, setEventRows] = useState<WalletDetailRow[]>([]);
  const [directSellRows, setDirectSellRows] = useState<WalletDetailRow[]>([]);
  const [pending, setPending] = useState(false);

  async function load() {
    const [{ data }, assignments] = await Promise.all([
      supabase
        .from("wallets")
        .select(
          "id, name, address, network, purpose, priority, min_deposit, max_deposit, onchain_usdt_balance, onchain_trx_balance, onchain_checked_at, last_listener_scan_at, is_active, is_default, created_at",
        )
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("wallet_purpose_assignments" as never)
        .select("wallet_id, purpose, is_active")
        .eq("is_active", true as never),
    ]);
    setWallets((data ?? []) as unknown as WalletRow[]);
    const nextAssignments: Record<string, string[]> = {};
    for (const wallet of (data ?? []) as WalletRow[]) {
      nextAssignments[wallet.id] = wallet.purpose ? [wallet.purpose] : ["USER_DEPOSIT"];
    }
    for (const assignment of (assignments.data ?? []) as unknown as PurposeAssignmentRow[]) {
      if (!assignment.wallet_id || !assignment.purpose || assignment.is_active === false) continue;
      nextAssignments[assignment.wallet_id] = Array.from(
        new Set([...(nextAssignments[assignment.wallet_id] ?? []), assignment.purpose]),
      );
    }
    setPurposeAssignments(nextAssignments);
  }

  async function loadDetail(wallet: WalletRow) {
    setDetailWallet(wallet);
    const [deposits, events, directSell] = await Promise.all([
      supabase
        .from("deposit_requests")
        .select("id, wallet_id, status, expected_amount, received_amount, user_id, created_at")
        .eq("wallet_id", wallet.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("blockchain_events")
        .select("id, wallet_address, txid, amount, created_at")
        .eq("wallet_address", wallet.address)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("direct_sell_orders" as never)
        .select("id, wallet_id, order_ref, status, usdt_amount, expected_inr, user_id, created_at")
        .eq("wallet_id", wallet.id as never)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setDepositRows((deposits.data ?? []) as WalletDetailRow[]);
    setEventRows((events.data ?? []) as unknown as WalletDetailRow[]);
    setDirectSellRows((directSell.data ?? []) as unknown as WalletDetailRow[]);
  }

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin]);

  async function addWallet(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Give the wallet a name");
      return;
    }
    if (!isTronAddress(address)) {
      toast.error("Enter a valid TRON address");
      return;
    }

    setPending(true);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim(),
        network,
        purpose: purpose as "USER_DEPOSIT" | "DIRECT_SELL" | "FEE_COLLECTION" | "HOT" | "OTHER",
        priority: Number(priority),
        minDeposit: minDeposit ? Number(minDeposit) : null,
        maxDeposit: maxDeposit ? Number(maxDeposit) : null,
      };
      if (walletId) {
        await updateCompanyWalletFn({ data: { id: walletId, ...payload } });
        toast.success("Wallet updated");
      } else {
        await addCompanyWalletFn({ data: payload });
        toast.success("Wallet added. The listener will include it on the next pass.");
      }
      resetForm();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add company wallet");
    } finally {
      setPending(false);
    }
  }

  function editWallet(wallet: WalletRow) {
    setWalletId(wallet.id);
    setName(wallet.name);
    setAddress(wallet.address);
    setNetwork(wallet.network);
    setPurpose(wallet.purpose ?? "USER_DEPOSIT");
    setPriority(String(wallet.priority ?? 100));
    setMinDeposit(wallet.min_deposit == null ? "" : String(wallet.min_deposit));
    setMaxDeposit(wallet.max_deposit == null ? "" : String(wallet.max_deposit));
  }

  function resetForm() {
    setWalletId("");
    setName("");
    setAddress("");
    setPurpose("USER_DEPOSIT");
    setPriority("100");
    setMinDeposit("");
    setMaxDeposit("");
  }

  async function toggleActive(wallet: WalletRow, next: boolean) {
    try {
      await setCompanyWalletActiveFn({ data: { walletId: wallet.id, isActive: next } });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update wallet status");
    }
  }

  async function makeDefault(wallet: WalletRow) {
    try {
      await makeCompanyWalletDefaultFn({ data: { walletId: wallet.id, network: wallet.network } });
      toast.success(`${wallet.name} is now the default receiving wallet`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not set default wallet");
    }
  }

  async function deactivate(wallet: WalletRow) {
    await toggleActive(wallet, false);
  }

  async function removePurpose(wallet: WalletRow, item: string) {
    const activePurposes = purposeAssignments[wallet.id] ?? [wallet.purpose ?? "USER_DEPOSIT"];
    if (activePurposes.length <= 1) {
      toast.error("Assign another purpose before removing the last purpose");
      return;
    }
    const confirmed = window.confirm(`Remove ${item.replaceAll("_", " ")} from ${wallet.name}?`);
    if (!confirmed) return;
    try {
      await removeCompanyWalletPurposeFn({
        data: {
          walletId: wallet.id,
          purpose: item as "USER_DEPOSIT" | "DIRECT_SELL" | "FEE_COLLECTION" | "HOT" | "OTHER",
        },
      });
      toast.success("Purpose removed");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove purpose");
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;
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
    <div className="space-y-6">
      <div className="panel p-5">
        <SectionHeader
          title="Add a company wallet"
          description="Public TRON receiving addresses monitored by the existing blockchain listener."
        />
        <form className="mt-4 grid gap-3 lg:grid-cols-4" onSubmit={addWallet}>
          <div className="space-y-1.5">
            <Label htmlFor="wallet-name">Label</Label>
            <Input
              id="wallet-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Treasury 01"
              maxLength={60}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wallet-address">TRON address</Label>
            <Input
              id="wallet-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="TXYZ..."
              className="mono"
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Network</Label>
            <Select value={network} onValueChange={(value) => setNetwork(value as ChainNetwork)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(NETWORKS).map((config) => (
                  <SelectItem key={config.id} value={config.id}>
                    {config.shortLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Purpose</Label>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["USER_DEPOSIT", "DIRECT_SELL", "FEE_COLLECTION", "HOT", "OTHER"].map((item) => (
                  <SelectItem key={item} value={item}>
                    {item.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Input value={priority} onChange={(event) => setPriority(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Min deposit</Label>
            <Input value={minDeposit} onChange={(event) => setMinDeposit(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Max deposit</Label>
            <Input value={maxDeposit} onChange={(event) => setMaxDeposit(event.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              {walletId ? "Update" : "Add"}
            </Button>
          </div>
          {walletId ? (
            <div className="flex items-end">
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          ) : null}
        </form>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Label</th>
              <th className="px-4 py-2.5 text-left font-medium">Address</th>
              <th className="px-4 py-2.5 text-left font-medium">Network</th>
              <th className="px-4 py-2.5 text-left font-medium">Purpose</th>
              <th className="px-4 py-2.5 text-left font-medium">Balance</th>
              <th className="px-4 py-2.5 text-left font-medium">Listener</th>
              <th className="px-4 py-2.5 text-left font-medium">Active</th>
              <th className="px-4 py-2.5 text-left font-medium">Default</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {wallets.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No wallets configured yet.
                </td>
              </tr>
            ) : (
              wallets.map((wallet) => {
                const chain = networkConfig(wallet.network);
                return (
                  <tr key={wallet.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-2.5 font-medium">{wallet.name}</td>
                    <td className="px-4 py-2.5">
                      <a
                        className="mono text-primary hover:underline"
                        href={chain.explorerAddress(wallet.address)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {wallet.address}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{chain.shortLabel}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="flex flex-wrap gap-1.5">
                        {(purposeAssignments[wallet.id] ?? [wallet.purpose ?? "USER_DEPOSIT"]).map(
                          (item) => (
                            <span
                              key={item}
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-1"
                            >
                              {item.replaceAll("_", " ")}
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => void removePurpose(wallet, item)}
                                title={`Remove ${item.replaceAll("_", " ")}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </span>
                          ),
                        )}
                      </div>
                    </td>
                    <td className="mono px-4 py-2.5 text-xs">
                      {Number(wallet.onchain_usdt_balance ?? 0).toLocaleString()} USDT
                      <br />
                      {Number(wallet.onchain_trx_balance ?? 0).toLocaleString()} TRX
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {wallet.last_listener_scan_at
                        ? new Date(wallet.last_listener_scan_at).toLocaleString()
                        : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Switch
                        checked={wallet.is_active}
                        onCheckedChange={(next) => void toggleActive(wallet, next)}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => void makeDefault(wallet)}
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs",
                          wallet.is_default
                            ? "text-warning"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Star className={cn("h-3.5 w-3.5", wallet.is_default && "fill-current")} />
                        {wallet.is_default ? "Default" : "Set default"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="sm" onClick={() => editWallet(wallet)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void loadDetail(wallet)}>
                        Detail
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void deactivate(wallet)}
                        disabled={!wallet.is_active}
                        title="Deactivate wallet"
                      >
                        <Power className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {detailWallet ? (
        <div className="panel p-5">
          <SectionHeader
            title={`${detailWallet.name} wallet detail`}
            description="Recent deposit requests, chain transactions and direct-sell orders for this public address."
          />
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <DetailList title="Deposit Requests" rows={depositRows} />
            <DetailList title="Blockchain Events" rows={eventRows} />
            <DetailList title="Direct Sell Orders" rows={directSellRows} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailList({ title, rows }: { title: string; rows: WalletDetailRow[] }) {
  return (
    <div className="rounded-lg border p-3">
      <h3 className="font-medium">{title}</h3>
      <div className="mt-3 max-h-96 space-y-2 overflow-auto">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.id} className="rounded-md bg-secondary/40 p-2 text-xs">
              <p className="mono">{row.txid ?? row.id}</p>
              <p>Status: {row.status ?? "-"}</p>
              <p>
                Amount: {String(row.amount ?? row.received_amount ?? row.expected_amount ?? "-")}
              </p>
              <p>{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No records.</p>
        )}
      </div>
    </div>
  );
}
