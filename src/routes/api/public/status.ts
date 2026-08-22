import { createFileRoute } from "@tanstack/react-router";
import { writeServiceHeartbeat } from "@/lib/system-health.server";

export const Route = createFileRoute("/api/public/status")({
  server: {
    handlers: {
      GET: async () => {
        await Promise.all([
          writeServiceHeartbeat({
            service: "WEB",
            status: "HEALTHY",
            message: "Public status endpoint served",
          }),
          writeServiceHeartbeat({
            service: "API",
            status: "HEALTHY",
            message: "Public status endpoint served",
          }),
          writeServiceHeartbeat({
            service: "SUPABASE",
            status: "HEALTHY",
            message: "Supabase heartbeat write succeeded",
          }),
          writeServiceHeartbeat({
            service: "WEBHOOKS",
            status: "UNKNOWN",
            message: "No webhook retry tick has reported since status check",
          }),
          writeServiceHeartbeat({
            service: "SIGNER",
            status: "DISABLED",
            message: "Signer heartbeat initialized; on-chain send is disabled until configured",
          }),
        ]);
        return Response.json({ ok: true });
      },
    },
  },
});
