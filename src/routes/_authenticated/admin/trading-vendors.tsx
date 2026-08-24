import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminVendorAction, listAdminVendors } from "@/lib/vendor.functions";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/admin/trading-vendors")({
  component: AdminTradingVendorsPage,
});

interface VendorRow {
  id: string;
  name: string;
  contact_name?: string | null;
  email?: string | null;
  telegram_username?: string | null;
  status: string;
  success_rate?: number | string | null;
  completed_orders?: number | null;
  disputed_orders?: number | null;
  created_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  suspended_at?: string | null;
}

function AdminTradingVendorsPage() {
  const fetchVendors = useServerFn(listAdminVendors);
  const updateVendor = useServerFn(adminVendorAction);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "suspended" | "disabled">(
    "pending",
  );
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setVendors(((await fetchVendors()) ?? []) as unknown as VendorRow[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load vendors");
    }
  }, [fetchVendors]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => vendors.filter((vendor) => vendor.status === tab), [tab, vendors]);

  async function runAction(
    vendorId: string,
    action: "approve" | "reject" | "suspend" | "disable" | "reactivate",
  ) {
    const reason =
      action === "reject" || action === "suspend" || action === "disable"
        ? window.prompt("Reason")?.trim()
        : undefined;
    if ((action === "reject" || action === "suspend" || action === "disable") && !reason) return;
    setWorking(true);
    try {
      await updateVendor({ data: { vendorId, action, reason } });
      await load();
      toast.success("Vendor updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update vendor");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Trading Vendors"
        description="Vendor self-registration review and lifecycle controls."
      />
      <div className="flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "suspended", "disabled"] as const).map((status) => (
          <Button
            key={status}
            variant={tab === status ? "default" : "secondary"}
            onClick={() => setTab(status)}
          >
            {status.replace("_", " ")} (
            {vendors.filter((vendor) => vendor.status === status).length})
          </Button>
        ))}
      </div>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Vendor</th>
              <th className="px-4 py-2.5 text-left font-medium">Email</th>
              <th className="px-4 py-2.5 text-left font-medium">Registered</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">Performance</th>
              <th className="px-4 py-2.5 text-left font-medium">Disputes</th>
              <th className="px-4 py-2.5 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((vendor) => (
              <tr key={vendor.id}>
                <td className="px-4 py-2.5">
                  <p className="font-medium">{vendor.name}</p>
                  <p className="text-xs text-muted-foreground">{vendor.contact_name}</p>
                </td>
                <td className="px-4 py-2.5">{vendor.email ?? "-"}</td>
                <td className="mono px-4 py-2.5 text-xs">
                  {vendor.created_at ? new Date(vendor.created_at).toLocaleString() : "-"}
                </td>
                <td className="px-4 py-2.5">{vendor.status}</td>
                <td className="mono px-4 py-2.5">
                  {vendor.completed_orders ?? 0} orders /{" "}
                  {Number(vendor.success_rate ?? 0).toFixed(1)}%
                </td>
                <td className="mono px-4 py-2.5">{vendor.disputed_orders ?? 0}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-2">
                    {vendor.status === "pending" || vendor.status === "rejected" ? (
                      <Button
                        size="sm"
                        disabled={working}
                        onClick={() => void runAction(vendor.id, "approve")}
                      >
                        {working ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                        Approve
                      </Button>
                    ) : null}
                    {vendor.status === "pending" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={working}
                        onClick={() => void runAction(vendor.id, "reject")}
                      >
                        Reject
                      </Button>
                    ) : null}
                    {vendor.status === "approved" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={working}
                        onClick={() => void runAction(vendor.id, "suspend")}
                      >
                        Suspend
                      </Button>
                    ) : null}
                    {vendor.status === "approved" || vendor.status === "suspended" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={working}
                        onClick={() => void runAction(vendor.id, "disable")}
                      >
                        Disable
                      </Button>
                    ) : null}
                    {vendor.status === "suspended" || vendor.status === "disabled" ? (
                      <Button
                        size="sm"
                        disabled={working}
                        onClick={() => void runAction(vendor.id, "reactivate")}
                      >
                        Reactivate
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>
                  No {tab} vendors.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
