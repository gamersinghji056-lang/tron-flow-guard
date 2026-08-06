/**
 * Wallet domain logic (server-only).
 *
 * Address provisioning, archiving and transfer orchestration. The money math
 * itself is done inside the `wallet_transfer` database function so debit,
 * credit and fee collection are a single atomic statement.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ChainNetwork } from "@/lib/chain";

type Client = SupabaseClient<Database>;

export const DEFAULT_TRANSFER_FEE = 1.5;

export async function readTransferFee(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "transfer_fee_usdt")
    .maybeSingle();
  const parsed = Number(data?.value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_TRANSFER_FEE;
}

async function readSetting(key: string): Promise<unknown> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value ?? null;
}

export async function provisionWallet(params: {
  userId: string;
  name: string;
  network: ChainNetwork;
  makeDefault: boolean;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { deriveWallet } = await import("@/lib/wallet-keys.server");

  const { data: existing, error: countError } = await supabaseAdmin
    .from("user_wallets")
    .select("id, derivation_index")
    .eq("user_id", params.userId)
    .order("derivation_index", { ascending: false })
    .limit(1);
  if (countError) throw new Error(countError.message);

  const nextIndex = (existing?.[0]?.derivation_index ?? -1) + 1;
  const derived = deriveWallet(params.userId, nextIndex);
  const isFirst = !existing || existing.length === 0;

  const { data: wallet, error } = await supabaseAdmin
    .from("user_wallets")
    .insert({
      user_id: params.userId,
      name: params.name,
      network: params.network,
      address: derived.address,
      derivation_index: nextIndex,
      is_default: params.makeDefault || isFirst,
    })
    .select("id, name, address, network, balance, is_default")
    .single();
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("notifications").insert({
    user_id: params.userId,
    audience: "trader",
    title: "Wallet created",
    body: `${wallet.name} is ready to receive USDT on ${params.network}.`,
    severity: "success",
  });
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: params.userId,
    actor_type: "user",
    action: "wallet.created",
    entity_type: "user_wallet",
    entity_id: wallet.id,
    metadata: { address: wallet.address, network: params.network },
  });

  return { ...wallet, balance: Number(wallet.balance) };
}

export async function archiveOwnedWallet(userId: string, walletId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: wallet, error } = await supabaseAdmin
    .from("user_wallets")
    .select("id, user_id, balance, is_default")
    .eq("id", walletId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!wallet || wallet.user_id !== userId) throw new Error("Wallet not found");
  if (Number(wallet.balance) > 0) {
    throw new Error("Move the remaining balance out before archiving this wallet");
  }

  const { error: updateError } = await supabaseAdmin
    .from("user_wallets")
    .update({ is_archived: true, is_default: false })
    .eq("id", walletId);
  if (updateError) throw new Error(updateError.message);
  return { ok: true };
}

export async function executeTransfer(
  client: Client,
  userId: string,
  input: { walletId: string; toAddress: string; amount: number; memo?: string | undefined },
) {
  const { data, error } = await client.rpc("wallet_transfer", {
    _from_wallet: input.walletId,
    _to_address: input.toAddress,
    _amount: input.amount,
    ...(input.memo ? { _memo: input.memo } : {}),
  });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Transfer could not be completed");

  const result = {
    transactionId: row.out_tx_id as string,
    fee: Number(row.fee),
    total: Number(row.total),
    internal: Boolean(row.internal),
    txid: null as string | null,
    broadcastError: null as string | null,
  };

  if (result.internal) return result;

  // External destination: attempt a real on-chain broadcast when enabled.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const enabled = (await readSetting("onchain_broadcast_enabled")) === true;

  if (!enabled) {
    await supabaseAdmin
      .from("wallet_transactions")
      .update({
        status: "pending",
        failure_reason: "Awaiting on-chain broadcast (disabled by the administrator)",
      })
      .eq("id", result.transactionId);
    return result;
  }

  const { data: wallet } = await supabaseAdmin
    .from("user_wallets")
    .select("address, network, derivation_index")
    .eq("id", input.walletId)
    .single();

  if (!wallet) return result;

  await supabaseAdmin
    .from("wallet_transactions")
    .update({ status: "broadcasting" })
    .eq("id", result.transactionId);

  const { broadcastTrc20Transfer } = await import("@/lib/tron-transfer.server");
  const broadcast = await broadcastTrc20Transfer({
    network: wallet.network,
    ownerUserId: userId,
    derivationIndex: wallet.derivation_index,
    ownerAddress: wallet.address,
    toAddress: input.toAddress,
    amount: input.amount,
  });

  await supabaseAdmin
    .from("wallet_transactions")
    .update({
      status: broadcast.ok ? "completed" : "failed",
      txid: broadcast.txid ?? null,
      failure_reason: broadcast.error ?? null,
    })
    .eq("id", result.transactionId);

  result.txid = broadcast.txid ?? null;
  result.broadcastError = broadcast.error ?? null;
  return result;
}
