import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const disputeActionInput = z.object({
  disputeId: z.string().uuid(),
  action: z.enum(["request_evidence", "release", "refund", "reject"]),
  reason: z.string().trim().min(3).max(500),
});

export const resolveP2pDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => disputeActionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.DISPUTES_MANAGE);
    const { error } = await context.supabase.rpc(
      "admin_resolve_dispute" as never,
      {
        _dispute_id: data.disputeId,
        _action: data.action,
        _reason: data.reason,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
