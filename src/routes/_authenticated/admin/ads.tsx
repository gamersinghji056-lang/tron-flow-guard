import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/ads")({
  component: () => (
    <AdminTablePage
      title="Ads"
      description="Active and inactive P2P advertisements."
      table="p2p_advertisements"
      columns={[
        { key: "id", label: "Ad ID" },
        { key: "merchant_id", label: "Advertiser" },
        { key: "side", label: "Side" },
        { key: "price_inr", label: "Price" },
        { key: "available_usdt", label: "Available" },
        { key: "min_order_inr", label: "Min" },
        { key: "max_order_inr", label: "Max" },
        { key: "is_active", label: "Active" },
      ]}
    />
  ),
});
