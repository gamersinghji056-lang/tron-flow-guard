import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminVendorAction, getAdminVendorDetail, listAdminVendors } from "@/lib/vendor.functions";
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

interface VendorDetail {
  vendor: Record<string, unknown>;
  profile: Record<string, unknown> | null;
  accounts: Record<string, unknown>[];
  listings: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  directSell: Record<string, unknown>[];
}

function AdminTradingVendorsPage() {
  const fetchVendors = useServerFn(listAdminVendors);
  const updateVendor = useServerFn(adminVendorAction);
  const fetchVendorDetail = useServerFn(getAdminVendorDetail);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "suspended" | "disabled">(
    "pending",
  );
  const [working, setWorking] = useState(false);
  const [detail, setDetail] = useState<VendorDetail | null>(null);

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
    action: "approve" | "reject" | "freeze" | "disable" | "reactivate",
  ) {
    const reason =
      action === "reject" || action === "freeze" || action === "disable"
        ? window.prompt("Reason")?.trim()
        : undefined;
    if ((action === "reject" || action === "freeze" || action === "disable") && !reason) return;
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

  async function inspectVendor(vendorId: string) {
    setWorking(true);
    try {
      setDetail((await fetchVendorDetail({ data: { vendorId } })) as unknown as VendorDetail);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not inspect vendor");
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
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={working}
                      onClick={() => void inspectVendor(vendor.id)}
                    >
                      Inspect
                    </Button>
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
                        onClick={() => void runAction(vendor.id, "freeze")}
                      >
                        Freeze
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
      {detail ? (
        <div className="panel space-y-5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Vendor detail</h2>
              <p className="text-sm text-muted-foreground">
                Identity, payout accounts, listings, marketplace orders and Direct Sell activity.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setDetail(null)}>
              Close
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Balance" value={`${Number(detail.profile?.["balance"] ?? 0)} USDT`} />
            <Metric label="Payout accounts" value={String(detail.accounts.length)} />
            <Metric label="Listings" value={String(detail.listings.length)} />
            <Metric
              label="Orders / Direct Sell"
              value={`${detail.orders.length} / ${detail.directSell.length}`}
            />
          </div>
          <DetailTable title="Payout accounts" rows={detail.accounts} />
          <DetailTable title="Listings" rows={detail.listings} />
          <DetailTable title="Vendor orders" rows={detail.orders} />
          <DetailTable title="Vendor Direct Sell" rows={detail.directSell} />
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function DetailTable({ title, rows }: { title: string; rows: Record<string, unknown>[] }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-secondary/50">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-left">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, index) => (
              <tr key={String(row["id"] ?? index)}>
                <td className="mono px-3 py-2">{String(row["id"] ?? "-")}</td>
                <td className="px-3 py-2">{String(row["status"] ?? "-")}</td>
                <td className="px-3 py-2">
                  {row["created_at"] ? new Date(String(row["created_at"])).toLocaleString() : "-"}
                </td>
                <td className="px-3 py-2">
                  {String(row["order_ref"] ?? row["label"] ?? row["rail"] ?? "-")}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className="px-3 py-4 text-center text-muted-foreground" colSpan={4}>
                  No records.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
