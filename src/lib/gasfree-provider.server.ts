import type { ChainNetwork } from "@/lib/chain";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isTronAddress } from "@/lib/chain";
import { gasfreeChainIdForNetwork } from "@/lib/gasfree-address";
import {
  GASFREE_ENV_NAMES,
  GASFREE_PROVIDER_NAME,
  GASFREE_SUPPORTED_ASSET,
  gasFreeServiceReadiness,
  isGasFreeTransferExecutable,
  validateGasFreeReplay,
  type GasFreeServiceStatus,
} from "@/lib/gasfree-transfer-policy";
import { safeErrorMessage, writeServiceHeartbeat } from "@/lib/system-health.server";

type SettingValue = string | number | boolean | null;

export interface GasFreeTransferReadiness {
  provider: string;
  status: GasFreeServiceStatus;
  reason: string;
  network: ChainNetwork;
  asset: string;
  configured: boolean;
  envNames: readonly string[];
  serviceProviderConfigured: boolean;
  apiKeyConfigured: boolean;
  apiSecretConfigured: boolean;
  chainId: number;
}

function parseBoolean(value: SettingValue, fallback: boolean) {
  if (value === true || value === false) return value;
  if (typeof value === "string") return value === "true";
  return fallback;
}

function parseNumber(value: SettingValue, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readSettings() {
  const keys = [
    "gasfree_transfer_enabled",
    "gasfree_provider",
    "gasfree_mainnet_enabled",
    "gasfree_supported_asset",
    "gasfree_per_tx_max_usdt",
    "gasfree_user_daily_max_usdt",
    "gasfree_global_daily_max_usdt",
    "gasfree_kill_switch",
    "gasfree_provider_fee_policy",
    "gasfree_wtron_fee_policy",
  ];
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", keys);
  if (error) throw new Error(error.message);
  const map = new Map((data ?? []).map((row) => [row.key, row.value as SettingValue]));
  return {
    enabled: parseBoolean(map.get("gasfree_transfer_enabled") ?? null, false),
    provider: String(map.get("gasfree_provider") ?? GASFREE_PROVIDER_NAME).replace(/^"|"$/g, ""),
    mainnetEnabled: parseBoolean(map.get("gasfree_mainnet_enabled") ?? null, false),
    supportedAsset: String(map.get("gasfree_supported_asset") ?? GASFREE_SUPPORTED_ASSET).replace(
      /^"|"$/g,
      "",
    ),
    perTxMaxUsdt: parseNumber(map.get("gasfree_per_tx_max_usdt") ?? null, 0),
    userDailyMaxUsdt: parseNumber(map.get("gasfree_user_daily_max_usdt") ?? null, 0),
    globalDailyMaxUsdt: parseNumber(map.get("gasfree_global_daily_max_usdt") ?? null, 0),
    killSwitch: parseBoolean(map.get("gasfree_kill_switch") ?? null, true),
  };
}

function readProviderConfig() {
  const providerBaseUrl = process.env["GASFREE_PROVIDER_BASE_URL"]?.trim() || null;
  const serviceProviderAddress = process.env["GASFREE_SERVICE_PROVIDER_ADDRESS"]?.trim() || null;
  return {
    providerBaseUrl,
    serviceProviderAddress,
    apiKeyConfigured: Boolean(process.env["GASFREE_API_KEY"]),
    apiSecretConfigured: Boolean(process.env["GASFREE_API_SECRET"]),
    timeoutMs: parseNumber(process.env["GASFREE_REQUEST_TIMEOUT_MS"] ?? null, 8_000),
  };
}

export async function getGasFreeTransferReadiness(input: {
  network: ChainNetwork;
  asset?: string;
  amount?: number;
}): Promise<GasFreeTransferReadiness> {
  const settings = await readSettings();
  const provider = readProviderConfig();
  const readiness = gasFreeServiceReadiness({
    settings,
    provider,
    network: input.network,
    asset: input.asset ?? GASFREE_SUPPORTED_ASSET,
    ...(input.amount === undefined ? {} : { amount: input.amount }),
  });
  return {
    provider: settings.provider || GASFREE_PROVIDER_NAME,
    status: readiness.status,
    reason: readiness.reason,
    network: input.network,
    asset: (input.asset ?? GASFREE_SUPPORTED_ASSET).toUpperCase(),
    configured: readiness.status !== "NOT_CONFIGURED",
    envNames: GASFREE_ENV_NAMES,
    serviceProviderConfigured: Boolean(provider.serviceProviderAddress),
    apiKeyConfigured: provider.apiKeyConfigured,
    apiSecretConfigured: provider.apiSecretConfigured,
    chainId: gasfreeChainIdForNetwork(input.network),
  };
}

export async function checkGasFreeProviderHealth(network: ChainNetwork = "trc20-mainnet") {
  const readiness = await getGasFreeTransferReadiness({ network, asset: GASFREE_SUPPORTED_ASSET });
  if (readiness.status === "NOT_CONFIGURED" || readiness.status === "DISABLED") {
    await writeServiceHeartbeat({
      service: "GASFREE",
      status: "DISABLED",
      message: readiness.reason,
      errorCode: readiness.status,
      metadata: {
        provider: readiness.provider,
        network: readiness.network,
        asset: readiness.asset,
        configured: readiness.configured,
        env_names: readiness.envNames,
      },
    });
    return readiness;
  }
  await writeServiceHeartbeat({
    service: "GASFREE",
    status: "HEALTHY",
    metadata: {
      provider: readiness.provider,
      network: readiness.network,
      asset: readiness.asset,
      chain_id: readiness.chainId,
    },
  });
  return readiness;
}

export async function createGasFreeTransferRequest(input: {
  userId: string;
  walletId: string;
  recipient: string;
  amount: number;
  transactionPassword: string;
  idempotencyKey: string;
}) {
  const { verifyTransactionPasswordOrThrow } = await import("@/lib/wallet-security.server");
  const { readTransferFee } = await import("@/lib/wallets.server");

  if (!isTronAddress(input.recipient)) throw new Error("Enter a valid TRON address");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const { data: wallet, error } = await supabaseAdmin
    .from("user_wallets" as never)
    .select(
      "id, user_id, address, network, wallet_type, wallet_role, parent_wallet_id, is_archived, onchain_balance",
    )
    .eq("id", input.walletId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = wallet as {
    id: string;
    user_id?: string | null;
    address?: string | null;
    network?: ChainNetwork | null;
    wallet_type?: string | null;
    wallet_role?: string | null;
    parent_wallet_id?: string | null;
    is_archived?: boolean | null;
    onchain_balance?: number | string | null;
  } | null;
  if (!row || row.user_id !== input.userId || row.is_archived) throw new Error("Wallet not found");
  if (row.wallet_role !== "gasfree" || row.wallet_type !== "gasfree") {
    throw new Error("Select the GasFree wallet before using GasFree Send.");
  }
  if (String(row.network) !== "trc20-mainnet") {
    throw new Error("GasFree Send supports TRON Mainnet USDT only.");
  }

  const readiness = await getGasFreeTransferReadiness({
    network: row.network as ChainNetwork,
    asset: GASFREE_SUPPORTED_ASSET,
    amount: input.amount,
  });
  if (!isGasFreeTransferExecutable(readiness.status)) {
    return {
      ok: false,
      status: readiness.status,
      message: readiness.reason,
      readiness,
    };
  }

  await verifyTransactionPasswordOrThrow(input.userId, input.transactionPassword);
  const { data: generalWallet, error: generalError } = row.parent_wallet_id
    ? await supabaseAdmin
        .from("user_wallets" as never)
        .select("id, user_id, address, is_archived")
        .eq("id", row.parent_wallet_id as never)
        .maybeSingle()
    : { data: null, error: null };
  if (generalError) throw new Error(generalError.message);
  const general = generalWallet as {
    id?: string | null;
    user_id?: string | null;
    address?: string | null;
    is_archived?: boolean | null;
  } | null;
  if (!general?.address || general.user_id !== input.userId || general.is_archived) {
    throw new Error("Linked General wallet is unavailable for GasFree authorization.");
  }
  const deadline = new Date(Date.now() + 10 * 60_000);
  validateGasFreeReplay({
    idempotencyKey: input.idempotencyKey,
    deadlineMs: deadline.getTime(),
    nowMs: Date.now(),
  });

  const platformFee = await readTransferFee();
  const totalDebit = input.amount + platformFee;
  if (Number(row.onchain_balance ?? 0) < totalDebit)
    throw new Error("Insufficient GasFree USDT balance");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("gasfree_transfer_requests" as never)
    .select("*")
    .eq("user_id", input.userId as never)
    .eq("idempotency_key", input.idempotencyKey as never)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return { ok: true, request: existing, idempotent: true, readiness };

  const { data: request, error: insertError } = await supabaseAdmin
    .from("gasfree_transfer_requests" as never)
    .insert({
      user_id: input.userId,
      wallet_id: row.id,
      general_wallet_id: row.parent_wallet_id ?? null,
      general_address: general.address,
      gasfree_address: row.address,
      network: row.network,
      asset: GASFREE_SUPPORTED_ASSET,
      amount: input.amount,
      recipient: input.recipient.trim(),
      provider: readiness.provider,
      idempotency_key: input.idempotencyKey,
      deadline_at: deadline.toISOString(),
      status: "CREATED",
      platform_fee: platformFee,
      provider_fee: 0,
      total_debit: totalDebit,
      metadata: {
        protocol: "GasFree TIP-712 PermitTransfer",
        chain_id: readiness.chainId,
        service_provider_configured: readiness.serviceProviderConfigured,
      },
    } as never)
    .select("*")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      const { data: afterConflict } = await supabaseAdmin
        .from("gasfree_transfer_requests" as never)
        .select("*")
        .eq("user_id", input.userId as never)
        .eq("idempotency_key", input.idempotencyKey as never)
        .maybeSingle();
      return { ok: true, request: afterConflict, idempotent: true, readiness };
    }
    throw new Error(insertError.message);
  }

  await writeServiceHeartbeat({
    service: "GASFREE",
    status: "DISABLED",
    message: "GasFree transfer request created but live provider submission remains disabled.",
    errorCode: "GASFREE_PROVIDER_SUBMIT_DISABLED",
    metadata: { provider: readiness.provider, request_status: "CREATED" },
  }).catch(() => undefined);

  return { ok: true, request, idempotent: false, readiness };
}
