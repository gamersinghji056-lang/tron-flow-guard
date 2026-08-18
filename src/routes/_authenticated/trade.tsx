import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BadgeIndianRupee, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createDirectSellOrder } from "@/lib/direct-sell.functions";
import { createVendorOrder, fetchVendorMarketplace } from "@/lib/vendor-trade.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/trade")({
  head: () => ({ meta: [{ title: "WTRON Trade" }] }),
  component: TradePage,
});

interface PaymentMethodRow {
  id: string;
  upi_id: string;
}

interface VendorListingRow {
  id: string;
  rate_inr: number | string;
  available_usdt: number | string;
  min_order_inr: number | string;
  max_order_inr: number | string;
  payment_rails: string[];
  trading_vendors?: {
    name?: string;
    success_rate?: number | string;
    completed_orders?: number;
  } | null;
}

function TradePage() {
  const createDirectSell = useServerFn(createDirectSellOrder);
  const loadVendors = useServerFn(fetchVendorMarketplace);
  const reserveVendor = useServerFn(createVendorOrder);
  const [tab, setTab] = useState<"sell" | "buy">("sell");
  const [amount, setAmount] = useState("");
  const [vendorAmount, setVendorAmount] = useState("");
  const [rail, setRail] = useState<"upi" | "imps" | "neft" | "rtgs">("upi");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [vendors, setVendors] = useState<VendorListingRow[]>([]);
  const [pending, setPending] = useState(false);
  const [workingVendor, setWorkingVendor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [methods, listings] = await Promise.all([
      supabase
        .from("payment_methods")
        .select("id, upi_id")
        .eq("kind", "upi")
        .order("is_default", { ascending: false }),
      loadVendors(),
    ]);
    if (methods.error) toast.error(methods.error.message);
    setPaymentMethods((methods.data ?? []) as PaymentMethodRow[]);
    setPaymentMethodId((current) => current || methods.data?.[0]?.id || "");
    setVendors((listings ?? []) as unknown as VendorListingRow[]);
  }, [loadVendors]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitDirectSell(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid USDT amount");
      return;
    }
    if (!paymentMethodId) {
      toast.error("Select your payout UPI method");
      return;
    }
    setPending(true);
    try {
      const order = await createDirectSell({ data: { amount: value, paymentMethodId } });
      toast.success(`Direct sell order ${order.order_ref ?? order.order_id} created`);
      setAmount("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create trade order");
    } finally {
      setPending(false);
    }
  }

  async function buyFromVendor(listing: VendorListingRow) {
    const value = Number(vendorAmount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter the USDT amount first");
      return;
    }
    if (!listing.payment_rails.includes(rail)) {
      toast.error("Selected payment rail is not available for this vendor");
      return;
    }
    setWorkingVendor(listing.id);
    try {
      await reserveVendor({ data: { listingId: listing.id, amountUsdt: value, rail } });
      toast.success("Vendor order reserved. Submit payment from Orders.");
      setVendorAmount("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reserve vendor order");
    } finally {
      setWorkingVendor(null);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="WTRON Trade"
        description="Company trading and verified-vendor inventory. User-to-user trading remains in P2P."
      />
      <div className="flex gap-2">
        <Button variant={tab === "sell" ? "default" : "secondary"} onClick={() => setTab("sell")}>
          Sell to WTRON
        </Button>
        <Button variant={tab === "buy" ? "default" : "secondary"} onClick={() => setTab("buy")}>
          Buy from Vendors
        </Button>
      </div>

      {tab === "sell" ? (
        <form className="panel max-w-2xl space-y-4 p-5" onSubmit={submitDirectSell}>
          <div className="flex items-center gap-2">
            <BadgeIndianRupee className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Sell USDT to WTRON</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            WTRON locks the configured platform buy rate, assigns a company deposit address, and the
            existing TRON listener handles detection and confirmations.
          </p>
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="USDT amount"
            inputMode="decimal"
          />
          <select
            value={paymentMethodId}
            onChange={(event) => setPaymentMethodId(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Select payout UPI</option>
            {paymentMethods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.upi_id}
              </option>
            ))}
          </select>
          <Button disabled={pending}>
            {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Create Direct Sell Order
          </Button>
        </form>
      ) : (
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b p-4">
            <Input
              className="max-w-52"
              value={vendorAmount}
              onChange={(event) => setVendorAmount(event.target.value)}
              placeholder="USDT amount"
              inputMode="decimal"
            />
            <select
              value={rail}
              onChange={(event) => setRail(event.target.value as typeof rail)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="upi">UPI</option>
              <option value="imps">IMPS</option>
              <option value="neft">NEFT</option>
              <option value="rtgs">RTGS</option>
            </select>
            <Button asChild variant="secondary">
              <Link to="/orders">Open Orders</Link>
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Vendor</th>
                <th className="px-4 py-2.5 text-left font-medium">Rate</th>
                <th className="px-4 py-2.5 text-left font-medium">Available</th>
                <th className="px-4 py-2.5 text-left font-medium">Limits</th>
                <th className="px-4 py-2.5 text-left font-medium">Rails</th>
                <th className="px-4 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vendors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No verified vendor inventory is available.
                  </td>
                </tr>
              ) : (
                vendors.map((listing) => {
                  const vendor = listing.trading_vendors;
                  return (
                    <tr key={listing.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{vendor?.name ?? "Verified vendor"}</p>
                        <p className="text-xs text-muted-foreground">
                          {vendor?.completed_orders ?? 0} completed -{" "}
                          {Number(vendor?.success_rate ?? 100)}% success
                        </p>
                      </td>
                      <td className="mono px-4 py-2.5">
                        Rs {Number(listing.rate_inr).toLocaleString("en-IN")}
                      </td>
                      <td className="mono px-4 py-2.5">
                        {Number(listing.available_usdt).toLocaleString()} USDT
                      </td>
                      <td className="mono px-4 py-2.5 text-xs">
                        Rs {Number(listing.min_order_inr).toLocaleString("en-IN")} - Rs{" "}
                        {Number(listing.max_order_inr).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-2.5">
                        {listing.payment_rails.join(", ").toUpperCase()}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          disabled={workingVendor === listing.id}
                          onClick={() => void buyFromVendor(listing)}
                        >
                          {workingVendor === listing.id ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Reserve
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
