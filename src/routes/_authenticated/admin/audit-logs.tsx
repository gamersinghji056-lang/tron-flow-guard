import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/audit-logs")({
  component: () => (
    <AdminTablePage
      title="Audit Logs"
      description="Security and operations audit events."
      table="audit_logs"
      columns={[
        { key: "created_at", label: "Created" },
        { key: "actor_type", label: "Actor type" },
        { key: "actor_id", label: "Actor" },
        { key: "action", label: "Action" },
        { key: "entity_type", label: "Entity type" },
        { key: "entity_id", label: "Entity" },
      ]}
    />
  ),
});
