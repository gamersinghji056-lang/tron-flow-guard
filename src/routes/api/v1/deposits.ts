import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ApiError,
  getCachedIdempotentResponse,
  saveIdempotentResponse,
  withApiRequest,
} from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/deposits")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApiRequest(request, ["deposit:create"], async (principal) => {
          const cached = await getCachedIdempotentResponse(principal, request);
          if (cached) return cached;
          const input = z
            .object({
              user_id: z.string().uuid(),
              amount: z.number().positive().max(1_000_000),
            })
            .parse(await request.json());

          const { data: settings } = await supabaseAdmin
            .from("system_settings")
            .select("key, value")
            .in("key", ["active_network", "required_confirmations", "deposit_expiry_minutes"]);
          const settingsMap = Object.fromEntries(
            ((settings ?? []) as { key: string; value: unknown }[]).map((row) => [
              row.key,
              row.value,
            ]),
          );
          const network = (settingsMap["active_network"] as string) ?? "trc20-nile";
          const requiredConfirmations = Number(settingsMap["required_confirmations"] ?? 16) || 16;
          const expiryMinutes = Number(settingsMap["deposit_expiry_minutes"] ?? 120) || 120;

          const { data: wallet } = await supabaseAdmin
            .from("wallets")
            .select("id, name, address, network")
            .eq("network", network as never)
            .eq("is_active", true as never)
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!wallet) throw new ApiError(503, "wallet_unavailable", "No active deposit wallet");

          const expiresAt = new Date(Date.now() + expiryMinutes * 60_000).toISOString();
          const { data: deposit, error } = await supabaseAdmin
            .from("deposit_requests")
            .insert({
              user_id: input.user_id,
              wallet_id: (wallet as { id: string }).id,
              network: (wallet as { network: string }).network,
              expected_amount: input.amount,
              required_confirmations: requiredConfirmations,
              expires_at: expiresAt,
              purpose: "deposit",
            } as never)
            .select(
              "id, order_ref, user_id, expected_amount, status, confirmations, required_confirmations, expires_at, created_at",
            )
            .single();
          if (error || !deposit)
            throw new ApiError(500, "deposit_create_failed", error?.message ?? "Failed");

          const response = {
            deposit,
            wallet: {
              address: (wallet as { address: string }).address,
              network: (wallet as { network: string }).network,
              name: (wallet as { name: string }).name,
            },
          };
          await saveIdempotentResponse(principal, request, response, 200);
          return response;
        }),
    },
  },
});
