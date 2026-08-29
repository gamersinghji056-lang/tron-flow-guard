/**
 * Admin domain logic (server-only). Every entry point re-verifies the caller's
 * admin role through the *authenticated* client before touching admin state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isTronAddress, type ChainNetwork } from "@/lib/chain";

type Client = SupabaseClient<Database>;

export interface RecentP2pOrderRow {
  id: string;
  order_ref: string | null;
  status: string | null;
  usdt_amount: number | string | null;
  total_inr: number | string | null;
  created_at: string;
}

export async function requireAdmin(client: Client, userId: string) {
  void userId;
  const { data, error } = await client.rpc("is_admin");
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

export async function assignWallet(walletId: string, traderId: string | null, actorId: string) {
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
  feeCollectionWalletId?: string | null | undefined;
  feeCollectionWalletIdMainnet?: string | null | undefined;
  feeCollectionWalletIdNile?: string | null | undefined;
  usdtTotalTransferFee?: number | undefined;
  tronEnergyRouteEnabled?: boolean | undefined;
  tronEnergyProvider?: "tronrental" | undefined;
  tronEnergyBufferPercent?: number | undefined;
  trxMinTransferFee?: number | undefined;
  trxMaxTransferFee?: number | undefined;
  trxTransferFeeMargin?: number | undefined;
  vendorBuyerFeePercent?: number | undefined;
  vendorSellerFeePercent?: number | undefined;
  wtronBuyRateInr?: number | undefined;
  directSellFeePercent?: number | undefined;
  withdrawalFeeUsdt?: number | undefined;
  onChainSendEnabled?: boolean | undefined;
  tronSigningMainnetEnabled?: boolean | undefined;
  feeSweepEnabled?: boolean | undefined;
  feeSweepMode?: "manual" | "automatic" | undefined;
  feeSweepMinimumUsdt?: number | undefined;
  gasfreeTransferEnabled?: boolean | undefined;
  gasfreeProvider?: string | undefined;
  gasfreeMainnetEnabled?: boolean | undefined;
  gasfreeSupportedAsset?: string | undefined;
  gasfreePerTxMaxUsdt?: number | undefined;
  gasfreeUserDailyMaxUsdt?: number | undefined;
  gasfreeGlobalDailyMaxUsdt?: number | undefined;
  gasfreeKillSwitch?: boolean | undefined;
  gasfreeProviderFeePolicy?: string | undefined;
  gasfreeWtronFeePolicy?: string | undefined;
  referralCampaignEnabled?: boolean | undefined;
  referralDirectRatePercent?: number | undefined;
  referralEligibleP2pEnabled?: boolean | undefined;
  referralEligibleDirectSellEnabled?: boolean | undefined;
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
  if (input.feeCollectionWalletId !== undefined) {
    rows.push({ key: "fee_collection_wallet_id", value: input.feeCollectionWalletId });
  }
  if (input.feeCollectionWalletIdMainnet !== undefined) {
    rows.push({
      key: "fee_collection_wallet_id_trc20_mainnet",
      value: input.feeCollectionWalletIdMainnet,
    });
  }
  if (input.feeCollectionWalletIdNile !== undefined) {
    rows.push({
      key: "fee_collection_wallet_id_trc20_nile",
      value: input.feeCollectionWalletIdNile,
    });
  }
  if (input.usdtTotalTransferFee !== undefined) {
    rows.push({ key: "usdt_total_transfer_fee", value: input.usdtTotalTransferFee });
  }
  if (input.tronEnergyRouteEnabled !== undefined) {
    rows.push({ key: "tron_energy_route_enabled", value: input.tronEnergyRouteEnabled });
  }
  if (input.tronEnergyProvider !== undefined) {
    rows.push({ key: "tron_energy_provider", value: input.tronEnergyProvider });
  }
  if (input.tronEnergyBufferPercent !== undefined) {
    rows.push({ key: "tron_energy_buffer_percent", value: input.tronEnergyBufferPercent });
  }
  if (input.trxMinTransferFee !== undefined) {
    rows.push({ key: "trx_min_transfer_fee", value: input.trxMinTransferFee });
  }
  if (input.trxMaxTransferFee !== undefined) {
    rows.push({ key: "trx_max_transfer_fee", value: input.trxMaxTransferFee });
  }
  if (input.trxTransferFeeMargin !== undefined) {
    rows.push({ key: "trx_transfer_fee_margin", value: input.trxTransferFeeMargin });
  }
  if (input.vendorBuyerFeePercent !== undefined) {
    rows.push({ key: "vendor_buyer_fee_percent", value: input.vendorBuyerFeePercent });
  }
  if (input.vendorSellerFeePercent !== undefined) {
    rows.push({ key: "vendor_seller_fee_percent", value: input.vendorSellerFeePercent });
  }
  if (input.wtronBuyRateInr !== undefined) {
    rows.push({ key: "wtron_buy_rate_inr", value: input.wtronBuyRateInr });
  }
  if (input.directSellFeePercent !== undefined) {
    rows.push({ key: "direct_sell_fee_percent", value: input.directSellFeePercent });
  }
  if (input.withdrawalFeeUsdt !== undefined) {
    rows.push({ key: "withdrawal_fee_usdt", value: input.withdrawalFeeUsdt });
  }
  if (input.onChainSendEnabled !== undefined) {
    rows.push({ key: "on_chain_send_enabled", value: input.onChainSendEnabled });
  }
  if (input.tronSigningMainnetEnabled !== undefined) {
    rows.push({ key: "tron_signing_mainnet_enabled", value: input.tronSigningMainnetEnabled });
  }
  if (input.feeSweepEnabled !== undefined) {
    rows.push({ key: "fee_sweep_enabled", value: input.feeSweepEnabled });
  }
  if (input.feeSweepMode !== undefined) {
    rows.push({ key: "fee_sweep_mode", value: input.feeSweepMode });
  }
  if (input.feeSweepMinimumUsdt !== undefined) {
    rows.push({ key: "fee_sweep_minimum_usdt", value: input.feeSweepMinimumUsdt });
  }
  if (input.gasfreeTransferEnabled !== undefined) {
    rows.push({ key: "gasfree_transfer_enabled", value: input.gasfreeTransferEnabled });
  }
  if (input.gasfreeProvider !== undefined) {
    rows.push({ key: "gasfree_provider", value: input.gasfreeProvider });
  }
  if (input.gasfreeMainnetEnabled !== undefined) {
    rows.push({ key: "gasfree_mainnet_enabled", value: input.gasfreeMainnetEnabled });
  }
  if (input.gasfreeSupportedAsset !== undefined) {
    rows.push({ key: "gasfree_supported_asset", value: input.gasfreeSupportedAsset });
  }
  if (input.gasfreePerTxMaxUsdt !== undefined) {
    rows.push({ key: "gasfree_per_tx_max_usdt", value: input.gasfreePerTxMaxUsdt });
  }
  if (input.gasfreeUserDailyMaxUsdt !== undefined) {
    rows.push({ key: "gasfree_user_daily_max_usdt", value: input.gasfreeUserDailyMaxUsdt });
  }
  if (input.gasfreeGlobalDailyMaxUsdt !== undefined) {
    rows.push({ key: "gasfree_global_daily_max_usdt", value: input.gasfreeGlobalDailyMaxUsdt });
  }
  if (input.gasfreeKillSwitch !== undefined) {
    rows.push({ key: "gasfree_kill_switch", value: input.gasfreeKillSwitch });
  }
  if (input.gasfreeProviderFeePolicy !== undefined) {
    rows.push({ key: "gasfree_provider_fee_policy", value: input.gasfreeProviderFeePolicy });
  }
  if (input.gasfreeWtronFeePolicy !== undefined) {
    rows.push({ key: "gasfree_wtron_fee_policy", value: input.gasfreeWtronFeePolicy });
  }
  if (input.referralCampaignEnabled !== undefined) {
    rows.push({ key: "referral_campaign_enabled", value: input.referralCampaignEnabled });
  }
  if (input.referralDirectRatePercent !== undefined) {
    rows.push({ key: "referral_direct_rate_percent", value: input.referralDirectRatePercent });
  }
  if (input.referralEligibleP2pEnabled !== undefined) {
    rows.push({ key: "referral_eligible_p2p_enabled", value: input.referralEligibleP2pEnabled });
  }
  if (input.referralEligibleDirectSellEnabled !== undefined) {
    rows.push({
      key: "referral_eligible_direct_sell_enabled",
      value: input.referralEligibleDirectSellEnabled,
    });
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

export async function fetchAdminDashboard() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const [
    profileRes,
    activeUserRes,
    depositsRes,
    transactionsRes,
    p2pActiveRes,
    p2pCompletedRes,
    disputesRes,
    directSellRes,
    walletTxRes,
    healthRes,
    recentOrdersRes,
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("updated_at", since24h),
    supabaseAdmin.from("deposit_requests").select("status, received_amount, expected_amount"),
    supabaseAdmin.from("transactions").select("amount, processed, created_at").eq("verified", true),
    supabaseAdmin
      .from("p2p_orders" as never)
      .select("id", { count: "exact", head: true })
      .in("status", ["payment_pending", "payment_sent", "disputed", "admin_review"] as never),
    supabaseAdmin
      .from("p2p_orders" as never)
      .select("id, usdt_amount, created_at", { count: "exact" })
      .eq("status", "completed" as never),
    supabaseAdmin
      .from("p2p_disputes" as never)
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "evidence_requested"] as never),
    supabaseAdmin
      .from("direct_sell_orders" as never)
      .select("id", { count: "exact", head: true })
      .in("status", [
        "waiting_for_usdt",
        "usdt_detected",
        "usdt_confirming",
        "usdt_confirmed",
        "inr_payment_pending",
        "payment_assigned",
        "inr_payment_sent",
        "manual_review",
        "partial_payment",
        "overpayment",
      ] as never),
    supabaseAdmin.from("wallet_transactions").select("direction, kind, amount, fee, created_at"),
    supabaseAdmin
      .from("service_health")
      .select("*")
      .in("service", ["blockchain-listener", "blockchain-worker"]),
    supabaseAdmin
      .from("p2p_orders" as never)
      .select("id, order_ref, status, usdt_amount, total_inr, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const deposits = depositsRes.data ?? [];
  const walletTx = walletTxRes.data ?? [];
  const p2pCompleted = (p2pCompletedRes.data ?? []) as unknown as {
    usdt_amount: number | string;
    created_at: string;
  }[];

  const healthRows = (healthRes.data ?? []) as unknown as {
    service: string;
    status: string;
    detail: string | null;
    latest_block: number | null;
    updated_at: string;
    metadata: Record<string, unknown> | null;
  }[];
  const worker = healthRows.find((row) => row.service === "blockchain-worker");
  const listener = healthRows.find((row) => row.service === "blockchain-listener");

  return {
    totalUsers: profileRes.count ?? 0,
    activeUsers24h: activeUserRes.count ?? 0,
    pendingDeposits: deposits.filter((row) =>
      [
        "waiting",
        "detected",
        "confirming",
        "review",
        "underpaid",
        "overpaid",
        "late_payment",
      ].includes(String(row.status)),
    ).length,
    creditedDeposits: deposits.filter((row) => row.status === "credited").length,
    totalUsdtDeposited: deposits
      .filter((row) => row.status === "credited")
      .reduce((sum, row) => sum + Number(row.received_amount ?? row.expected_amount ?? 0), 0),
    totalUsdtWithdrawn: walletTx
      .filter((row) => row.direction === "out" && row.kind === "transfer")
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    feesRevenue: walletTx.reduce((sum, row) => sum + Number(row.fee ?? 0), 0),
    p2pVolume24h: p2pCompleted
      .filter((row) => new Date(row.created_at).getTime() >= new Date(since24h).getTime())
      .reduce((sum, row) => sum + Number(row.usdt_amount ?? 0), 0),
    activeP2pOrders: p2pActiveRes.count ?? 0,
    completedOrders: p2pCompletedRes.count ?? 0,
    openDisputes: disputesRes.count ?? 0,
    pendingDirectSellOrders: directSellRes.count ?? 0,
    confirmedTransactions: transactionsRes.data?.filter((row) => row.processed).length ?? 0,
    blockchainHealth: {
      status:
        worker?.status === "ok" && listener?.status === "ok"
          ? "healthy"
          : worker || listener
            ? "degraded"
            : "offline",
      reason: worker?.detail ?? listener?.detail ?? "No worker heartbeat recorded",
      latestBlock: listener?.latest_block ?? null,
      workerUpdatedAt: worker?.updated_at ?? null,
      listenerUpdatedAt: listener?.updated_at ?? null,
      workerMetadata: worker?.metadata ? JSON.stringify(worker.metadata) : null,
      listenerMetadata: listener?.metadata ? JSON.stringify(listener.metadata) : null,
    },
    recentP2pOrders: (recentOrdersRes.data ?? []) as unknown as RecentP2pOrderRow[],
  };
}

export async function createCompanyWallet(input: {
  name: string;
  address: string;
  network: ChainNetwork;
  purpose?: string;
  priority?: number;
  minDeposit?: number | null | undefined;
  maxDeposit?: number | null | undefined;
  actorId: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!isTronAddress(input.address)) throw new Error("Enter a valid TRON address");

  const { data, error } = await supabaseAdmin
    .from("wallets")
    .insert({
      name: input.name,
      address: input.address,
      network: input.network,
      purpose: input.purpose ?? "USER_DEPOSIT",
      priority: input.priority ?? 100,
      min_deposit: input.minDeposit ?? undefined,
      max_deposit: input.maxDeposit ?? undefined,
      is_active: true,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: input.actorId,
    actor_type: "admin",
    action: "wallet.created",
    entity_type: "wallet",
    entity_id: data.id,
    metadata: { address: input.address, network: input.network },
  });
  return { ok: true, id: data.id };
}

export async function saveCompanyWallet(input: {
  id: string;
  name: string;
  address: string;
  network: ChainNetwork;
  purpose?: string;
  priority?: number;
  minDeposit?: number | null | undefined;
  maxDeposit?: number | null | undefined;
  actorId: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!isTronAddress(input.address)) throw new Error("Enter a valid TRON address");
  const { data, error } = await supabaseAdmin
    .from("wallets")
    .update({
      name: input.name,
      address: input.address,
      network: input.network,
      purpose: input.purpose ?? "USER_DEPOSIT",
      priority: input.priority ?? 100,
      min_deposit: input.minDeposit ?? null,
      max_deposit: input.maxDeposit ?? null,
    } as never)
    .eq("id", input.id)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: input.actorId,
    actor_type: "admin",
    action: "wallet.updated",
    entity_type: "wallet",
    entity_id: data.id,
    metadata: { purpose: input.purpose, priority: input.priority },
  });
  return { ok: true, id: data.id };
}

export async function updateCompanyWalletStatus(input: {
  walletId: string;
  isActive: boolean;
  actorId: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("wallets")
    .update({ is_active: input.isActive })
    .eq("id", input.walletId);
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: input.actorId,
    actor_type: "admin",
    action: input.isActive ? "wallet.enabled" : "wallet.disabled",
    entity_type: "wallet",
    entity_id: input.walletId,
  });
  return { ok: true };
}

export async function setDefaultCompanyWallet(input: {
  walletId: string;
  network: ChainNetwork;
  actorId: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("wallets")
    .update({ is_default: false })
    .eq("network", input.network)
    .neq("id", input.walletId);
  const { error } = await supabaseAdmin
    .from("wallets")
    .update({ is_default: true, is_active: true })
    .eq("id", input.walletId);
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: input.actorId,
    actor_type: "admin",
    action: "wallet.default_changed",
    entity_type: "wallet",
    entity_id: input.walletId,
    metadata: { network: input.network },
  });
  return { ok: true };
}
