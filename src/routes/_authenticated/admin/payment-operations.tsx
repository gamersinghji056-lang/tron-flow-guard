import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/payment-operations")({
  component: () => (
    <AdminTablePage
      title="Payment Operations"
      description="Reusable payment methods visible to admins for active operations and reviews."
      table="payment_methods"
      columns={[
        { key: "id", label: "Method" },
        { key: "user_id", label: "User" },
        { key: "kind", label: "Kind" },
        { key: "upi_id", label: "UPI ID" },
        { key: "holder_name", label: "Holder" },
        { key: "verified", label: "Verified" },
        { key: "created_at", label: "Created" },
      ]}
    />
  ),
});
