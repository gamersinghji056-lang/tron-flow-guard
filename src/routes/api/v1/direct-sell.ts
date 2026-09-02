import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ApiError,
  getCachedIdempotentResponse,
  saveIdempotentResponse,
  withApiRequest,
} from "@/lib/api-auth.server";
import { enqueueWebhookEvent } from "@/lib/webhooks.server";

async function walletHasPurposeAssignment(walletId: string, purpose: string) {
  const { data, error } = await supabaseAdmin
    .from("wallet_purpose_assignments" as never)
    .select("wallet_id")
    .eq("wallet_id", walletId as never)
    .eq("purpose", purpose as never)
    .eq("is_active", true as never)
    .maybeSingle();
  if (error && error.code !== "42P01") throw new Error(error.message);
  return Boolean(data);
}

async function findCompanyWalletForPurpose(network: string, purpose: string) {
  const { data, error } = await supabaseAdmin
    .from("wallets")
    .select("id, address, network, purpose")
    .eq("network", network as never)
    .eq("is_active", true as never)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  for (const wallet of (data ?? []) as Array<{
    id: string;
    address: string;
    network: string;
    purpose?: string | null;
  }>) {
    if (wallet.purpose === purpose || (await walletHasPurposeAssignment(wallet.id, purpose))) {
      return wallet;
    }
  }
  return null;
}

export const Route = createFileRoute("/api/v1/direct-sell")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApiRequest(request, ["direct_sell:read"], async () => {
          const url = new URL(request.url);
          const userId = url.searchParams.get("user_id");
          let query = (
            supabaseAdmin.from("direct_sell_orders" as never) as never as {
              select: (columns: string) => {
                order: (
                  column: string,
                  options: { ascending: boolean },
                ) => {
                  limit: (
                    count: number,
                  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
                };
                eq: (
                  column: string,
                  value: unknown,
                ) => {
                  order: (
                    column: string,
                    options: { ascending: boolean },
                  ) => {
                    limit: (
                      count: number,
                    ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
                  };
                };
              };
            }
          )
            .select("*")
            .order("created_at", { ascending: false })
            .limit(Math.min(Number(url.searchParams.get("limit") ?? 50), 100));
          if (userId) {
            const filtered = (
              supabaseAdmin.from("direct_sell_orders" as never) as never as {
                select: (columns: string) => {
                  eq: (
                    column: string,
                    value: unknown,
                  ) => {
                    order: (
                      column: string,
                      options: { ascending: boolean },
                    ) => {
                      limit: (
                        count: number,
                      ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
                    };
                  };
                };
              }
            )
              .select("*")
              .eq("user_id", userId);
            query = filtered
              .order("created_at", { ascending: false })
              .limit(Math.min(Number(url.searchParams.get("limit") ?? 50), 100)) as never;
          }
          const { data, error } = await query;
          if (error) throw new ApiError(500, "direct_sell_list_failed", error.message);
          return { orders: data ?? [] };
        }),
      POST: async ({ request }) =>
        withApiRequest(request, ["direct_sell:create"], async (principal) => {
          const cached = await getCachedIdempotentResponse(principal, request);
          if (cached) return cached;
          const input = z
            .object({
              user_id: z.string().uuid(),
              amount: z.number().positive().max(1_000_000),
              payment_method_id: z.string().uuid().optional(),
            })
            .parse(await request.json());

          const { data: settings } = await supabaseAdmin
            .from("system_settings")
            .select("key, value")
            .in("key", [
              "active_network",
              "required_confirmations",
              "deposit_expiry_minutes",
              "direct_sell_rate_inr",
              "direct_sell_min_usdt",
              "direct_sell_max_usdt",
            ]);
          const map = Object.fromEntries(
            ((settings ?? []) as { key: string; value: unknown }[]).map((row) => [
              row.key,
              row.value,
            ]),
          );
          const rate = Number(map["direct_sell_rate_inr"] ?? 0);
          const min = Number(map["direct_sell_min_usdt"] ?? 1);
          const max = Number(map["direct_sell_max_usdt"] ?? 1_000_000);
          if (rate <= 0)
            throw new ApiError(503, "direct_sell_disabled", "Direct sell rate is not configured");
          if (input.amount < min || input.amount > max) {
            throw new ApiError(
              422,
              "amount_out_of_range",
              `Amount must be between ${min} and ${max} USDT`,
            );
          }
          const network = (map["active_network"] as string) ?? "trc20-mainnet";
          const requiredConfirmations = Number(map["required_confirmations"] ?? 16) || 16;
          const expiryMinutes = Number(map["deposit_expiry_minutes"] ?? 120) || 120;

          const wallet = await findCompanyWalletForPurpose(network, "DIRECT_SELL");
          if (!wallet) throw new ApiError(503, "wallet_unavailable", "No active company wallet");

          const expiresAt = new Date(Date.now() + expiryMinutes * 60_000).toISOString();
          const expectedInr = Math.round(input.amount * rate * 100) / 100;
          const directSellTable = supabaseAdmin.from("direct_sell_orders" as never) as never as {
            insert: (value: unknown) => {
              select: (columns: string) => {
                single: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
              };
            };
            update: (value: unknown) => {
              eq: (column: string, value: unknown) => Promise<unknown>;
            };
          };
          const { data: order, error: orderError } = await directSellTable
            .insert({
              user_id: input.user_id,
              wallet_id: (wallet as { id: string }).id,
              network: (wallet as { network: string }).network,
              expected_usdt: input.amount,
              remaining_usdt: input.amount,
              locked_rate_inr: rate,
              expected_inr: expectedInr,
              assigned_company_address: (wallet as { address: string }).address,
              required_confirmations: requiredConfirmations,
              expires_at: expiresAt,
              payment_method_id: input.payment_method_id ?? null,
              status: "waiting_for_usdt",
            } as never)
            .select("*")
            .single();
          if (orderError || !order)
            throw new ApiError(500, "direct_sell_create_failed", orderError?.message ?? "Failed");

          const orderId = (order as { id: string }).id;
          const { data: deposit, error: depositError } = await supabaseAdmin
            .from("deposit_requests")
            .insert({
              user_id: input.user_id,
              wallet_id: (wallet as { id: string }).id,
              network: (wallet as { network: string }).network,
              expected_amount: input.amount,
              required_confirmations: requiredConfirmations,
              expires_at: expiresAt,
              purpose: "direct_sell",
              direct_sell_order_id: orderId,
            } as never)
            .select("id")
            .single();
          if (depositError || !deposit)
            throw new ApiError(
              500,
              "direct_sell_deposit_failed",
              depositError?.message ?? "Failed",
            );
          await directSellTable
            .update({ deposit_request_id: (deposit as { id: string }).id } as never)
            .eq("id", orderId as never);

          await enqueueWebhookEvent("direct_sell.created", {
            id: orderId,
            user_id: input.user_id,
            amount: input.amount,
          });
          const response = {
            order: { ...order, deposit_request_id: (deposit as { id: string }).id },
          };
          await saveIdempotentResponse(principal, request, response, 200);
          return response;
        }),
    },
  },
});
