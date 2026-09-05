import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BadgeIndianRupee, Loader2, Plus, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createDirectSellOrder } from "@/lib/direct-sell.functions";
import {
  acknowledgeP2pRisk,
  createP2pAvatarUpload,
  createP2pAd,
  createP2pOrderFromAd,
  fetchP2pMarketplace,
  getP2pAvatarViewUrl,
  getP2pParticipantProfile,
  getP2pRiskAcknowledgement,
  registerP2pAvatar,
} from "@/lib/p2p.functions";
import { DEFAULT_NETWORK, formatUsdt } from "@/lib/chain";
import type { ChainNetwork } from "@/lib/chain";
import { walletDisplayBalance } from "@/lib/wallet-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/p2p")({
  head: () => ({ meta: [{ title: "P2P marketplace - WTRON" }] }),
  component: P2pPage,
});

interface AdRow {
  id: string;
  side: "buy" | "sell";
  asset: string;
  fiat: string;
  price_inr: number;
  available_usdt: number;
  min_order_inr: number;
  max_order_inr: number;
  payment_methods: string[];
  terms: string | null;
  merchants?: {
    user_id?: string | null;
    display_name: string;
    completed_orders: number;
    total_orders: number;
    status: string;
  } | null;
}

interface P2pProfile {
  userId: string;
  displayName: string;
  avatarPath?: string | null;
  accountType: "Trader" | "Vendor" | string;
  joinedAt?: string | null;
  joinedDays?: number;
  completedTrades?: number;
  successfulTrades?: number;
  completionRate?: number;
  totalUsdtTraded?: number;
  volume30d?: number;
  openDisputes?: number;
  resolvedDisputes?: number;
  reportsReceived?: number;
  rankingTier?: string;
  rankingScore?: number;
}

type RawAdRow = Omit<AdRow, "price_inr" | "available_usdt" | "min_order_inr" | "max_order_inr"> & {
  price_inr: unknown;
  available_usdt: unknown;
  min_order_inr: unknown;
  max_order_inr: unknown;
};

interface PersonalWalletRow {
  id: string;
  name: string | null;
  address: string;
  network: ChainNetwork;
  balance: number | string | null;
  onchain_balance?: number | string | null;
  wallet_type?: string | null;
  wallet_role?: string | null;
}

interface P2pFilters {
  bestRate: boolean;
  verified: boolean;
  upi: boolean;
  highCompletion: boolean;
}

const avatarMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const maxAvatarBytes = 2 * 1024 * 1024;

function friendlyP2pError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  const lower = message.toLowerCase();
  if (lower.includes("sizebytes") || lower.includes("too_big") || lower.includes("2 mb")) {
    return "Choose an image up to 2 MB.";
  }
  if (lower.includes("contenttype") || lower.includes("invalid_enum")) {
    return "Choose a JPG, PNG, WebP or GIF image.";
  }
  if (message.trim().startsWith("[") || lower.includes("invalid_type")) return fallback;
  return message || fallback;
}

