import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enqueueWebhookEvent } from "@/lib/webhooks.server";
import { normalizeP2pMarketplaceAd } from "@/lib/p2p-state";

const createAdInput = z.object({
  side: z.enum(["buy", "sell"]),
  price: z.number().positive(),
  availableUsdt: z.number().positive(),
  minOrderInr: z.number().positive(),
  maxOrderInr: z.number().positive(),
  paymentMethods: z.array(z.string().min(2)).default(["upi"]),
  paymentMethodId: z.string().uuid().optional(),
  terms: z.string().max(1000).optional(),
  isActive: z.boolean().default(true),
});

const updateAdInput = createAdInput.extend({
  adId: z.string().uuid(),
});

const adActiveInput = z.object({
  adId: z.string().uuid(),
  isActive: z.boolean(),
});

const createOrderInput = z.object({
  adId: z.string().uuid(),
  amountUsdt: z.number().positive(),
  paymentMethodId: z.string().uuid().optional(),
});

const orderIdInput = z.object({
  orderId: z.string().uuid(),
});

const paymentInput = orderIdInput.extend({
  utr: z.string().trim().min(4).max(80),
  amountInr: z.number().positive(),
  proofPath: z.string().trim().min(10).max(500).optional(),
});

const cancelInput = orderIdInput.extend({
  reason: z.string().trim().max(240).optional(),
});

const disputeInput = orderIdInput.extend({
  reason: z.string().trim().min(3).max(120),
  details: z.string().trim().max(1000).optional(),
});

const messageInput = orderIdInput.extend({
  body: z.string().trim().min(1).max(2000),
});

interface P2pAdRow {
  id: string;
  merchant_id: string;
  side: "buy" | "sell";
  asset: string;
  fiat: string;
  price_inr: number | string;
  available_usdt: number | string;
  min_order_inr: number | string;
  max_order_inr: number | string;
  payment_methods: string[] | null;
  terms: string | null;
}

interface MerchantRow {
  id: string;
  display_name: string | null;
  completed_orders: number | null;
  total_orders: number | null;
  status: string | null;
}

export const fetchP2pMarketplace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: adRows, error: adError } = await context.supabase
      .from("p2p_advertisements" as never)
      .select(
        "id, merchant_id, side, asset, fiat, price_inr, available_usdt, min_order_inr, max_order_inr, payment_methods, terms",
      )
      .eq("is_active", true as never)
      .gt("available_usdt", 0 as never)
      .order("price_inr", { ascending: true })
      .limit(100);
    if (adError) throw new Error(adError.message);

    const ads = (adRows ?? []) as unknown as P2pAdRow[];
    const merchantIds = [...new Set(ads.map((ad) => ad.merchant_id).filter(Boolean))];
    const { data: merchantRows, error: merchantError } = merchantIds.length
      ? await context.supabase
          .from("merchants" as never)
          .select("id, display_name, completed_orders, total_orders, status")
          .in("id", merchantIds as never)
      : { data: [], error: null };
    if (merchantError) throw new Error(merchantError.message);

    const merchants = new Map(
      ((merchantRows ?? []) as unknown as MerchantRow[]).map((merchant) => [merchant.id, merchant]),
    );

    return ads.map((ad) => ({
      ...normalizeP2pMarketplaceAd(ad),
      merchants: merchants.get(ad.merchant_id) ?? null,
    }));
  });

export const createP2pAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createAdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: ad, error } = await context.supabase.rpc(
      "p2p_create_ad" as never,
      {
        _side: data.side,
        _price: data.price,
        _available_usdt: data.availableUsdt,
        _min_order_inr: data.minOrderInr,
        _max_order_inr: data.maxOrderInr,
        _payment_methods: data.paymentMethods,
        _terms: data.terms ?? null,
        _is_active: data.isActive,
        _payment_method_id: data.paymentMethodId ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    return ad;
  });

export const updateP2pAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateAdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: ad, error } = await context.supabase.rpc(
      "p2p_update_ad" as never,
      {
        _ad_id: data.adId,
        _price: data.price,
        _available_usdt: data.availableUsdt,
        _min_order_inr: data.minOrderInr,
        _max_order_inr: data.maxOrderInr,
        _payment_methods: data.paymentMethods,
        _terms: data.terms ?? null,
        _is_active: data.isActive,
        _payment_method_id: data.paymentMethodId ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    return ad;
  });

export const setP2pAdActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adActiveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "p2p_set_ad_active" as never,
      {
        _ad_id: data.adId,
        _is_active: data.isActive,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createP2pOrderFromAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createOrderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "p2p_create_order_from_ad" as never,
      {
        _advertisement_id: data.adId,
        _usdt: data.amountUsdt,
        _payment_method_id: data.paymentMethodId ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    const order = Array.isArray(rows) ? rows[0] : rows;
    if (order && typeof order === "object" && "order_id" in order) {
      await enqueueWebhookEvent("p2p.order.created", order as Record<string, unknown>);
    }
    return order;
  });

export const markP2pPaymentSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => paymentInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "p2p_mark_payment_sent" as never,
      {
        _order_id: data.orderId,
        _utr: data.utr,
        _amount: data.amountInr,
        _proof_url: data.proofPath ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    await enqueueWebhookEvent("p2p.payment.submitted", { id: data.orderId, utr: data.utr });
    return { ok: true };
  });

export const confirmP2pPaymentReceived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "p2p_confirm_payment_received" as never,
      {
        _order_id: data.orderId,
      } as never,
    );
    if (error) throw new Error(error.message);
    await enqueueWebhookEvent("p2p.order.completed", { id: data.orderId });
    return { ok: true };
  });

export const cancelP2pOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cancelInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "p2p_cancel_order" as never,
      {
        _order_id: data.orderId,
        _reason: data.reason ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    await enqueueWebhookEvent("p2p.order.cancelled", {
      id: data.orderId,
      reason: data.reason ?? null,
    });
    return { ok: true };
  });

export const raiseP2pDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => disputeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: disputeId, error } = await context.supabase.rpc(
      "p2p_raise_dispute" as never,
      {
        _order_id: data.orderId,
        _reason: data.reason,
        _details: data.details ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    await enqueueWebhookEvent("p2p.order.disputed", { id: data.orderId, dispute_id: disputeId });
    return { disputeId };
  });

export const sendP2pMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => messageInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: messageId, error } = await context.supabase.rpc(
      "p2p_send_message" as never,
      {
        _order_id: data.orderId,
        _body: data.body,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { messageId };
  });
