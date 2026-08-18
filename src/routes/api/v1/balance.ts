import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ApiError, withApiRequest } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/balance")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApiRequest(request, ["balance:read"], async () => {
          const userId = new URL(request.url).searchParams.get("user_id");
          if (!userId)
            throw new ApiError(422, "missing_user_id", "user_id query parameter is required");
          const { data: profile, error } = await supabaseAdmin
            .from("profiles")
            .select("id, balance, locked_balance")
            .eq("id", userId as never)
            .maybeSingle();
          if (error) throw new ApiError(500, "balance_lookup_failed", error.message);
          if (!profile) throw new ApiError(404, "user_not_found", "User was not found");

          const { data: pendingDeposits } = await supabaseAdmin
            .from("deposit_requests")
            .select("expected_amount, received_amount")
            .eq("user_id", userId as never)
            .in("status", ["waiting", "detected", "confirming"] as never);
          const pending = (
            (pendingDeposits ?? []) as { expected_amount: unknown; received_amount: unknown }[]
          ).reduce((sum, row) => sum + Number(row.received_amount ?? row.expected_amount ?? 0), 0);
          return {
            user_id: userId,
            currency: "USDT",
            available: Number((profile as { balance: unknown }).balance ?? 0),
            locked: Number((profile as { locked_balance: unknown }).locked_balance ?? 0),
            pending,
          };
        }),
    },
  },
});
