import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { withApiRequest } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/health")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApiRequest(request, [], async () => {
          const { data } = await supabaseAdmin
            .from("service_health")
            .select("service, status, detail, last_ok_at, last_error, metadata, updated_at")
            .in("service", ["blockchain-worker", "tron-listener"] as never);
          return {
            ok: (data ?? []).some(
              (row) =>
                (row as { service: string; status: string }).service === "blockchain-worker" &&
                (row as { status: string }).status === "ok",
            ),
            services: data ?? [],
          };
        }),
    },
  },
});
