import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/ledger")({
  component: () => (
    <AdminTablePage
      title="Ledger"
      description="Accounting entries for balance mutations."
      table="ledger_entries"
      columns={[
        { key: "id", label: "Entry" },
        { key: "user_id", label: "User" },
        { key: "entry_type", label: "Type" },
        { key: "bucket", label: "Bucket" },
        { key: "amount", label: "Amount" },
        { key: "balance_before", label: "Before" },
        { key: "balance_after", label: "After" },
        { key: "created_at", label: "Created" },
      ]}
    />
  ),
});
