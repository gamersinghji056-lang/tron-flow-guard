import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ApiError, withApiRequest } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/deposits/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApiRequest(request, ["deposit:read"], async () => {
          const routeParams = params as { id: string };
          const { data, error } = await supabaseAdmin
            .from("deposit_requests")
            .select("*")
            .eq("id", routeParams.id as never)
            .maybeSingle();
          if (error) throw new ApiError(500, "deposit_lookup_failed", error.message);
          if (!data) throw new ApiError(404, "deposit_not_found", "Deposit was not found");
          return { deposit: data };
        }),
    },
  },
});
