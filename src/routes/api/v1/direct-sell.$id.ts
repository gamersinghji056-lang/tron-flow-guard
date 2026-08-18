import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ApiError, withApiRequest } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/direct-sell/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApiRequest(request, ["direct_sell:read"], async () => {
          const routeParams = params as { id: string };
          const directSellTable = supabaseAdmin.from("direct_sell_orders" as never) as never as {
            select: (columns: string) => {
              eq: (
                column: string,
                value: unknown,
              ) => {
                maybeSingle: () => Promise<{
                  data: unknown | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
          const { data, error } = await directSellTable
            .select("*")
            .eq("id", routeParams.id)
            .maybeSingle();
          if (error) throw new ApiError(500, "direct_sell_lookup_failed", error.message);
          if (!data)
            throw new ApiError(404, "direct_sell_not_found", "Direct sell order was not found");
          return { order: data };
        }),
    },
  },
});
