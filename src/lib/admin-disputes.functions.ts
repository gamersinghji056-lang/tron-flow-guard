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
    const { requireAdmin } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
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
