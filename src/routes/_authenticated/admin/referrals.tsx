import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/referrals")({
  head: () => ({ meta: [{ title: "Referral Program - WTRON Admin" }] }),
  component: () => (
    <AdminTablePage
      title="Referral Program"
      description="Referral attribution and reward status. Reward payouts must remain ledger-backed."
      table="referral_attributions"
      columns={[
        { key: "id", label: "ID" },
        { key: "referrer_user_id", label: "Referrer" },
        { key: "referred_user_id", label: "Referred" },
        { key: "referral_code", label: "Code" },
        { key: "source", label: "Source" },
        { key: "status", label: "Status" },
        { key: "qualified_at", label: "Qualified" },
        { key: "created_at", label: "Created" },
      ]}
    />
  ),
});
