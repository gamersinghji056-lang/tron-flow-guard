import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhook-events";
import { formatWebhookSignature, signWebhookBody } from "@/lib/webhook-crypto";

interface EndpointRow {
  id: string;
  url: string;
  secret: string;
  failure_count: number | null;
}

interface DeliveryRow {
  id: string;
  endpoint_id: string;
  event: string;
  event_key: string;
  payload: unknown;
  attempts: number;
}

function retryAt(attempt: number): string {
  const seconds = Math.min(21_600, Math.max(60, 60 * 2 ** Math.min(attempt, 8)));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function enqueueWebhookEvent(
  event: WebhookEvent,
  data: Record<string, unknown>,
  eventKey = `${event}:${data["id"] ?? data["order_id"] ?? data["txid"] ?? crypto.randomUUID()}`,
) {
  const createdAt = new Date().toISOString();
  const payload = {
    event_id: eventKey,
    event,
    created_at: createdAt,
    data,
  };

  const { data: endpoints } = await supabaseAdmin
    .from("webhook_endpoints")
    .select("id")
    .eq("status", "active" as never)
    .contains("events", [event] as never);

  for (const endpoint of (endpoints ?? []) as { id: string }[]) {
    await supabaseAdmin.from("webhook_deliveries").upsert(
      {
        endpoint_id: endpoint.id,
        event,
        event_key: eventKey,
        payload: payload as never,
        status: "pending",
        next_retry_at: new Date().toISOString(),
      } as never,
      { onConflict: "endpoint_id,event_key", ignoreDuplicates: true },
    );
  }

  return payload;
}

async function loadEndpoint(id: string): Promise<EndpointRow | null> {
  const { data } = await supabaseAdmin
    .from("webhook_endpoints")
    .select("id, url, secret, failure_count")
    .eq("id", id as never)
    .eq("status", "active" as never)
    .maybeSingle();
  return data as EndpointRow | null;
}

export async function deliverWebhook(delivery: DeliveryRow) {
  const endpoint = await loadEndpoint(delivery.endpoint_id);
  if (!endpoint) {
    await supabaseAdmin
      .from("webhook_deliveries")
      .update({ status: "failed", last_error: "Endpoint disabled or missing" } as never)
      .eq("id", delivery.id as never);
    return;
  }

  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = formatWebhookSignature(signWebhookBody(endpoint.secret, timestamp, body));
  const attempts = delivery.attempts + 1;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "TRONDESK-Webhooks/1.0",
        "x-trondesk-event": delivery.event,
        "x-trondesk-delivery": delivery.event_key,
        "x-trondesk-timestamp": timestamp,
        "x-trondesk-signature": signature,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (response.ok) {
      await supabaseAdmin
        .from("webhook_deliveries")
        .update({
          status: "delivered",
          attempts,
          response_status: response.status,
          last_error: null,
          delivered_at: new Date().toISOString(),
        } as never)
        .eq("id", delivery.id as never);
      await supabaseAdmin
        .from("webhook_endpoints")
        .update({
          failure_count: 0,
          last_delivery_at: new Date().toISOString(),
          last_error: null,
        } as never)
        .eq("id", endpoint.id as never);
      return;
    }

    const permanent =
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 429;
    const status = permanent || attempts >= 12 ? "failed" : "pending";
    const lastError = `HTTP ${response.status}`;
    await supabaseAdmin
      .from("webhook_deliveries")
      .update({
        status,
        attempts,
        response_status: response.status,
        last_error: lastError,
        next_retry_at: status === "pending" ? retryAt(attempts) : null,
      } as never)
      .eq("id", delivery.id as never);
    await supabaseAdmin
      .from("webhook_endpoints")
      .update({
        failure_count: (endpoint.failure_count ?? 0) + 1,
        last_error: lastError,
      } as never)
      .eq("id", endpoint.id as never);
  } catch (error) {
    const lastError = error instanceof Error ? error.message : "Webhook request failed";
    await supabaseAdmin
      .from("webhook_deliveries")
      .update({
        status: attempts >= 12 ? "failed" : "pending",
        attempts,
        last_error: lastError,
        next_retry_at: attempts >= 12 ? null : retryAt(attempts),
      } as never)
      .eq("id", delivery.id as never);
  }
}

export async function processWebhookRetries(limit = 20) {
  const { data } = await supabaseAdmin
    .from("webhook_deliveries")
    .select("id, endpoint_id, event, event_key, payload, attempts")
    .eq("status", "pending" as never)
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}` as never)
    .order("created_at", { ascending: true })
    .limit(limit);

  for (const delivery of (data ?? []) as DeliveryRow[]) {
    await deliverWebhook(delivery);
  }

  return { processed: data?.length ?? 0 };
}