function completionRate(ad: AdRow, profile?: P2pProfile | null) {
  if (typeof profile?.completionRate === "number") return profile.completionRate;
  const total = Number(ad.merchants?.total_orders ?? 0);
  const completed = Number(ad.merchants?.completed_orders ?? 0);
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

function isVerifiedAd(ad: AdRow, profile?: P2pProfile | null) {
  const merchantStatus = String(ad.merchants?.status ?? "").toLowerCase();
  const tier = String(profile?.rankingTier ?? "").toLowerCase();
  return ["active", "verified", "approved"].includes(merchantStatus) || tier.includes("verified");
}

function sortedAndFilteredAds(
  ads: AdRow[],
  side: "buy" | "sell",
  amount: string,
  filters: P2pFilters,
  profiles: Record<string, P2pProfile>,
) {
  const value = Number(amount);
  const marketplaceAdSide = side === "buy" ? "sell" : "buy";
  const filtered = ads
    .filter((row) => row.side === marketplaceAdSide)
    .filter((row) => {
      if (
        filters.upi &&
        !(row.payment_methods ?? []).some((method) => method.toLowerCase() === "upi")
      ) {
        return false;
      }
      const profile = row.merchants?.user_id ? profiles[row.merchants.user_id] : null;
      if (filters.verified && !isVerifiedAd(row, profile)) return false;
      if (filters.highCompletion && completionRate(row, profile) < 95) return false;
      if (!Number.isFinite(value) || value <= 0) return true;
      const total = value * row.price_inr;
      return (
        value <= row.available_usdt && total >= row.min_order_inr && total <= row.max_order_inr
      );
    });
  if (!filters.bestRate) return filtered;
  return [...filtered].sort((a, b) =>
    side === "buy" ? a.price_inr - b.price_inr : b.price_inr - a.price_inr,
  );
}

function P2pPage() {
  const createDirectSell = useServerFn(createDirectSellOrder);
  const createAd = useServerFn(createP2pAd);
  const createOrder = useServerFn(createP2pOrderFromAd);
  const loadMarketplace = useServerFn(fetchP2pMarketplace);
  const getRiskAck = useServerFn(getP2pRiskAcknowledgement);
  const acknowledgeRisk = useServerFn(acknowledgeP2pRisk);
  const loadParticipantProfile = useServerFn(getP2pParticipantProfile);
  const loadAvatarUrl = useServerFn(getP2pAvatarViewUrl);
  const createAvatarUpload = useServerFn(createP2pAvatarUpload);
  const saveAvatar = useServerFn(registerP2pAvatar);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, P2pProfile>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [pendingRiskAd, setPendingRiskAd] = useState<AdRow | null>(null);
  const [workingRisk, setWorkingRisk] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPending, setAvatarPending] = useState(false);
  const [loadingAds, setLoadingAds] = useState(true);
  const [marketplaceError, setMarketplaceError] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [directAmount, setDirectAmount] = useState("");
  const [pendingDirect, setPendingDirect] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<{ id: string; upi_id: string }[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [sellWallets, setSellWallets] = useState<PersonalWalletRow[]>([]);
  const [walletAvailability, setWalletAvailability] = useState<Record<string, number>>({});
  const [selectedSourceWalletId, setSelectedSourceWalletId] = useState("");
  const [filters, setFilters] = useState<P2pFilters>({
    bestRate: true,
    verified: false,
    upi: false,
    highCompletion: false,
  });
  const [adForm, setAdForm] = useState({
    side: "sell" as "buy" | "sell",
    price: "",
    availableUsdt: "",
    minOrderInr: "",
    maxOrderInr: "",
    terms: "",
  });
  const [submittingAd, setSubmittingAd] = useState(false);
  const [takingAdId, setTakingAdId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingAds(true);
    setMarketplaceError("");
    try {
      const [marketplace, methodsResult, walletsResult] = await Promise.all([
        loadMarketplace(),
        supabase.from("payment_methods").select("id, upi_id").order("is_default", {
          ascending: false,
        }),
        supabase
          .from("user_wallets" as never)
          .select("id, name, address, network, balance, onchain_balance, wallet_type, wallet_role")
          .eq("is_archived", false as never)
          .eq("network", DEFAULT_NETWORK as never),
      ]);
      setAds(
        ((marketplace ?? []) as RawAdRow[]).map((row) => ({
          ...row,
          price_inr: Number(row.price_inr),
          available_usdt: Number(row.available_usdt),
          min_order_inr: Number(row.min_order_inr),
          max_order_inr: Number(row.max_order_inr),
        })),
      );
      setPaymentMethods((methodsResult.data ?? []) as { id: string; upi_id: string }[]);
      setSelectedPaymentMethod((current) => current || methodsResult.data?.[0]?.id || "");
      if (methodsResult.error) toast.error(methodsResult.error.message);
      if (walletsResult.error) toast.error("Unable to load source wallets.");
      const eligibleWallets = ((walletsResult.data ?? []) as unknown as PersonalWalletRow[]).filter(
        (wallet) => wallet.wallet_type !== "gasfree" && wallet.wallet_role !== "gasfree",
      );
      setSellWallets(eligibleWallets);
      setSelectedSourceWalletId((current) =>
        current && eligibleWallets.some((wallet) => wallet.id === current)
          ? current
          : (eligibleWallets[0]?.id ?? ""),
      );
      const availabilityPairs = await Promise.all(
        eligibleWallets.map(async (wallet) => {
          const { data, error } = await supabase.rpc(
            "personal_wallet_available_usdt_for_wallet" as never,
            { _wallet_id: wallet.id } as never,
          );
          return [wallet.id, error ? walletDisplayBalance(wallet) : Number(data ?? 0)] as const;
        }),
      );
      setWalletAvailability(Object.fromEntries(availabilityPairs));
      const ack = (await getRiskAck()) as { acknowledged?: boolean };
      setRiskAcknowledged(Boolean(ack.acknowledged));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load P2P marketplace. Please try again.";
      setMarketplaceError(message);
      setAds([]);
    } finally {
      setLoadingAds(false);
    }
  }, [getRiskAck, loadMarketplace]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const merchantUserIds = [
      ...new Set(
        ads
          .map((ad) => ad.merchants?.user_id)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    ];
    for (const userId of merchantUserIds) {
      if (profiles[userId]) continue;
      void loadParticipantProfile({ data: { userId } })
        .then(async (profile) => {
          const typed = profile as P2pProfile;
          setProfiles((current) => ({ ...current, [userId]: typed }));
          if (typed.avatarPath) {
            const result = (await loadAvatarUrl({
              data: { avatarPath: typed.avatarPath },
            })) as { url?: string };
            if (result.url) setAvatarUrls((current) => ({ ...current, [userId]: result.url! }));
          }
        })
        .catch(() => undefined);
    }
  }, [ads, avatarUrls, loadAvatarUrl, loadParticipantProfile, profiles]);

  const filtered = useMemo(
    () => sortedAndFilteredAds(ads, side, amount, filters, profiles),
    [ads, amount, filters, profiles, side],
  );
  const selectedSourceWallet = sellWallets.find((wallet) => wallet.id === selectedSourceWalletId);
  const selectedSourceAvailable = selectedSourceWalletId
    ? (walletAvailability[selectedSourceWalletId] ?? 0)
    : 0;

  async function submitDirectSell(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(directAmount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid USDT amount");
      return;
    }
    if (!selectedPaymentMethod) {
      toast.error("Select the UPI method where WTRON should pay you");
      return;
    }
    setPendingDirect(true);
    try {
      const order = await createDirectSell({
        data: { amount: value, paymentMethodId: selectedPaymentMethod },
      });
      toast.success(`Direct sell order ${order.order_ref ?? order.order_id} created`);
      setDirectAmount("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create direct sell order");
    } finally {
      setPendingDirect(false);
    }
  }

  async function submitAd(event: React.FormEvent) {
    event.preventDefault();
    if (adForm.side === "sell" && !selectedPaymentMethod) {
      toast.error("Select a saved UPI payment method for your sell ad");
      return;
    }
    if (adForm.side === "sell" && !selectedSourceWalletId) {
      toast.error("Select a funded personal Mainnet wallet for your sell ad");
      return;
    }
    if (adForm.side === "sell" && Number(adForm.availableUsdt) > selectedSourceAvailable) {
      toast.error("Selected wallet does not have enough available USDT");
      return;
    }
    const payload = {
      side: adForm.side,
      price: Number(adForm.price),
      availableUsdt: Number(adForm.availableUsdt),
      minOrderInr: Number(adForm.minOrderInr),
      maxOrderInr: Number(adForm.maxOrderInr),
      paymentMethods: ["upi"],
      paymentMethodId: adForm.side === "sell" ? selectedPaymentMethod : undefined,
      sourceWalletId: adForm.side === "sell" ? selectedSourceWalletId : undefined,
      terms: adForm.terms || undefined,
      isActive: true,
    };
    setSubmittingAd(true);
    try {
      await createAd({ data: payload });
      setAdForm({
        side: "sell",
        price: "",
        availableUsdt: "",
        minOrderInr: "",
        maxOrderInr: "",
        terms: "",
      });
      await load();
      toast.success("P2P advertisement created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create advertisement");
    } finally {
      setSubmittingAd(false);
    }
  }

  async function takeAd(ad: AdRow, skipRiskCheck = false) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter the USDT amount first");
      return;
    }
    if (side === "sell" && !selectedPaymentMethod) {
      toast.error("Add a UPI payment method before selling into a buy ad");
      return;
    }
    if (side === "sell" && !selectedSourceWalletId) {
      toast.error("Select a funded personal Mainnet wallet before selling USDT");
      return;
    }
    if (side === "sell" && value > selectedSourceAvailable) {
      toast.error("Selected wallet does not have enough available USDT");
      return;
    }
    if (!skipRiskCheck && !riskAcknowledged) {
      setPendingRiskAd(ad);
      return;
    }
    setTakingAdId(ad.id);
    try {
      const order = await createOrder({
        data: {
          adId: ad.id,
          amountUsdt: value,
          paymentMethodId: side === "sell" ? selectedPaymentMethod : undefined,
          sourceWalletId: side === "sell" ? selectedSourceWalletId : undefined,
        },
      });
      const row = order as { order_ref?: unknown } | null;
      const ref = row?.order_ref ? String(row.order_ref) : "created";
      toast.success(`P2P order ${ref}`);
      setAmount("");
      await load();
    } catch (error) {
      toast.error(friendlyP2pError(error, "Could not create order"));
    } finally {
      setTakingAdId(null);
    }
  }

  async function acknowledgeAndContinue() {
    setWorkingRisk(true);
    try {
      await acknowledgeRisk({ data: { policyVersion: "v1" } });
      setRiskAcknowledged(true);
      const ad = pendingRiskAd;
      setPendingRiskAd(null);
      if (ad) await takeAd(ad, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not acknowledge P2P warning");
    } finally {
      setWorkingRisk(false);
    }
  }

  async function uploadAvatar() {
    if (!avatarFile) return;
    if (!avatarMimeTypes.includes(avatarFile.type)) {
      toast.error("Choose a JPG, PNG, WebP or GIF image.");
      return;
    }
    if (avatarFile.size > maxAvatarBytes) {
      toast.error("Choose an image up to 2 MB.");
      return;
    }
    setAvatarPending(true);
    try {
      const upload = await createAvatarUpload({
        data: {
          fileName: avatarFile.name,
          contentType: avatarFile.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          sizeBytes: avatarFile.size,
        },
      });
      const { error } = await supabase.storage
        .from("user-avatars")
        .uploadToSignedUrl(upload.path, upload.token, avatarFile);
      if (error) throw new Error(error.message);
      await saveAvatar({
        data: {
          storagePath: upload.path,
          fileName: avatarFile.name,
          contentType: avatarFile.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          sizeBytes: avatarFile.size,
        },
      });
      setAvatarFile(null);
      toast.success("P2P profile photo updated");
    } catch (error) {
      toast.error(friendlyP2pError(error, "Could not update profile photo"));
    } finally {
      setAvatarPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {pendingRiskAd ? (
        <div className="panel border-amber-400/40 bg-amber-500/10 p-5">
          <p className="font-semibold">P2P risk confirmation</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Verify the counterparty and payment details before proceeding. Keep all communication
            and proof inside WTRON. Do not accept or send payments from unrelated third-party
            accounts. WTRON can assist with platform disputes, but you remain responsible for
            reviewing the counterparty and payment details.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={workingRisk} onClick={() => void acknowledgeAndContinue()}>
              I understand
            </Button>
            <Button variant="secondary" onClick={() => setPendingRiskAd(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="panel p-5">
          <SectionHeader
            title="P2P marketplace"
            description="Buy and sell USDT for INR using active marketplace ads."
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant={side === "buy" ? "default" : "secondary"}
              onClick={() => setSide("buy")}
            >
              Buy USDT
            </Button>
            <Button
              variant={side === "sell" ? "default" : "secondary"}
              onClick={() => setSide("sell")}
            >
              Sell USDT
            </Button>
            <div className="ml-auto flex min-w-56 items-center gap-2 rounded-md border bg-background px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Amount in USDT"
                className="border-0 px-0 shadow-none focus-visible:ring-0"
              />
            </div>
          </div>
          {side === "sell" && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <select
                value={selectedPaymentMethod}
                onChange={(event) => setSelectedPaymentMethod(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select receiving UPI method</option>
                {paymentMethods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.upi_id}
                  </option>
                ))}
              </select>
              <SourceWalletSelect
                wallets={sellWallets}
                availability={walletAvailability}
                value={selectedSourceWalletId}
                onChange={setSelectedSourceWalletId}
              />
              {selectedSourceWallet ? (
                <p className="md:col-span-2 text-xs text-muted-foreground">
                  Available for P2P reservation: {formatUsdt(selectedSourceAvailable)} USDT from{" "}
                  {selectedSourceWallet.name ?? "selected wallet"}.
                </p>
              ) : (
                <p className="md:col-span-2 text-xs text-warning">
                  Create or import a funded TRON Mainnet wallet before selling USDT.
                </p>
              )}
            </div>
          )}
        </div>

        <form className="panel p-5" onSubmit={submitDirectSell}>
          <SectionHeader
            title="Sell to platform"
            description="Uses the existing company-address deposit listener."
          />
          <div className="mt-4 space-y-3">
            <Input
              value={directAmount}
              onChange={(event) => setDirectAmount(event.target.value)}
              placeholder="USDT amount"
              inputMode="decimal"
              className="mono"
            />
            <select
              value={selectedPaymentMethod}
              onChange={(event) => setSelectedPaymentMethod(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Select payout UPI</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.upi_id}
                </option>
              ))}
            </select>
            <Button className="w-full" disabled={pendingDirect}>
              {pendingDirect ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <BadgeIndianRupee className="mr-1.5 h-4 w-4" />
              )}
              Create direct sell
            </Button>
          </div>
        </form>
      </div>

      <div className="panel p-5">
        <SectionHeader
          title="P2P profile photo"
          description="Upload an image-only avatar shown on P2P listings, profiles and order conversations."
        />
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
          />
          <Button type="button" disabled={!avatarFile || avatarPending} onClick={uploadAvatar}>
            {avatarPending ? "Uploading..." : "Update Photo"}
          </Button>
        </div>
      </div>

      <form className="panel p-5" onSubmit={submitAd}>
        <SectionHeader
          title="Create advertisement"
          description="Users are advertisers. Sell ads require available USDT when orders are taken."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-6">
          <select
            value={adForm.side}
            onChange={(event) =>
              setAdForm((current) => ({ ...current, side: event.target.value as "buy" | "sell" }))
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="sell">Create Sell Ad</option>
            <option value="buy">Create Buy Ad</option>
          </select>
          <Input
            value={adForm.price}
            onChange={(event) =>
              setAdForm((current) => ({ ...current, price: event.target.value }))
            }
            placeholder="INR price"
            inputMode="decimal"
          />
          <Input
            value={adForm.availableUsdt}
            onChange={(event) =>
              setAdForm((current) => ({ ...current, availableUsdt: event.target.value }))
            }
            placeholder="USDT available"
            inputMode="decimal"
          />
          <Input
            value={adForm.minOrderInr}
            onChange={(event) =>
              setAdForm((current) => ({ ...current, minOrderInr: event.target.value }))
            }
            placeholder="Min INR"
            inputMode="decimal"
          />
          <Input
            value={adForm.maxOrderInr}
            onChange={(event) =>
              setAdForm((current) => ({ ...current, maxOrderInr: event.target.value }))
            }
            placeholder="Max INR"
            inputMode="decimal"
          />
          <Button disabled={submittingAd}>
            {submittingAd ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Create ad
          </Button>
        </div>
        {adForm.side === "sell" && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <select
              value={selectedPaymentMethod}
              onChange={(event) => setSelectedPaymentMethod(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Select seller UPI method</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.upi_id}
                </option>
              ))}
            </select>
            <SourceWalletSelect
              wallets={sellWallets}
              availability={walletAvailability}
              value={selectedSourceWalletId}
              onChange={setSelectedSourceWalletId}
            />
          </div>
        )}
        <Input
          className="mt-3"
          value={adForm.terms}
          onChange={(event) => setAdForm((current) => ({ ...current, terms: event.target.value }))}
          placeholder="Terms, payment timing, notes"
        />
      </form>

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
          {[
            ["bestRate", "Best rate"],
            ["verified", "Verified"],
            ["upi", "UPI"],
            ["highCompletion", "High completion"],
          ].map(([key, label]) => {
            const filterKey = key as keyof P2pFilters;
            return (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={filters[filterKey] ? "default" : "secondary"}
                onClick={() =>
                  setFilters((current) => ({ ...current, [filterKey]: !current[filterKey] }))
                }
              >
                {label}
              </Button>
            );
          })}
        </div>
        {marketplaceError ? (
          <div className="border-b border-border bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p>Unable to load P2P marketplace. Please try again.</p>
            <Button className="mt-3" size="sm" variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : null}
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Advertiser</th>
              <th className="px-4 py-2.5 text-left font-medium">Price</th>
              <th className="px-4 py-2.5 text-left font-medium">Available</th>
              <th className="px-4 py-2.5 text-left font-medium">Limits</th>
              <th className="px-4 py-2.5 text-left font-medium">Methods</th>
              <th className="px-4 py-2.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loadingAds ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
                  Loading marketplace...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No active ads match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((ad) => {
                const merchant = ad.merchants;
                const profile = merchant?.user_id ? profiles[merchant.user_id] : null;
                const avatarUrl = merchant?.user_id ? avatarUrls[merchant.user_id] : "";
                const completion =
                  merchant && merchant.total_orders > 0
                    ? Math.round((merchant.completed_orders / merchant.total_orders) * 100)
                    : 0;
                return (
                  <tr key={ad.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-start gap-2">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt=""
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            W
                          </div>
                        )}
                        <div>
                          <p className="font-medium">
                            {profile?.displayName ?? merchant?.display_name ?? "Advertiser"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {profile?.accountType ?? "Trader"} - {profile?.rankingTier ?? "New"}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {profile?.completedTrades ?? merchant?.completed_orders ?? 0} completed -{" "}
                        {profile?.completionRate ?? completion}% completion
                      </p>
                      {profile ? (
                        <p className="text-xs text-muted-foreground">
                          {Number(profile.totalUsdtTraded ?? 0).toLocaleString()} USDT traded -{" "}
                          {profile.openDisputes ?? 0} open disputes - joined{" "}
                          {profile.joinedDays ?? 0} days ago
                        </p>
                      ) : null}
                    </td>
                    <td className="mono px-4 py-2.5 text-primary">
                      Rs {ad.price_inr.toLocaleString("en-IN")}
                    </td>
                    <td className="mono px-4 py-2.5">{formatUsdt(ad.available_usdt)} USDT</td>
                    <td className="mono px-4 py-2.5 text-xs">
                      Rs {ad.min_order_inr.toLocaleString("en-IN")} - Rs{" "}
                      {ad.max_order_inr.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs">
                        <ShieldCheck className="h-3 w-3 text-primary" />
                        {ad.payment_methods.join(", ").toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        size="sm"
                        disabled={takingAdId === ad.id}
                        onClick={() => void takeAd(ad)}
                      >
                        {takingAdId === ad.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {side === "buy" ? "Buy USDT" : "Sell USDT"}
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

function SourceWalletSelect({
  wallets,
  availability,
  value,
  onChange,
}: {
  wallets: PersonalWalletRow[];
  availability: Record<string, number>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
    >
      <option value="">Select source wallet</option>
      {wallets.map((wallet) => (
        <option key={wallet.id} value={wallet.id}>
          {wallet.name ?? "Wallet"} - {formatUsdt(availability[wallet.id] ?? 0)} USDT available
        </option>
      ))}
    </select>
  );
}
