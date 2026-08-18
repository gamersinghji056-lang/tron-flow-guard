import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/p2p-orders")({
  component: () => (
    <AdminTablePage
      title="P2P Orders"
      description="Participant orders and escrow/payment state."
      table="p2p_orders"
      columns={[
        { key: "order_ref", label: "Order" },
        { key: "buyer_user_id", label: "Buyer" },
        { key: "seller_id", label: "Seller" },
        { key: "usdt_amount", label: "USDT" },
        { key: "total_inr", label: "INR" },
        { key: "status", label: "Status" },
        { key: "payment_deadline", label: "Deadline" },
        { key: "created_at", label: "Created" },
      ]}
    />
  ),
});
