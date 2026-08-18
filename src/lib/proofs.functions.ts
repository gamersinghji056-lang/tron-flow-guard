import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const proofKind = z.enum(["p2p", "direct_sell", "vendor"]);

const uploadInput = z.object({
  orderType: proofKind,
  orderId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(160),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
});

const registerInput = uploadInput.extend({
  storagePath: z.string().trim().min(10).max(500),
});

const viewInput = z.object({
  proofPath: z.string().trim().min(10).max(500),
});

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export const createPaymentProofUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => uploadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${context.userId}/${data.orderType}/${data.orderId}/${crypto.randomUUID()}-${safeFileName(data.fileName)}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("payment-proofs")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const registerPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registerInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.storagePath.startsWith(`${context.userId}/`)) {
      throw new Error("Invalid payment proof path");
    }
    const { error } = await context.supabase.from("payment_proofs" as never).insert({
      user_id: context.userId,
      order_type: data.orderType,
      order_id: data.orderId,
      storage_path: data.storagePath,
      file_name: data.fileName,
      content_type: data.contentType,
      size_bytes: data.sizeBytes,
    } as never);
    if (error) throw new Error(error.message);
    return { path: data.storagePath };
  });

export const getPaymentProofViewUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => viewInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: proof, error } = await context.supabase
      .from("payment_proofs" as never)
      .select("storage_path")
      .eq("storage_path", data.proofPath as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!proof) throw new Error("Payment proof is not available");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("payment-proofs")
      .createSignedUrl(data.proofPath, 60);
    if (signError) throw new Error(signError.message);
    return { url: signed.signedUrl };
  });
