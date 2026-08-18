import { createFileRoute } from "@tanstack/react-router";
import { BankAccountsPage } from "@/components/bank-accounts-page";

export const Route = createFileRoute("/_authenticated/bank-accounts")({
  head: () => ({ meta: [{ title: "Bank Accounts - WTRON" }] }),
  component: BankAccountsPage,
});
