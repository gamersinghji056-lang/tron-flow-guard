import { supabaseAdmin } from "./integrations/supabase/client.server";
import { runListenerTick } from "./lib/listener.server";
import { processWebhookRetries } from "./lib/webhooks.server";

const DEFAULT_POLL_MS = 15_000;
const DEFAULT_RECONCILE_EVERY_MS = 10 * 60_000;
const MAX_BACKOFF_MS = 2 * 60_000;

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const pollMs = numberEnv("LISTENER_POLL_MS", DEFAULT_POLL_MS);
const reconcileEveryMs = numberEnv("LISTENER_RECONCILE_EVERY_MS", DEFAULT_RECONCILE_EVERY_MS);
const startedAt = Date.now();

let stopping = false;
let consecutiveFailures = 0;
let lastReconcileAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeWorkerHealth(
  status: "ok" | "degraded" | "offline",
  detail: string,
  metadata: Record<string, unknown> = {},
) {
  await supabaseAdmin.from("service_health").upsert(
    {
      service: "blockchain-worker",
      status,
      detail,
      ...(status === "ok"
        ? { last_ok_at: new Date().toISOString(), last_error: null }
        : { last_error: detail, last_error_at: new Date().toISOString() }),
      metadata: {
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        pollMs,
        reconcileEveryMs,
        consecutiveFailures,
        ...metadata,
      },
    } as never,
    { onConflict: "service" },
  );
}

function installSignalHandlers() {
  const shutdown = (signal: NodeJS.Signals) => {
    stopping = true;
    void writeWorkerHealth("offline", `Worker received ${signal}; shutting down`).finally(() => {
      process.exit(0);
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function runForever() {
  installSignalHandlers();
  await writeWorkerHealth("ok", "Blockchain worker started");

  while (!stopping) {
    const tickStartedAt = Date.now();
    const mode = Date.now() - lastReconcileAt >= reconcileEveryMs ? "reconcile" : "fast";
    if (mode === "reconcile") lastReconcileAt = Date.now();

    try {
      const result = await runListenerTick(mode);
      consecutiveFailures = result.ok ? 0 : consecutiveFailures + 1;
      await writeWorkerHealth(
        result.ok ? "ok" : "degraded",
        result.ok
          ? `Last ${mode} tick completed in ${result.durationMs}ms`
          : `Last ${mode} tick completed with ${result.errors.length} error(s)`,
        {
          mode,
          latestBlock: result.latestBlock,
          addressesMonitored: result.addressesMonitored,
          addressesPolled: result.addressesPolled,
          eventsSeen: result.eventsSeen,
          newEvents: result.newEvents,
          transactionsRecorded: result.transactionsRecorded,
          depositsUpdated: result.depositsUpdated,
          depositsCredited: result.depositsCredited,
          walletsCredited: result.walletsCredited,
          timingsMs: result.timingsMs,
          errors: result.errors.slice(0, 5),
        },
      );
      try {
        const webhooks = await processWebhookRetries(numberEnv("WEBHOOK_RETRY_BATCH_SIZE", 20));
        if (webhooks.processed > 0) {
          await supabaseAdmin.from("service_health").upsert(
            {
              service: "webhook-worker",
              status: "ok",
              detail: `Processed ${webhooks.processed} webhook delivery attempt(s)`,
              last_ok_at: new Date().toISOString(),
              last_error: null,
              metadata: { processed: webhooks.processed },
            } as never,
            { onConflict: "service" },
          );
        }
      } catch (webhookError) {
        const message =
          webhookError instanceof Error ? webhookError.message : "Webhook retry pass failed";
        console.error("[webhook-worker]", webhookError);
        await supabaseAdmin.from("service_health").upsert(
          {
            service: "webhook-worker",
            status: "degraded",
            detail: message,
            last_error: message,
            last_error_at: new Date().toISOString(),
          } as never,
          { onConflict: "service" },
        );
      }
    } catch (error) {
      consecutiveFailures += 1;
      const message = error instanceof Error ? error.message : "Worker tick failed";
      console.error("[listener-worker]", error);
      await writeWorkerHealth("degraded", message, { mode });
    }

    const elapsed = Date.now() - tickStartedAt;
    const backoff = consecutiveFailures
      ? Math.min(MAX_BACKOFF_MS, pollMs * 2 ** Math.min(consecutiveFailures, 4))
      : pollMs;
    await sleep(Math.max(1_000, backoff - elapsed));
  }
}

runForever().catch((error) => {
  console.error("[listener-worker] fatal", error);
  process.exit(1);
});
