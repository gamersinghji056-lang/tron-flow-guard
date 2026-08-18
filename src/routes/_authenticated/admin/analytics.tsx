import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics - WTRON Admin" }] }),
  component: () => (
    <AdminTablePage
      title="Analytics"
      description="Operational ledger sample for analytics validation. Aggregated dashboards use live backend tables only."
      table="ledger_entries"
      columns={[
        { key: "id", label: "ID" },
        { key: "user_id", label: "User" },
        { key: "entry_type", label: "Type" },
        { key: "amount", label: "Amount" },
        { key: "currency", label: "Currency" },
        { key: "bucket", label: "Bucket" },
        { key: "created_at", label: "Created" },
      ]}
    />
  ),
});
