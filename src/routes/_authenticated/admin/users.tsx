import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: () => (
    <AdminTablePage
      title="Users"
      description="Real user profiles. USER is the trading role in this application."
      table="profiles"
      columns={[
        { key: "id", label: "User ID" },
        { key: "email", label: "Email" },
        { key: "full_name", label: "Name" },
        { key: "balance", label: "Available" },
        { key: "locked_balance", label: "Locked" },
        { key: "created_at", label: "Created" },
        { key: "updated_at", label: "Updated" },
      ]}
      orderBy="created_at"
    />
  ),
});
