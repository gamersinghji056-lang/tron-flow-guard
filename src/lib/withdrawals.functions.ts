import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enqueueWebhookEvent } from "@/lib/webhooks.server";

const withdrawalInput = z.object({
  toAddress: z.string().regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/, "Enter a valid TRON address"),
  amount: z.number().positive().max(1_000_000),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export const createWithdrawalRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => withdrawalInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: withdrawal, error } = await context.supabase.rpc(
      "create_withdrawal_request" as never,
      {
        _to_address: data.toAddress,
        _amount: data.amount,
        _idempotency_key: data.idempotencyKey ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    if (withdrawal && typeof withdrawal === "object" && "id" in withdrawal) {
      await enqueueWebhookEvent("withdrawal.created", withdrawal as Record<string, unknown>);
    }
    return withdrawal;
  });
