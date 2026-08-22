import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { safeErrorMessage } from "@/lib/system-health-policy";

export type ServiceName =
  | "WEB"
  | "BLOCKCHAIN WORKER"
  | "TELEGRAM WORKER"
  | "ORDER WORKER"
  | "SUPABASE"
  | "API"
  | "WEBHOOKS";

export type HealthStatus = "HEALTHY" | "DEGRADED" | "FAILED" | "UNKNOWN";

export { safeErrorMessage };

export async function writeServiceHeartbeat(input: {
  service: ServiceName;
  status: HealthStatus;
  message?: string | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const failed = input.status === "DEGRADED" || input.status === "FAILED";
  const message = input.message ? safeErrorMessage(input.message) : null;
  await supabaseAdmin.from("service_heartbeats" as never).upsert(
    {
      service: input.service,
      status: input.status,
      last_heartbeat_at: now,
      last_success_at: failed ? undefined : now,
      last_error_at: failed ? now : undefined,
      last_failure_at: failed ? now : undefined,
      last_error_code: failed ? (input.errorCode ?? null) : null,
      last_error_message: failed ? message : null,
      error_count_24h: failed ? 1 : 0,
      metadata: input.metadata ?? {},
      updated_at: now,
    } as never,
    { onConflict: "service" },
  );
}

export async function recordSystemError(input: {
  service: ServiceName;
  severity?: "info" | "warning" | "error" | "critical";
  code?: string | null;
  message: unknown;
  stage?: string | null;
  relatedOrderId?: string | null;
  relatedUserId?: string | null;
  txid?: string | null;
  walletId?: string | null;
  address?: string | null;
  retryable?: boolean;
  metadata?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("system_error_logs" as never).insert({
    service: input.service,
    severity: input.severity ?? "error",
    error_code: input.code ?? null,
    safe_message: safeErrorMessage(input.message),
    stage: input.stage ?? null,
    related_order_id: input.relatedOrderId ?? null,
    related_user_id: input.relatedUserId ?? null,
    related_txid: input.txid ?? null,
    wallet_id: input.walletId ?? null,
    address: input.address ?? null,
    retryable: input.retryable ?? false,
    metadata: input.metadata ?? {},
  } as never);
}
