import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ApiError, withApiRequest } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/transactions/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApiRequest(request, ["transaction:read"], async () => {
          const routeParams = params as { id: string };
          const { data, error } = await supabaseAdmin
            .from("transactions")
            .select("*")
            .or(`id.eq.${routeParams.id},txid.eq.${routeParams.id}` as never)
            .maybeSingle();
          if (error) throw new ApiError(500, "transaction_lookup_failed", error.message);
          if (!data) throw new ApiError(404, "transaction_not_found", "Transaction was not found");
          return { transaction: data };
        }),
    },
  },
});
