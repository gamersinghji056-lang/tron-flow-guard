/**
 * Deposit + listener server functions (typed RPC used by the frontend).
 *
 * Thin wrappers only: server-only modules are imported inside handlers so the
 * service-role client never reaches a client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createDepositSchema = z.object({
  amount: z
    .number("Enter a valid amount")
    .positive("Amount must be greater than zero")
    .max(1_000_000, "Amount exceeds the per-request limit"),
});

export interface CreateDepositResult {
  id: string;
  orderRef: string;
  amount: number;
  walletAddress: string;
  walletName: string;
  network: string;
  requiredConfirmations: number;
  expiresAt: string;
}

/**
 * Creates a deposit request, assigns the active company wallet and records the
 * assignment in the audit log. Amount + wallet selection are server-side only.
 */
export const createDepositRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createDepositSchema.parse(input))
  .handler(async ({ data, context }): Promise<CreateDepositResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .in("key", ["active_network", "required_confirmations", "deposit_expiry_minutes"]);

    const settingsMap = Object.fromEntries((settings ?? []).map((row) => [row.key, row.value]));
    const network = (settingsMap["active_network"] as string) ?? "trc20-nile";
    const requiredConfirmations = Number(settingsMap["required_confirmations"] ?? 16) || 16;
    const expiryMinutes = Number(settingsMap["deposit_expiry_minutes"] ?? 120) || 120;

    // Wallet assignment strategy — today: default/active wallet for the active
    // network. The schema already supports per-trader and per-order wallets.
    const { data: wallets } = await supabaseAdmin
      .from("wallets")
      .select("id, name, address, network, is_default")
      .eq("network", network as never)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

    const wallet = wallets?.[0];
    if (!wallet) {
      throw new Error(
        "No active company wallet is configured for the current network. Please contact support.",
      );
    }

    const expiresAt = new Date(Date.now() + expiryMinutes * 60_000).toISOString();

    const { data: deposit, error } = await supabaseAdmin
      .from("deposit_requests")
      .insert({
        user_id: context.userId,
        wallet_id: wallet.id,
        network: wallet.network,
        expected_amount: data.amount,
        required_confirmations: requiredConfirmations,
        expires_at: expiresAt,
      })
      .select("id, order_ref, expected_amount, expires_at")
      .single();

    if (error || !deposit) {
      console.error("[deposits] create failed", error);
      throw new Error("Could not create the deposit request. Please try again.");
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      actor_type: "trader",
      action: "deposit.requested",
      entity_type: "deposit_request",
      entity_id: deposit.id,
      metadata: {
        amount: data.amount,
        wallet_id: wallet.id,
        wallet_address: wallet.address,
        network: wallet.network,
      } as never,
    });

    return {
      id: deposit.id,
      orderRef: deposit.order_ref,
      amount: Number(deposit.expected_amount),
      walletAddress: wallet.address,
      walletName: wallet.name,
      network: wallet.network,
      requiredConfirmations,
      expiresAt: deposit.expires_at,
    };
  });

/**
 * Signed-in trigger for an immediate listener pass (idempotent).
 *
 * `fast` polls only addresses with live orders/recent activity — used by the
 * short-interval heartbeat on deposit screens. `manual` runs a full sweep.
 */
export const triggerListenerTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ mode: z.enum(["fast", "manual", "reconcile"]).default("manual") })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.SYSTEM_HEALTH_MANAGE);
    const { runListenerTick } = await import("@/lib/listener.server");
    const result = await runListenerTick(data.mode === "manual" ? "manual" : data.mode);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      actor_type: "admin",
      action: "listener.triggered",
      entity_type: "listener",
      metadata: {
        mode: data.mode,
        ok: result.ok,
        latestBlock: result.latestBlock,
        depositsUpdated: result.depositsUpdated,
        newEvents: result.newEvents,
        errors: result.errors,
      } as never,
    });
    return {
      ok: result.ok,
      latestBlock: result.latestBlock,
      depositsUpdated: result.depositsUpdated,
      newEvents: result.newEvents,
      durationMs: result.durationMs,
      errors: result.errors,
    };
  });
