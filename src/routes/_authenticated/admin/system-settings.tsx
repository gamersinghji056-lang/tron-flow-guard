import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/system-settings")({
  component: () => (
    <AdminTablePage
      title="System Settings"
      description="Operational settings including fees, limits and network configuration."
      table="system_settings"
      columns={[
        { key: "key", label: "Key" },
        { key: "value", label: "Value" },
        { key: "description", label: "Description" },
        { key: "updated_at", label: "Updated" },
      ]}
      orderBy="key"
    />
  ),
});
