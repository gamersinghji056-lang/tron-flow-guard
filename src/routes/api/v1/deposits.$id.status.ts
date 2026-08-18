import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ApiError, withApiRequest } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/deposits/$id/status")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApiRequest(request, ["deposit:read"], async () => {
          const routeParams = params as { id: string };
          const { data, error } = await supabaseAdmin
            .from("deposit_requests")
            .select(
              "id, order_ref, status, confirmations, required_confirmations, credited, txid, received_amount, detected_at, confirmed_at, failure_reason, updated_at",
            )
            .eq("id", routeParams.id as never)
            .maybeSingle();
          if (error) throw new ApiError(500, "deposit_status_failed", error.message);
          if (!data) throw new ApiError(404, "deposit_not_found", "Deposit was not found");
          return { status: data };
        }),
    },
  },
});
