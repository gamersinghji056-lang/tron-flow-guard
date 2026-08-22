import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enqueueWebhookEvent } from "@/lib/webhooks.server";

const orderIdInput = z.object({
  orderId: z.string().uuid(),
});

const paymentSentInput = orderIdInput.extend({
  reference: z.string().trim().min(3).max(120),
});

const paymentItemInput = orderIdInput.extend({
  amountInr: z.number().positive(),
  utr: z.string().trim().min(3).max(120),
  proofPath: z.string().trim().min(10).max(500).optional(),
});

const paymentItemIdInput = z.object({
  itemId: z.string().uuid(),
});

const paymentItemDisputeInput = paymentItemIdInput.extend({
  reason: z.string().trim().min(3).max(500),
});

export const assignDirectSellPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.DIRECT_SELL_MANAGE);
    const { data: reservation, error } = await context.supabase.rpc(
      "assign_direct_sell_payment" as never,
      { _order_id: data.orderId } as never,
    );
    if (error) throw new Error(error.message);
    return reservation;
  });

export const markDirectSellPaymentSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => paymentSentInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.DIRECT_SELL_MANAGE);
    const { error } = await context.supabase.rpc(
      "mark_direct_sell_payment_sent" as never,
      {
        _order_id: data.orderId,
        _reference: data.reference,
      } as never,
    );
    if (error) throw new Error(error.message);
    await enqueueWebhookEvent("direct_sell.payment_sent", {
      id: data.orderId,
      payment_reference: data.reference,
    });
    return { ok: true };
  });

export const completeDirectSellOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.DIRECT_SELL_MANAGE);
    const { error } = await context.supabase.rpc(
      "complete_direct_sell_order" as never,
      {
        _order_id: data.orderId,
      } as never,
    );
    if (error) throw new Error(error.message);
    await enqueueWebhookEvent("direct_sell.completed", { id: data.orderId });
    return { ok: true };
  });

export const createDirectSellPaymentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => paymentItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.DIRECT_SELL_MANAGE);
    const { data: item, error } = await context.supabase.rpc(
      "create_direct_sell_payment_item" as never,
      {
        _order_id: data.orderId,
        _amount_inr: data.amountInr,
        _utr: data.utr,
        _proof_path: data.proofPath ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    await enqueueWebhookEvent("direct_sell.payment_sent", {
      id: data.orderId,
      utr: data.utr,
      amount_inr: data.amountInr,
    });
    return item;
  });

export const confirmDirectSellPaymentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => paymentItemIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "confirm_direct_sell_payment_item" as never,
      { _item_id: data.itemId } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disputeDirectSellPaymentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => paymentItemDisputeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "dispute_direct_sell_payment_item" as never,
      { _item_id: data.itemId, _reason: data.reason } as never,
    );
    if (error) throw new Error(error.message);
    await enqueueWebhookEvent("direct_sell.manual_review", {
      payment_item_id: data.itemId,
      reason: data.reason,
    });
    return { ok: true };
  });
