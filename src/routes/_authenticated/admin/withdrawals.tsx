import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/withdrawals")({
  component: () => (
    <AdminTablePage
      title="Withdrawals"
      description="User withdrawal requests and processing state."
      table="withdrawal_requests"
      columns={[
        { key: "id", label: "Request" },
        { key: "user_id", label: "User" },
        { key: "to_address", label: "Address" },
        { key: "amount", label: "Amount" },
        { key: "fee", label: "Fee" },
        { key: "status", label: "Status" },
        { key: "txid", label: "TXID" },
        { key: "created_at", label: "Created" },
      ]}
    />
  ),
});
