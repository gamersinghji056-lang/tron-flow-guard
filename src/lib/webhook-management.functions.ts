import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";
import { enqueueWebhookEvent, processWebhookRetries } from "@/lib/webhooks.server";

const createWebhookInput = z.object({
  url: z.string().url(),
  description: z.string().trim().max(160).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

const webhookIdInput = z.object({
  id: z.string().uuid(),
});

export const createWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createWebhookInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.WEBHOOKS_MANAGE);
    const secret = `whsec_${randomBytes(32).toString("base64url")}`;
    const { data: row, error } = await supabaseAdmin
      .from("webhook_endpoints")
      .insert({
        url: data.url,
        description: data.description ?? null,
        events: data.events,
        secret,
        status: "active",
        created_by: context.userId,
      } as never)
      .select("id, url, description, events, status, created_at")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Could not create webhook endpoint");
    return { endpoint: row, secret };
  });

export const testWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => webhookIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.WEBHOOKS_MANAGE);
    await enqueueWebhookEvent(
      "deposit.detected",
      { id: data.id, test: true, message: "Webhook test event" },
      `test:${data.id}:${Date.now()}`,
    );
    const result = await processWebhookRetries(5);
    return { ok: true, ...result };
  });
