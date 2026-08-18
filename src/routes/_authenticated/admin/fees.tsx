import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/fees")({
  component: () => (
    <AdminTablePage
      title="Fees"
      description="Fee and limit settings. Changes should go through audited server functions."
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
