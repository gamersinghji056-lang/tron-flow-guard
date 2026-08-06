/**
 * Admin domain logic (server-only). Every entry point re-verifies the caller's
 * admin role through the *authenticated* client before touching admin state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export async function requireAdmin(client: Client, userId: string) {
  const { data, error } = await client.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: administrator access required");
  return true;
}

export interface TraderSummary {
  id: string;
  email: string | null;
  full_name: string | null;
  balance: number;
  wallet_count: number;
  assigned_wallets: number;
}

export async function fetchTraders(): Promise<TraderSummary[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: profiles }, { data: wallets }, { data: assigned }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, balance")
      .order("created_at", { ascending: true }),
    supabaseAdmin.from("user_wallets").select("user_id").eq("is_archived", false),
    supabaseAdmin.from("wallets").select("assigned_user_id").not("assigned_user_id", "is", null),
  ]);

  const walletCounts = new Map<string, number>();
  for (const row of wallets ?? []) {
    walletCounts.set(row.user_id, (walletCounts.get(row.user_id) ?? 0) + 1);
  }
  const assignedCounts = new Map<string, number>();
  for (const row of assigned ?? []) {
    if (!row.assigned_user_id) continue;
    assignedCounts.set(row.assigned_user_id, (assignedCounts.get(row.assigned_user_id) ?? 0) + 1);
  }

  return (profiles ?? []).map((profile) => ({
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    balance: Number(profile.balance),
    wallet_count: walletCounts.get(profile.id) ?? 0,
    assigned_wallets: assignedCounts.get(profile.id) ?? 0,
  }));
}

export async function assignWallet(
  walletId: string,
  traderId: string | null,
  actorId: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: wallet, error } = await supabaseAdmin
    .from("wallets")
    .update({ assigned_user_id: traderId })
    .eq("id", walletId)
    .select("id, name, address, network")
    .single();
  if (error) throw new Error(error.message);

  if (traderId) {
    await supabaseAdmin.from("notifications").insert({
      user_id: traderId,
      audience: "trader",
      title: "Deposit wallet assigned",
      body: `${wallet.name} (${wallet.address.slice(0, 10)}…) is now reserved for your deposits.`,
      severity: "info",
    });
  }

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    actor_type: "admin",
    action: traderId ? "wallet.assigned" : "wallet.unassigned",
    entity_type: "wallet",
    entity_id: walletId,
    metadata: { trader_id: traderId },
  });

  return { ok: true };
}

export async function writeSettings(input: {
  transferFee?: number | undefined;
  feeWalletAddress?: string | undefined;
  onchainBroadcast?: boolean | undefined;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const rows: { key: string; value: unknown }[] = [];
  if (input.transferFee !== undefined) {
    rows.push({ key: "transfer_fee_usdt", value: input.transferFee });
  }
  if (input.feeWalletAddress !== undefined) {
    rows.push({ key: "fee_wallet_address", value: input.feeWalletAddress });
  }
  if (input.onchainBroadcast !== undefined) {
    rows.push({ key: "onchain_broadcast_enabled", value: input.onchainBroadcast });
  }

  for (const row of rows) {
    const { error } = await supabaseAdmin
      .from("system_settings")
      .update({ value: row.value as never, updated_at: new Date().toISOString() })
      .eq("key", row.key);
    if (error) throw new Error(error.message);
  }
  return { ok: true, updated: rows.length };
}
