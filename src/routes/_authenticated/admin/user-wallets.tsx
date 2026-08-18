import { createFileRoute } from "@tanstack/react-router";
import { AdminTablePage } from "@/components/admin-table-page";

export const Route = createFileRoute("/_authenticated/admin/user-wallets")({
  head: () => ({ meta: [{ title: "User Wallets - WTRON Admin" }] }),
  component: () => (
    <AdminTablePage
      title="User Wallets"
      description="Personal wallet metadata only. Recovery phrases, private keys and password hashes are never shown."
      table="user_wallets"
      columns={[
        { key: "id", label: "Wallet ID" },
        { key: "user_id", label: "User" },
        { key: "name", label: "Name" },
        { key: "wallet_type", label: "Type" },
        { key: "custody", label: "Custody" },
        { key: "network", label: "Network" },
        { key: "address", label: "Address" },
        { key: "balance", label: "Balance" },
        { key: "backup_status", label: "Backup" },
        { key: "gas_sponsorship_status", label: "GasFree" },
        { key: "status", label: "Status" },
        { key: "created_at", label: "Created" },
      ]}
    />
  ),
});
