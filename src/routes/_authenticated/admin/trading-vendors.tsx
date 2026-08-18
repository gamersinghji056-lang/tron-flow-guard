import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminUpsertTradingVendor, adminUpsertVendorListing } from "@/lib/vendor-trade.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/admin/trading-vendors")({
  component: AdminTradingVendorsPage,
});

interface VendorRow {
  id: string;
  name: string;
  status: string;
  success_rate: number;
  completed_orders: number;
  disputed_orders: number;
}

function AdminTradingVendorsPage() {
  const saveVendor = useServerFn(adminUpsertTradingVendor);
  const saveListing = useServerFn(adminUpsertVendorListing);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [vendorName, setVendorName] = useState("");
  const [listing, setListing] = useState({
    vendorId: "",
    rateInr: "",
    availableUsdt: "",
    minOrderInr: "",
    maxOrderInr: "",
    paymentRails: "upi,imps,neft,rtgs",
  });
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("trading_vendors" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    const rows = (data ?? []) as unknown as VendorRow[];
    setVendors(rows);
    setListing((current) => ({ ...current, vendorId: current.vendorId || rows[0]?.id || "" }));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createVendor(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    try {
      await saveVendor({ data: { name: vendorName, status: "approved", riskState: "normal" } });
      setVendorName("");
      await load();
      toast.success("Vendor saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save vendor");
    } finally {
      setWorking(false);
    }
  }

  async function createListing(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    try {
      await saveListing({
        data: {
          vendorId: listing.vendorId,
          rateInr: Number(listing.rateInr),
          availableUsdt: Number(listing.availableUsdt),
          minOrderInr: Number(listing.minOrderInr),
          maxOrderInr: Number(listing.maxOrderInr),
          paymentRails: listing.paymentRails
            .split(",")
            .map((rail) => rail.trim().toLowerCase())
            .filter(Boolean) as ("upi" | "imps" | "neft" | "rtgs")[],
          status: "active",
        },
      });
      setListing((current) => ({
        ...current,
        rateInr: "",
        availableUsdt: "",
        minOrderInr: "",
        maxOrderInr: "",
      }));
      toast.success("Vendor listing saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save listing");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Trading Vendors"
        description="Approved vendor inventory for Buy from WTRON / verified vendors."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="panel space-y-3 p-5" onSubmit={createVendor}>
          <h2 className="font-semibold">Create vendor</h2>
          <Input
            value={vendorName}
            onChange={(event) => setVendorName(event.target.value)}
            placeholder="Vendor name"
          />
          <Button disabled={working || !vendorName.trim()}>
            {working ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Save vendor
          </Button>
        </form>
        <form className="panel space-y-3 p-5" onSubmit={createListing}>
          <h2 className="font-semibold">Create listing</h2>
          <select
            value={listing.vendorId}
            onChange={(event) =>
              setListing((current) => ({ ...current, vendorId: event.target.value }))
            }
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Select vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={listing.rateInr}
              onChange={(event) =>
                setListing((current) => ({ ...current, rateInr: event.target.value }))
              }
              placeholder="Rate INR"
            />
            <Input
              value={listing.availableUsdt}
              onChange={(event) =>
                setListing((current) => ({ ...current, availableUsdt: event.target.value }))
              }
              placeholder="Available USDT"
            />
            <Input
              value={listing.minOrderInr}
              onChange={(event) =>
                setListing((current) => ({ ...current, minOrderInr: event.target.value }))
              }
              placeholder="Min INR"
            />
            <Input
              value={listing.maxOrderInr}
              onChange={(event) =>
                setListing((current) => ({ ...current, maxOrderInr: event.target.value }))
              }
              placeholder="Max INR"
            />
          </div>
          <Input
            value={listing.paymentRails}
            onChange={(event) =>
              setListing((current) => ({ ...current, paymentRails: event.target.value }))
            }
            placeholder="Rails comma separated"
          />
          <Button disabled={working || !listing.vendorId}>Save listing</Button>
        </form>
      </div>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Vendor</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">Performance</th>
              <th className="px-4 py-2.5 text-left font-medium">Disputes</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {vendors.map((vendor) => (
              <tr key={vendor.id}>
                <td className="px-4 py-2.5 font-medium">{vendor.name}</td>
                <td className="px-4 py-2.5">{vendor.status}</td>
                <td className="mono px-4 py-2.5">
                  {vendor.completed_orders} orders / {Number(vendor.success_rate).toFixed(1)}%
                </td>
                <td className="mono px-4 py-2.5">{vendor.disputed_orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
