import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { withApiRequest } from "@/lib/api-auth.server";
import { recordSystemError, writeServiceHeartbeat } from "@/lib/system-health.server";

export const Route = createFileRoute("/api/v1/health")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApiRequest(request, [], async () => {
          try {
            const { data } = await supabaseAdmin
              .from("service_health")
              .select("service, status, detail, last_ok_at, last_error, metadata, updated_at")
              .in("service", ["blockchain-worker", "tron-listener"] as never);
            await Promise.all([
              writeServiceHeartbeat({
                service: "WEB",
                status: "HEALTHY",
                message: "Health endpoint served",
              }),
              writeServiceHeartbeat({
                service: "API",
                status: "HEALTHY",
                message: "Authenticated API health endpoint served",
              }),
              writeServiceHeartbeat({
                service: "SUPABASE",
                status: "HEALTHY",
                message: "Supabase health query succeeded",
              }),
            ]);
            return {
              ok: (data ?? []).some(
                (row) =>
                  (row as { service: string; status: string }).service === "blockchain-worker" &&
                  (row as { status: string }).status === "ok",
              ),
              services: data ?? [],
            };
          } catch (error) {
            await recordSystemError({
              service: "API",
              severity: "error",
              code: "API_HEALTH_ERROR",
              message: error,
              retryable: true,
            });
            await writeServiceHeartbeat({
              service: "API",
              status: "DEGRADED",
              message: error instanceof Error ? error.message : "API health failed",
              errorCode: "API_HEALTH_ERROR",
            });
            throw error;
          }
        }),
    },
  },
});
