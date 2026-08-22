import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createApiKeyRecord } from "@/lib/api-auth.server";
import { API_SCOPES } from "@/lib/api-scopes";

const createKeyInput = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
});

const revokeKeyInput = z.object({
  id: z.string().uuid(),
});

export const createAdminApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createKeyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.API_MANAGE);
    const created = await createApiKeyRecord({
      name: data.name,
      scopes: data.scopes,
      actorId: context.userId,
    });
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      actor_type: "admin",
      action: "api_key.created",
      entity_type: "api_key",
      entity_id: (created.record as { id: string }).id,
      metadata: {
        scopes: data.scopes,
        key_id: (created.record as { key_id: string }).key_id,
      } as never,
    });
    return created;
  });

export const revokeAdminApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => revokeKeyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.API_MANAGE);
    const { error } = await supabaseAdmin
      .from("api_keys")
      .update({ status: "revoked", revoked_at: new Date().toISOString() } as never)
      .eq("id", data.id as never);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      actor_type: "admin",
      action: "api_key.revoked",
      entity_type: "api_key",
      entity_id: data.id,
      metadata: {} as never,
    });
    return { ok: true };
  });
