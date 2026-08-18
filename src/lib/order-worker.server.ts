import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function runOrderWorkerTick() {
  const started = performance.now();
  const { data, error } = await supabaseAdmin.rpc("process_order_timers" as never);
  const durationMs = Math.round(performance.now() - started);
  if (error) {
    await persistOrderWorkerHealth("DEGRADED", durationMs, error.message);
    throw new Error(error.message);
  }
  await persistOrderWorkerHealth("OK", durationMs, null);
  return { result: data, durationMs };
}

async function persistOrderWorkerHealth(
  status: "OK" | "DEGRADED",
  durationMs: number,
  error: string | null,
) {
  const now = new Date().toISOString();
  await supabaseAdmin.from("service_health" as never).upsert(
    {
      service: "order-worker",
      status,
      detail: error ?? `Last timer tick completed in ${durationMs}ms`,
      last_ok_at: error ? undefined : now,
      last_error: error,
      last_error_at: error ? now : null,
      metadata: {
        heartbeat_at: now,
        tick_duration_ms: durationMs,
      },
      updated_at: now,
    } as never,
    { onConflict: "service" },
  );
}
