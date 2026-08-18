import { createFileRoute } from "@tanstack/react-router";
import { BankAccountsPage } from "@/components/bank-accounts-page";

export const Route = createFileRoute("/_authenticated/payment-methods")({
  head: () => ({ meta: [{ title: "Payment Methods - WTRON" }] }),
  component: BankAccountsPage,
});
