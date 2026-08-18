import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/risk-security")({
  component: () => (
    <AdminTablePage
      title="Risk & Security"
      description="Administrative permissions and account risk signals."
      table="admin_permissions"
      columns={[
        { key: "id", label: "Record" },
        { key: "user_id", label: "User" },
        { key: "permission", label: "Permission" },
        { key: "granted_by", label: "Granted by" },
        { key: "created_at", label: "Created" },
      ]}
    />
  ),
});
