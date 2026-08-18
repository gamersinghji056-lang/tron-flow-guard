import { performance } from "node:perf_hooks";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createPlaintextApiKey,
  hasApiScope,
  hashApiSecret,
  parsePlaintextApiKey,
  verifyApiSecret,
} from "@/lib/api-crypto";
import { API_SCOPES, type ApiScope } from "@/lib/api-scopes";

interface ApiKeyRow {
  id: string;
  key_id: string;
  name: string;
  secret_hash: string;
  permissions: string[] | null;
  status: string;
  revoked_at: string | null;
  request_count: number | null;
}

export interface ApiPrincipal {
  apiKeyId: string;
  keyId: string;
  scopes: string[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export function jsonError(error: unknown): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof z.ZodError) {
    return jsonResponse(
      {
        error: {
          code: "validation_error",
          message: "Request validation failed",
          details: error.flatten(),
        },
      },
      { status: 422 },
    );
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return jsonResponse({ error: { code: "internal_error", message } }, { status: 500 });
}

function readApiKey(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return request.headers.get("x-api-key");
}

async function assertRateLimit(apiKeyId: string, limitPerMinute = 120) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("api_request_logs")
    .select("id", { count: "exact", head: true })
    .eq("api_key_id", apiKeyId as never)
    .gte("created_at", since as never);
  if (error) return;
  if ((count ?? 0) >= limitPerMinute) {
    throw new ApiError(429, "rate_limited", "API rate limit exceeded");
  }
}

export async function authenticateApiRequest(
  request: Request,
  requiredScopes: readonly ApiScope[] = [],
): Promise<ApiPrincipal> {
  const raw = readApiKey(request);
  if (!raw) throw new ApiError(401, "missing_api_key", "API key is required");

  const parsed = parsePlaintextApiKey(raw);
  if (!parsed) throw new ApiError(401, "invalid_api_key", "API key is invalid");

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, key_id, name, secret_hash, permissions, status, revoked_at, request_count")
    .eq("key_id", parsed.keyId as never)
    .maybeSingle();
  if (error) throw new ApiError(500, "api_key_lookup_failed", error.message);
  const row = data as ApiKeyRow | null;
  if (!row || !verifyApiSecret(parsed.secret, row.secret_hash)) {
    throw new ApiError(401, "invalid_api_key", "API key is invalid");
  }
  if (row.revoked_at || row.status === "revoked") {
    throw new ApiError(401, "api_key_revoked", "API key has been revoked");
  }
  if (row.status !== "active") {
    throw new ApiError(403, "api_key_disabled", "API key is disabled");
  }

  for (const scope of requiredScopes) {
    if (!hasApiScope(row.permissions, scope)) {
      throw new ApiError(403, "insufficient_scope", `Missing required scope: ${scope}`);
    }
  }

  await assertRateLimit(row.id);
  await supabaseAdmin
    .from("api_keys")
    .update({
      last_used_at: new Date().toISOString(),
      request_count: (row.request_count ?? 0) + 1,
    } as never)
    .eq("id", row.id as never);

  return {
    apiKeyId: row.id,
    keyId: row.key_id,
    scopes: row.permissions ?? [],
  };
}

export async function withApiRequest<T>(
  request: Request,
  requiredScopes: readonly ApiScope[],
  handler: (principal: ApiPrincipal) => Promise<T>,
): Promise<Response> {
  const startedAt = performance.now();
  let principal: ApiPrincipal | null = null;
  let statusCode = 200;
  const requestId = crypto.randomUUID();
  try {
    principal = await authenticateApiRequest(request, requiredScopes);
    const result = await handler(principal);
    if (result instanceof Response) {
      statusCode = result.status;
      return result;
    }
    return jsonResponse(result);
  } catch (error) {
    const response = jsonError(error);
    statusCode = response.status;
    return response;
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    try {
      await supabaseAdmin.from("api_request_logs").insert({
        api_key_id: principal?.apiKeyId ?? null,
        key_id: principal?.keyId ?? null,
        method: request.method,
        path: new URL(request.url).pathname,
        status_code: statusCode,
        duration_ms: durationMs,
        request_id: requestId,
      } as never);
    } catch {
      // Logging failure must not change the API response.
    }
  }
}

export async function getCachedIdempotentResponse(
  principal: ApiPrincipal,
  request: Request,
): Promise<Response | null> {
  const key = request.headers.get("idempotency-key");
  if (!key) return null;
  const endpoint = `${request.method} ${new URL(request.url).pathname}`;
  const { data } = await supabaseAdmin
    .from("api_idempotency")
    .select("response, status_code")
    .eq("api_key_id", principal.apiKeyId as never)
    .eq("idempotency_key", `${endpoint}:${key}` as never)
    .maybeSingle();
  const row = data as { response: unknown; status_code: number } | null;
  if (!row) return null;
  return jsonResponse(row.response, { status: row.status_code });
}

export async function saveIdempotentResponse(
  principal: ApiPrincipal,
  request: Request,
  response: unknown,
  statusCode = 200,
) {
  const key = request.headers.get("idempotency-key");
  if (!key) return;
  const endpoint = `${request.method} ${new URL(request.url).pathname}`;
  await supabaseAdmin.from("api_idempotency").insert({
    api_key_id: principal.apiKeyId,
    idempotency_key: `${endpoint}:${key}`,
    endpoint,
    response: response as never,
    status_code: statusCode,
  } as never);
}

export async function createApiKeyRecord(input: {
  name: string;
  scopes: readonly string[];
  actorId: string;
}) {
  const generated = createPlaintextApiKey();
  const scopes = input.scopes.filter((scope) => API_SCOPES.includes(scope as ApiScope));
  if (scopes.length === 0)
    throw new ApiError(422, "invalid_scopes", "Select at least one valid scope");

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .insert({
      name: input.name,
      key_id: generated.keyId,
      secret_hash: hashApiSecret(generated.secret),
      permissions: scopes,
      status: "active",
      created_by: input.actorId,
    } as never)
    .select("id, key_id, name, permissions, status, created_at")
    .single();
  if (error || !data) throw new ApiError(500, "api_key_create_failed", error?.message ?? "Failed");
  return { key: generated.plaintext, record: data };
}
