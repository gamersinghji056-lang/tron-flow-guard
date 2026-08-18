import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/blockchain-monitor")({
  component: () => (
    <AdminTablePage
      title="Blockchain Monitor"
      description="Authoritative backend health for the listener and Railway worker."
      table="service_health"
      columns={[
        { key: "service", label: "Service" },
        { key: "status", label: "Status" },
        { key: "detail", label: "Reason" },
        { key: "latest_block", label: "Latest block" },
        { key: "metadata", label: "Metadata" },
        { key: "updated_at", label: "Heartbeat" },
      ]}
      orderBy="updated_at"
    />
  ),
});
