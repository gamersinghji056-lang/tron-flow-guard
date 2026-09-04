import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enqueueWebhookEvent } from "@/lib/webhooks.server";
import { normalizeP2pMarketplaceAd } from "@/lib/p2p-state";
import type { Database } from "@/integrations/supabase/types";

const createAdInput = z.object({
  side: z.enum(["buy", "sell"]),
  price: z.number().positive(),
  availableUsdt: z.number().positive(),
  minOrderInr: z.number().positive(),
  maxOrderInr: z.number().positive(),
  paymentMethods: z.array(z.string().min(2)).default(["upi"]),
  paymentMethodId: z.string().uuid().optional(),
  sourceWalletId: z.string().uuid().optional(),
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
  sourceWalletId: z.string().uuid().optional(),
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

const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

const avatarUploadInput = z.object({
  fileName: z.string().trim().min(1).max(160),
  contentType: z.enum(imageTypes),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(2 * 1024 * 1024),
});

const proofAttachmentUploadInput = orderIdInput.extend({
  fileName: z.string().trim().min(1).max(160),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});

const registerProofAttachmentInput = proofAttachmentUploadInput.extend({
  messageId: z.string().uuid(),
  storagePath: z.string().trim().min(10).max(500),
  attachmentType: z.enum(["image", "payment_proof", "transaction_screenshot"]).default("image"),
});

const attachmentViewInput = z.object({
  attachmentId: z.string().uuid(),
});

const participantProfileInput = z.object({
  userId: z.string().uuid(),
});

const riskAckInput = z.object({
  policyVersion: z.string().trim().min(1).max(40).default("v1"),
});

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

async function requireActiveSellUpi(
  supabaseClient: typeof import("@/integrations/supabase/client.server").supabaseAdmin,
  userId: string,
  paymentMethodId: string | undefined,
) {
  if (!paymentMethodId) throw new Error("Add UPI ID first");
  const { data, error } = await supabaseClient
    .from("payment_methods")
    .select("id")
    .eq("id", paymentMethodId)
    .eq("user_id", userId)
    .eq("kind", "upi")
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Select an active saved UPI account");
}

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
  user_id: string | null;
  display_name: string | null;
  completed_orders: number | null;
  total_orders: number | null;
  status: string | null;
}

async function requireTraderP2pAccess(client: SupabaseClient<Database>, userId: string) {
  const { readAccess } = await import("@/lib/access.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const access = await readAccess(client, userId);
  if (access.role === "vendor") {
    throw new Error("Vendor accounts use Vendor Trade, not Trader P2P.");
  }
  const { data, error } = await supabaseAdmin
    .from("trading_vendors" as never)
    .select("id, status")
    .eq("user_id", userId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) {
    throw new Error("Vendor accounts use Vendor Trade, not Trader P2P.");
  }
}

export const fetchP2pMarketplace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireTraderP2pAccess(context.supabase, context.userId);
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
          .select("id, user_id, display_name, completed_orders, total_orders, status")
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
    await requireTraderP2pAccess(context.supabase, context.userId);
    if (data.side === "sell") {
      await requireActiveSellUpi(context.supabase, context.userId, data.paymentMethodId);
    }
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
        _source_wallet_id: data.sourceWalletId ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    return ad;
  });

export const updateP2pAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateAdInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireTraderP2pAccess(context.supabase, context.userId);
    if (data.side === "sell") {
      await requireActiveSellUpi(context.supabase, context.userId, data.paymentMethodId);
    }
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
    await requireTraderP2pAccess(context.supabase, context.userId);
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
    await requireTraderP2pAccess(context.supabase, context.userId);
    const { data: hasAck, error: ackError } = await context.supabase.rpc(
      "p2p_has_risk_acknowledgement" as never,
      { _policy_version: "v1" } as never,
    );
    if (ackError) throw new Error(ackError.message);
    if (!hasAck) {
      throw new Error("Review and acknowledge the P2P risk warning before creating an order.");
    }
    const { data: rows, error } = await context.supabase.rpc(
      "p2p_create_order_from_ad" as never,
      {
        _advertisement_id: data.adId,
        _usdt: data.amountUsdt,
        _payment_method_id: data.paymentMethodId ?? null,
        _source_wallet_id: data.sourceWalletId ?? null,
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

export const getP2pRiskAcknowledgement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc(
      "p2p_has_risk_acknowledgement" as never,
      { _policy_version: "v1" } as never,
    );
    if (error) throw new Error(error.message);
    return { acknowledged: Boolean(data), policyVersion: "v1" };
  });

export const acknowledgeP2pRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => riskAckInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "p2p_acknowledge_risk" as never,
      { _policy_version: data.policyVersion } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getP2pParticipantProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => participantProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase.rpc(
      "p2p_participant_profile" as never,
      { _user_id: data.userId } as never,
    );
    if (error) throw new Error(error.message);
    return profile;
  });

export const createP2pAvatarUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => avatarUploadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${context.userId}/avatar-${crypto.randomUUID()}-${safeFileName(data.fileName)}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("user-avatars")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const registerP2pAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    avatarUploadInput.extend({ storagePath: z.string().trim().min(10).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.storagePath.startsWith(`${context.userId}/`)) {
      throw new Error("Invalid avatar path");
    }
    const { error } = await context.supabase
      .from("profiles" as never)
      .update({
        avatar_path: data.storagePath,
        avatar_updated_at: new Date().toISOString(),
      } as never)
      .eq("id", context.userId as never);
    if (error) throw new Error(error.message);
    return { path: data.storagePath };
  });

export const getP2pAvatarViewUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ avatarPath: z.string().min(3) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("user-avatars")
      .createSignedUrl(data.avatarPath, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const createP2pAttachmentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => proofAttachmentUploadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${context.userId}/p2p/${data.orderId}/${crypto.randomUUID()}-${safeFileName(data.fileName)}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("p2p-evidence")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const registerP2pAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registerProofAttachmentInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.storagePath.startsWith(`${context.userId}/p2p/${data.orderId}/`)) {
      throw new Error("Invalid P2P evidence path");
    }
    const { error } = await context.supabase.from("p2p_message_attachments" as never).insert({
      message_id: data.messageId,
      order_id: data.orderId,
      uploader_id: context.userId,
      storage_bucket: "p2p-evidence",
      storage_path: data.storagePath,
      mime_type: data.contentType,
      file_size_bytes: data.sizeBytes,
      attachment_type: data.attachmentType,
    } as never);
    if (error) throw new Error(error.message);
    return { path: data.storagePath };
  });

export const getP2pAttachmentViewUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => attachmentViewInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: attachment, error } = await context.supabase
      .from("p2p_message_attachments" as never)
      .select("storage_path")
      .eq("id", data.attachmentId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!attachment) throw new Error("Attachment is not available");
    const path = (attachment as { storage_path?: string | null }).storage_path;
    if (!path) throw new Error("Attachment path is missing");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("p2p-evidence")
      .createSignedUrl(path, 120);
    if (signError) throw new Error(signError.message);
    return { url: signed.signedUrl };
  });
