import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { createWithdrawalRequest } from "@/lib/withdrawals.functions";
import { useAuth } from "@/hooks/use-auth";
import { formatUsdt } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/withdraw")({
  component: WithdrawPage,
});

function WithdrawPage() {
  const { profile } = useAuth();
  const createWithdrawal = useServerFn(createWithdrawalRequest);
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const withdrawal = await createWithdrawal({
        data: {
          toAddress,
          amount: Number(amount),
          idempotencyKey: crypto.randomUUID(),
        },
      });
      const row = withdrawal as { id?: unknown } | null;
      const id = row?.id ? String(row.id) : "";
      toast.success(`Withdrawal request ${id.slice(0, 8)} created`);
      setToAddress("");
      setAmount("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create withdrawal");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SectionHeader
        title="Withdraw USDT"
        description="Creates a server-side withdrawal request and reserves available balance. Broadcast requires the configured signing service."
      />
      <form className="panel space-y-4 p-5" onSubmit={submit}>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Available balance</p>
          <p className="mono text-lg font-semibold text-primary">
            {formatUsdt(profile?.balance)} USDT
          </p>
        </div>
        <Input
          value={toAddress}
          onChange={(event) => setToAddress(event.target.value)}
          placeholder="TRC20 destination address"
          className="mono"
        />
        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="USDT amount"
          inputMode="decimal"
          className="mono"
        />
        <Button disabled={pending} className="w-full">
          {pending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-4 w-4" />
          )}
          Create withdrawal request
        </Button>
      </form>
    </div>
  );
}
