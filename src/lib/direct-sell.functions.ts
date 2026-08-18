import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createDirectSellInput = z.object({
  amount: z.number().positive().max(1_000_000),
  paymentMethodId: z.string().uuid(),
});

interface DirectSellRpc {
  (
    name: "create_direct_sell_order",
    args: { _amount: number; _payment_method_id: string },
  ): Promise<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>;
}

interface DirectSellOrderCreated {
  order_id: string;
  order_ref: string;
  deposit_request_id: string;
  wallet_address: string;
  expected_inr: number | string;
}

export const createDirectSellOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createDirectSellInput.parse(data))
  .handler(async ({ data, context }) => {
    const rpc = context.supabase.rpc as unknown as DirectSellRpc;
    const { error, data: rows } = await rpc("create_direct_sell_order", {
      _amount: data.amount,
      _payment_method_id: data.paymentMethodId,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? (rows[0] as DirectSellOrderCreated | undefined) : undefined;
    if (!row) throw new Error("Direct sell order was not created");
    return row;
  });
