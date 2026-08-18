/**
 * Blockchain listener HTTP entry point.
 *
 * Called by the scheduled job (pg_cron -> pg_net) and by the admin/trader
 * "run now" action. Authenticated with the project publishable key sent in the
 * `apikey` header, since `/api/public/*` bypasses site auth.
 */
import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const expectedKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const providedKey = request.headers.get("apikey") ?? request.headers.get("x-listener-key") ?? "";

  if (!expectedKey || providedKey !== expectedKey) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { runListenerTick } = await import("@/lib/listener.server");

  try {
    const result = await runListenerTick("http");
    return Response.json(result, { status: result.ok ? 200 : 207 });
  } catch (error) {
    console.error("[listener] tick failed", error);
    return Response.json(
      { ok: false, error: "Listener tick failed. See server logs." },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/public/listener/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
