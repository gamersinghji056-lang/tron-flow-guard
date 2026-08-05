import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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
      { title: "Company wallets — TRONDESK admin" },
      {
        name: "description",
        content:
          "Manage the TRC20 company wallets the blockchain listener monitors for incoming USDT deposits.",
      },
      { property: "og:title", content: "Company wallets — TRONDESK admin" },
      {
        property: "og:description",
        content: "Add, activate and set the default receiving wallet per TRON network.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminWallets,
});

interface WalletRow {
  id: string;
  name: string;
  address: string;
  network: ChainNetwork;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

function AdminWallets() {
  const { isAdmin, loading } = useAuth();
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState<ChainNetwork>("trc20-nile");
  const [pending, setPending] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("wallets")
      .select("id, name, address, network, is_active, is_default, created_at")
      .order("created_at", { ascending: true });
    setWallets((data ?? []) as WalletRow[]);
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
      toast.error("Enter a valid TRON (base58) address");
      return;
    }
    setPending(true);
    const { error } = await supabase.from("wallets").insert({
      name: name.trim(),
      address: address.trim(),
      network,
      is_active: true,
      is_default: !wallets.some((w) => w.network === network && w.is_default),
    });
    setPending(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "That address already exists" : error.message);
      return;
    }
    setName("");
    setAddress("");
    toast.success("Wallet added — the listener will include it on the next pass");
    void load();
  }

  async function toggleActive(wallet: WalletRow, next: boolean) {
    const { error } = await supabase.from("wallets").update({ is_active: next }).eq("id", wallet.id);
    if (error) toast.error(error.message);
    else void load();
  }

  async function makeDefault(wallet: WalletRow) {
    await supabase
      .from("wallets")
      .update({ is_default: false })
      .eq("network", wallet.network)
      .neq("id", wallet.id);
    const { error } = await supabase
      .from("wallets")
      .update({ is_default: true, is_active: true })
      .eq("id", wallet.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`${wallet.name} is now the default receiving wallet`);
      void load();
    }
  }

  async function remove(wallet: WalletRow) {
    const { error } = await supabase.from("wallets").delete().eq("id", wallet.id);
    if (error) {
      toast.error("This wallet is referenced by deposits — deactivate it instead.");
      return;
    }
    toast.success("Wallet removed");
    void load();
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
    <div className="space-y-6">
      <div className="panel p-5">
        <SectionHeader
          title="Add a company wallet"
          description="Every active wallet on the selected network is polled for incoming USDT transfers."
        />
        <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.6fr_auto_auto]" onSubmit={addWallet}>
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
              placeholder="TXYZ…"
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
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              Add
            </Button>
          </div>
        </form>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Label</th>
              <th className="px-4 py-2.5 text-left font-medium">Address</th>
              <th className="px-4 py-2.5 text-left font-medium">Network</th>
              <th className="px-4 py-2.5 text-left font-medium">Active</th>
              <th className="px-4 py-2.5 text-left font-medium">Default</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {wallets.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
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
                          wallet.is_default ? "text-warning" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Star className={cn("h-3.5 w-3.5", wallet.is_default && "fill-current")} />
                        {wallet.is_default ? "Default" : "Set default"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="icon" onClick={() => void remove(wallet)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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
