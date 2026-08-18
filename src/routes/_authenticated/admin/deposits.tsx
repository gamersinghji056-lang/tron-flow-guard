import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/deposits")({
  component: () => (
    <AdminTablePage
      title="Deposits"
      description="Deposit requests and listener-detected state."
      table="deposit_requests"
      columns={[
        { key: "order_ref", label: "Order" },
        { key: "user_id", label: "User" },
        { key: "expected_amount", label: "Expected" },
        { key: "received_amount", label: "Received" },
        { key: "status", label: "Status" },
        { key: "txid", label: "TXID" },
        { key: "confirmations", label: "Conf." },
        { key: "created_at", label: "Created" },
      ]}
    />
  ),
});
