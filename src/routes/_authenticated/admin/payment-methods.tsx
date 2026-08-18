import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/payment-methods")({
  head: () => ({ meta: [{ title: "Payment Methods - WTRON Admin" }] }),
  component: () => (
    <AdminTablePage
      title="Payment Methods"
      description="UPI and bank metadata for operations. Full details are visible only where policy permits."
      table="payment_methods"
      columns={[
        { key: "id", label: "ID" },
        { key: "user_id", label: "User" },
        { key: "kind", label: "Kind" },
        { key: "label", label: "Label" },
        { key: "upi_id", label: "UPI" },
        { key: "holder_name", label: "Holder" },
        { key: "bank_name", label: "Bank" },
        { key: "ifsc", label: "IFSC" },
        { key: "supported_rails", label: "Rails" },
        { key: "status", label: "Status" },
        { key: "verified", label: "Verified" },
        { key: "created_at", label: "Created" },
      ]}
    />
  ),
});
