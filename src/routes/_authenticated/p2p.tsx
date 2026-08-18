import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BadgeIndianRupee, Loader2, Plus, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createDirectSellOrder } from "@/lib/direct-sell.functions";
import { createP2pAd, createP2pOrderFromAd, fetchP2pMarketplace } from "@/lib/p2p.functions";
import { formatUsdt } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/p2p")({
  head: () => ({ meta: [{ title: "P2P marketplace - TRONDESK" }] }),
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
    display_name: string;
    completed_orders: number;
    total_orders: number;
    status: string;
  } | null;
}

type RawAdRow = Omit<AdRow, "price_inr" | "available_usdt" | "min_order_inr" | "max_order_inr"> & {
  price_inr: unknown;
  available_usdt: unknown;
  min_order_inr: unknown;
  max_order_inr: unknown;
};

function P2pPage() {
  const createDirectSell = useServerFn(createDirectSellOrder);
  const createAd = useServerFn(createP2pAd);
  const createOrder = useServerFn(createP2pOrderFromAd);
  const loadMarketplace = useServerFn(fetchP2pMarketplace);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loadingAds, setLoadingAds] = useState(true);
  const [marketplaceError, setMarketplaceError] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [directAmount, setDirectAmount] = useState("");
  const [pendingDirect, setPendingDirect] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<{ id: string; upi_id: string }[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
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
      const [marketplace, methodsResult] = await Promise.all([
        loadMarketplace(),
        supabase.from("payment_methods").select("id, upi_id").order("is_default", {
          ascending: false,
        }),
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
  }, [loadMarketplace]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const value = Number(amount);
    const marketplaceAdSide = side === "buy" ? "sell" : "buy";
    const bySide = ads.filter((row) => row.side === marketplaceAdSide);
    if (!Number.isFinite(value) || value <= 0) return bySide;
    return bySide.filter((row) => {
      const total = value * row.price_inr;
      return (
        value <= row.available_usdt && total >= row.min_order_inr && total <= row.max_order_inr
      );
    });
  }, [ads, amount, side]);

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
    const payload = {
      side: adForm.side,
      price: Number(adForm.price),
      availableUsdt: Number(adForm.availableUsdt),
      minOrderInr: Number(adForm.minOrderInr),
      maxOrderInr: Number(adForm.maxOrderInr),
      paymentMethods: ["upi"],
      paymentMethodId: adForm.side === "sell" ? selectedPaymentMethod : undefined,
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

  async function takeAd(ad: AdRow) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter the USDT amount first");
      return;
    }
    if (side === "sell" && !selectedPaymentMethod) {
      toast.error("Add a UPI payment method before selling into a buy ad");
      return;
    }
    setTakingAdId(ad.id);
    try {
      const order = await createOrder({
        data: {
          adId: ad.id,
          amountUsdt: value,
          paymentMethodId: side === "sell" ? selectedPaymentMethod : undefined,
        },
      });
      const row = order as { order_ref?: unknown } | null;
      const ref = row?.order_ref ? String(row.order_ref) : "created";
      toast.success(`P2P order ${ref}`);
      setAmount("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create order");
    } finally {
      setTakingAdId(null);
    }
  }

  return (
    <div className="space-y-6">
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
            <div className="mt-3 max-w-md">
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
          <select
            value={selectedPaymentMethod}
            onChange={(event) => setSelectedPaymentMethod(event.target.value)}
            className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm md:max-w-md"
          >
            <option value="">Select seller UPI method</option>
            {paymentMethods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.upi_id}
              </option>
            ))}
          </select>
        )}
        <Input
          className="mt-3"
          value={adForm.terms}
          onChange={(event) => setAdForm((current) => ({ ...current, terms: event.target.value }))}
          placeholder="Terms, payment timing, notes"
        />
      </form>

      <div className="panel overflow-hidden">
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
                const completion =
                  merchant && merchant.total_orders > 0
                    ? Math.round((merchant.completed_orders / merchant.total_orders) * 100)
                    : 0;
                return (
                  <tr key={ad.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{merchant?.display_name ?? "Advertiser"}</p>
                      <p className="text-xs text-muted-foreground">
                        {merchant?.completed_orders ?? 0} completed - {completion}% completion
                      </p>
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
