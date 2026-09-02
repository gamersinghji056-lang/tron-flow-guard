import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Import,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  Wallet2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  createWallet,
  archiveWallet,
  importWallet,
  setDefaultWallet,
  setWalletTransactionPassword,
} from "@/lib/wallets.functions";
import { DEFAULT_NETWORK, formatUsdt, networkConfig, shortenHash } from "@/lib/chain";
import type { ChainNetwork } from "@/lib/chain";
import { selectActiveWallet, walletDisplayBalance } from "@/lib/wallet-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/wallet/")({
  head: () => ({
    meta: [{ title: "Wallet - WTRON" }],
  }),
  component: WalletsPage,
});

interface WalletRow {
  id: string;
  name: string;
  address: string;
  network: ChainNetwork;
  balance: number;
  onchain_balance?: number | null;
  is_default: boolean;
  created_at: string;
  wallet_type?: "standard" | "gasfree";
  custody?: string;
  backup_status?: string;
  gas_sponsorship_status?: string;
}

function WalletsPage() {
  const { user, profile } = useAuth();
  const create = useServerFn(createWallet);
  const archive = useServerFn(archiveWallet);
  const importExisting = useServerFn(importWallet);
  const makeDefault = useServerFn(setDefaultWallet);
  const setPassword = useServerFn(setWalletTransactionPassword);

  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [createdPhrase, setCreatedPhrase] = useState("");
  const [createdAddress, setCreatedAddress] = useState("");
  const [form, setForm] = useState({
    name: "Main Wallet",
    network: DEFAULT_NETWORK,
    walletType: "standard" as "standard" | "gasfree",
    transactionPassword: "",
    makeDefault: false,
  });
  const [importPhrase, setImportPhrase] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_wallets" as never)
      .select(
        "id, name, address, network, balance, onchain_balance, is_default, created_at, wallet_type, custody, backup_status, gas_sponsorship_status",
      )
      .eq("is_archived", false as never)
      .eq("network", DEFAULT_NETWORK as never)
      .order("selected_at", { ascending: false, nullsFirst: false })
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) toast.error("Unable to load wallet.");
    setWallets(
      ((data ?? []) as unknown as WalletRow[]).map((row) => ({
        ...row,
        balance: Number(row.balance ?? 0),
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
    const channel = supabase
      .channel(`wallet-list-${crypto.randomUUID()}`)
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
    () =>
      Number(profile?.balance ?? 0) +
      Number(profile?.locked_balance ?? 0) +
      Number((profile as { pending_balance?: number } | null)?.pending_balance ?? 0),
    [profile],
  );
  const activeWallet = selectActiveWallet(wallets);

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await setPassword({
        data: {
          password: newPassword,
          ...(currentPassword ? { currentPassword } : {}),
        },
      });
      toast.success("Transaction password updated");
      setPasswordOpen(false);
      setNewPassword("");
      setCurrentPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update password");
    } finally {
      setPending(false);
    }
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setCreatedPhrase("");
    try {
      const result = await create({
        data: {
          name: form.name.trim(),
          network: DEFAULT_NETWORK,
          walletType: "standard",
          makeDefault: form.makeDefault,
          transactionPassword: form.transactionPassword,
        },
      });
      const phrase = (result as { recoveryPhrase?: string }).recoveryPhrase ?? "";
      const address = (result as { wallet?: { address?: string } }).wallet?.address ?? "";
      setCreatedPhrase(phrase);
      setCreatedAddress(address);
      toast.success("Wallet created");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create wallet");
    } finally {
      setPending(false);
    }
  }

  async function submitImport(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await importExisting({
        data: {
          name: form.name.trim(),
          network: DEFAULT_NETWORK,
          walletType: "standard",
          makeDefault: form.makeDefault,
          transactionPassword: form.transactionPassword,
          mnemonic: importPhrase,
          networkConfirmed: true,
        },
      });
      const importResult = result as { existing?: boolean; message?: string };
      toast.success(
        importResult.existing
          ? (importResult.message ?? "This wallet is already in your WTRON account.")
          : "Wallet imported",
      );
      setImportOpen(false);
      setImportPhrase("");
      setForm((current) => ({ ...current, transactionPassword: "" }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import wallet");
    } finally {
      setPending(false);
    }
  }

  async function activate(wallet: WalletRow) {
    try {
      await makeDefault({ data: { walletId: wallet.id } });
      toast.success(`${wallet.name} is now active`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not switch wallet");
    }
  }

  async function removeWallet(wallet: WalletRow) {
    const confirmed = window.confirm(
      `Remove ${wallet.name}? The server will block removal if this wallet has USDT, TRX, or pending sends.`,
    );
    if (!confirmed) return;
    try {
      await archive({ data: { walletId: wallet.id } });
      toast.success("Wallet removed");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove wallet");
    }
  }

  return (
    <div className="space-y-6">
      <header className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Personal wallets are separate from platform deposit addresses. Platform deposits still
            use assigned company wallets and the existing blockchain listener.
          </p>
        </div>
        <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary">
              <KeyRound className="mr-1.5 h-4 w-4" />
              Transaction Password
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transaction password</DialogTitle>
              <DialogDescription>
                Required for sends, imports and recovery phrase reveal. It is never stored as
                plaintext.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-3" onSubmit={submitPassword}>
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current password, if already set"
              />
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New transaction password"
                required
              />
              <Button disabled={pending || newPassword.length < 6}>
                {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Save Password
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_.8fr]">
        <div className="panel p-5">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Total Assets</p>
          <p className="mono mt-1 text-4xl font-semibold">{formatUsdt(total)} USDT</p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Metric label="Available" value={`${formatUsdt(profile?.balance)} USDT`} />
            <Metric label="Locked" value={`${formatUsdt(profile?.locked_balance)} USDT`} />
            <Metric
              label="Pending"
              value={`${formatUsdt((profile as { pending_balance?: number } | null)?.pending_balance)} USDT`}
            />
          </div>
        </div>
        <div className="panel p-5">
          <p className="text-sm font-medium">Active wallet</p>
          <p className="mt-2 text-lg font-semibold">{activeWallet?.name ?? "No wallet selected"}</p>
          <p className="mono mt-1 text-xs text-muted-foreground">
            {activeWallet ? shortenHash(activeWallet.address, 10) : "Create or import a wallet"}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <ActionButton
              to={activeWallet ? `/wallet/${activeWallet.id}` : "/wallet"}
              label="Receive"
            />
            <ActionButton
              to={activeWallet ? `/wallet/${activeWallet.id}?tab=send` : "/wallet"}
              label="Send"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <WalletDialog
          mode="create"
          open={createOpen}
          setOpen={(next) => {
            setCreateOpen(next);
            if (!next) {
              setCreatedPhrase("");
              setCreatedAddress("");
            }
          }}
          form={form}
          setForm={setForm}
          pending={pending}
          createdPhrase={createdPhrase}
          createdAddress={createdAddress}
          onSubmit={submitCreate}
        />
        <WalletDialog
          mode="import"
          open={importOpen}
          setOpen={setImportOpen}
          form={form}
          setForm={setForm}
          pending={pending}
          importPhrase={importPhrase}
          setImportPhrase={setImportPhrase}
          onSubmit={submitImport}
        />
        <QuickLink
          to={activeWallet ? `/wallet/${activeWallet.id}?tab=send` : "/wallet"}
          icon={ArrowUpRight}
          label="Send"
        />
        <QuickLink
          to={activeWallet ? `/wallet/${activeWallet.id}` : "/wallet"}
          icon={ArrowDownLeft}
          label="Receive"
        />
        <QuickLink to="/deposits" icon={ShieldCheck} label="PLATFORM DEPOSIT" />
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">My Wallets</h2>
          <p className="text-sm text-muted-foreground">
            Select a wallet to control receive, send and wallet-specific activity.
          </p>
        </div>
        {loading ? (
          <div className="grid h-40 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : wallets.length === 0 ? (
          <div className="grid place-items-center gap-3 p-12 text-center">
            <Wallet2 className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No personal wallet yet</p>
            <p className="text-sm text-muted-foreground">
              Create a standard wallet or import an existing recovery phrase.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setCreateOpen(true)}>CREATE WALLET</Button>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                IMPORT WALLET
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {wallets.map((wallet) => {
              const config = networkConfig(wallet.network);
              const active = wallet.id === activeWallet?.id;
              const walletBalance = walletDisplayBalance(wallet);
              return (
                <button
                  key={wallet.id}
                  className="grid w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-secondary/40 md:grid-cols-[1.2fr_.7fr_.8fr_.8fr_auto]"
                  onClick={() => void activate(wallet)}
                >
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      {wallet.name}
                      {active ? <Star className="h-3.5 w-3.5 fill-primary text-primary" /> : null}
                    </p>
                    <p
                      className="mono mt-1 text-xs break-all text-muted-foreground"
                      title={wallet.address}
                    >
                      {shortenHash(wallet.address, 10)}
                    </p>
                  </div>
                  <Badge>{wallet.wallet_type === "gasfree" ? "GASFREE" : "STANDARD"}</Badge>
                  <div className="text-sm">
                    <p>{config.label}</p>
                    <p className="text-xs text-muted-foreground">{wallet.custody ?? "personal"}</p>
                  </div>
                  <div className="text-sm">
                    <p className="mono">{formatUsdt(walletBalance)} USDT</p>
                    <p className="text-xs text-muted-foreground">
                      Backup: {(wallet.backup_status ?? "not_backed_up").replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        void navigator.clipboard.writeText(wallet.address);
                        toast.success("Address copied");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button asChild size="sm" onClick={(event) => event.stopPropagation()}>
                      <Link to="/wallet/$walletId" params={{ walletId: wallet.id }}>
                        Open
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        void removeWallet(wallet);
                      }}
                      title="Remove wallet"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {wallet.wallet_type === "gasfree" ? (
                    <p className="md:col-span-5 text-xs text-warning">
                      Gas sponsorship: {wallet.gas_sponsorship_status ?? "unavailable"}. If
                      unavailable, sends require normal TRON resources/broadcast support.
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function WalletDialog({
  mode,
  open,
  setOpen,
  form,
  setForm,
  pending,
  createdPhrase,
  createdAddress,
  importPhrase,
  setImportPhrase,
  onSubmit,
}: {
  mode: "create" | "import";
  open: boolean;
  setOpen: (open: boolean) => void;
  form: {
    name: string;
    network: ChainNetwork;
    walletType: "standard" | "gasfree";
    transactionPassword: string;
    makeDefault: boolean;
  };
  setForm: React.Dispatch<
    React.SetStateAction<{
      name: string;
      network: ChainNetwork;
      walletType: "standard" | "gasfree";
      transactionPassword: string;
      makeDefault: boolean;
    }>
  >;
  pending: boolean;
  createdPhrase?: string;
  createdAddress?: string;
  importPhrase?: string;
  setImportPhrase?: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const isImport = mode === "import";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-12 justify-start" variant={isImport ? "secondary" : "default"}>
          {isImport ? <Import className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {isImport ? "IMPORT WALLET" : "CREATE NEW WALLET"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isImport ? "Import wallet" : "Create personal wallet"}</DialogTitle>
          <DialogDescription>
            Recovery phrases are encrypted with your transaction password. WTRON does not expose
            plaintext phrases in normal account or admin views.
          </DialogDescription>
        </DialogHeader>
        {createdPhrase ? (
          <div className="space-y-4">
            {createdAddress ? (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">Wallet address</p>
                <p className="mono mt-2 break-all text-sm">{createdAddress}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={() => {
                    void navigator.clipboard.writeText(createdAddress);
                    toast.success("Address copied");
                  }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
            ) : null}
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="text-sm font-medium">Back up this recovery phrase now</p>
              <p className="mt-2 select-all rounded-md bg-background p-3 font-mono text-sm">
                {createdPhrase}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Store it offline. Anyone with this phrase can control the personal wallet.
              </p>
            </div>
            <Button onClick={() => setOpen(false)}>I have backed it up</Button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={onSubmit}>
            <Field label="Wallet name">
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
            </Field>
            {isImport ? (
              <Field label="Recovery phrase">
                <Textarea
                  value={importPhrase}
                  onChange={(event) => setImportPhrase?.(event.target.value)}
                  rows={3}
                  required
                />
              </Field>
            ) : null}
            <Field label="Transaction password">
              <Input
                type="password"
                value={form.transactionPassword}
                onChange={(event) =>
                  setForm((current) => ({ ...current, transactionPassword: event.target.value }))
                }
                required
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.makeDefault}
                onChange={(event) =>
                  setForm((current) => ({ ...current, makeDefault: event.target.checked }))
                }
              />
              Make active wallet
            </label>
            <Button disabled={pending || form.transactionPassword.length < 6}>
              {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {isImport ? "Import Wallet" : "Create Wallet"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mono mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: typeof Wallet2; label: string }) {
  return (
    <Button asChild variant="secondary" className="h-12 justify-start">
      <Link to={to}>
        <Icon className="mr-2 h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}

function ActionButton({ to, label }: { to: string; label: string }) {
  return (
    <Button asChild size="sm" variant="secondary">
      <Link to={to}>{label}</Link>
    </Button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center rounded-md border px-2 py-1 text-xs text-muted-foreground">
      {children}
    </span>
  );
}
