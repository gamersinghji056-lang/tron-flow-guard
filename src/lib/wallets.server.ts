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
import { TRON_BIP44_DERIVATION_PATH } from "@/lib/tron-personal-wallet";

type Client = SupabaseClient<Database>;

export const DEFAULT_TRANSFER_FEE = 1.5;

export async function readTransferFee(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", ["usdt_total_transfer_fee", "transfer_fee_usdt"])
    .order("key", { ascending: false });
  const authoritative = (data ?? []).find((row) => row.key === "usdt_total_transfer_fee");
  const legacy = (data ?? []).find((row) => row.key === "transfer_fee_usdt");
  const parsed = Number(authoritative?.value ?? legacy?.value);
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

export async function hasNileTestWalletAccess(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("nile_test_wallet_users" as never)
    .select("enabled")
    .eq("user_id", userId as never)
    .eq("enabled", true as never)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "42703") return false;
    throw new Error(error.message);
  }
  return Boolean(data);
}

async function assertWalletNetworkCreationAllowed(userId: string, network: ChainNetwork) {
  if (network !== "trc20-nile") return;
  if (await hasNileTestWalletAccess(userId)) return;
  throw new Error("Nile test wallet creation is restricted to authorized test users.");
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

async function readGasfreeStatus() {
  const value = await readSetting("gasfree_sponsorship_status");
  return value === "available" || value === "limited" ? value : "unavailable";
}

type GasfreeCapabilityStatus =
  "available" | "limited" | "enabled" | "unavailable" | "check_failed" | "unknown";

const GASFREE_CHECK_TTL_MS = 6 * 60 * 60 * 1000;

let gasfreeCapabilityColumnsAvailable: boolean | null = null;

function normalizeGasfreeCapabilityStatus(status: unknown): GasfreeCapabilityStatus {
  const value = String(status ?? "").toLowerCase();
  if (value === "available" || value === "limited" || value === "enabled") return value;
  if (value === "check_failed" || value === "unknown") return value;
  return "unavailable";
}

async function hasGasfreeCapabilityColumns() {
  if (gasfreeCapabilityColumnsAvailable !== null) return gasfreeCapabilityColumnsAvailable;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("user_wallets" as never)
    .select("gasfree_capability_checked_at")
    .limit(1);
  gasfreeCapabilityColumnsAvailable = !error;
  if (error && error.code !== "42703") throw new Error(error.message);
  return gasfreeCapabilityColumnsAvailable;
}

async function readWalletGasfreeMetadata(walletId: string) {
  if (!(await hasGasfreeCapabilityColumns())) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_wallets" as never)
    .select("gasfree_capability_checked_at, gasfree_capability_error, gasfree_capability_metadata")
    .eq("id", walletId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    gasfree_capability_checked_at?: string | null;
    gasfree_capability_error?: string | null;
    gasfree_capability_metadata?: unknown;
  } | null;
}

async function updateWalletGasfreeCapability(
  walletId: string,
  capability: Awaited<ReturnType<typeof checkGasFreeCapability>>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hasMetadataColumns = await hasGasfreeCapabilityColumns();
  const update = {
    gas_sponsorship_status: capability.status,
    ...(hasMetadataColumns
      ? {
          gasfree_capability_checked_at: capability.checkedAt,
          gasfree_capability_error: capability.error,
          gasfree_capability_metadata: capability.metadata,
        }
      : {}),
  };
  const { error } = await supabaseAdmin
    .from("user_wallets" as never)
    .update(update as never)
    .eq("id", walletId as never);
  if (error && capability.status === "check_failed" && error.code === "23514") return false;
  if (error) throw new Error(error.message);
  return true;
}

function gasfreeDerivationLabel(network: ChainNetwork, generalPath?: string | null) {
  const chainId = network === "trc20-mainnet" ? "0x2b6653dc" : "0xcd8690dc";
  return `gasfree:create2:${chainId}:${generalPath ?? TRON_BIP44_DERIVATION_PATH}`;
}

export async function ensureGasFreeChildWalletForGeneral(userId: string, generalWalletId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { deriveGasFreeAddressFromGeneralAddress } = await import("@/lib/gasfree-address");

  const { data: general, error } = await supabaseAdmin
    .from("user_wallets" as never)
    .select(
      "id, user_id, name, address, network, wallet_type, backup_status, derivation_path, wallet_role, wallet_group_id, is_archived",
    )
    .eq("id", generalWalletId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = general as {
    id: string;
    user_id?: string | null;
    name?: string | null;
    address?: string | null;
    network?: ChainNetwork | null;
    wallet_type?: string | null;
    backup_status?: string | null;
    derivation_path?: string | null;
    wallet_role?: string | null;
    wallet_group_id?: string | null;
    is_archived?: boolean | null;
  } | null;
  if (!row || row.user_id !== userId || row.is_archived) throw new Error("Wallet not found");
  if (row.wallet_role === "gasfree") {
    return { wallet: row, existing: true, skipped: true };
  }
  if (!row.address || !row.network) throw new Error("Wallet address is unavailable");

  const gasfreeAddress = deriveGasFreeAddressFromGeneralAddress(row.address, row.network);
  if (gasfreeAddress === row.address) throw new Error("GasFree address discovery failed");

  const { data: existingChildren, error: childError } = await supabaseAdmin
    .from("user_wallets" as never)
    .select(
      "id, user_id, name, address, network, wallet_type, backup_status, gas_sponsorship_status, wallet_role, parent_wallet_id, wallet_group_id",
    )
    .eq("parent_wallet_id", row.id as never)
    .eq("wallet_role", "gasfree" as never)
    .eq("is_archived", false as never)
    .limit(1);
  if (childError && childError.code !== "42703") throw new Error(childError.message);
  const existingChild = ((existingChildren as unknown[])?.[0] ?? null) as Record<
    string,
    unknown
  > | null;
  if (existingChild) return { wallet: existingChild, existing: true, skipped: false };

  const { data: addressOwners, error: ownerError } = await supabaseAdmin
    .from("user_wallets" as never)
    .select("id, user_id, address, wallet_role")
    .eq("address", gasfreeAddress as never)
    .eq("is_archived", false as never)
    .limit(1);
  if (ownerError) throw new Error(ownerError.message);
  const addressOwner = ((addressOwners as unknown[])?.[0] ?? null) as {
    id: string;
    user_id?: string | null;
  } | null;
  if (addressOwner) {
    if (addressOwner.user_id !== userId) {
      throw new Error("GasFree wallet is already linked to another WTRON account.");
    }
    await supabaseAdmin
      .from("user_wallets" as never)
      .update({
        wallet_role: "gasfree",
        wallet_type: "gasfree",
        parent_wallet_id: row.id,
        wallet_group_id: row.wallet_group_id ?? row.id,
      } as never)
      .eq("id", addressOwner.id as never);
    return { wallet: { ...addressOwner, address: gasfreeAddress }, existing: true, skipped: false };
  }

  const { data: child, error: insertError } = await supabaseAdmin
    .from("user_wallets" as never)
    .insert({
      user_id: userId,
      name: `${row.name ?? "Wallet"} GasFree`,
      network: row.network,
      address: gasfreeAddress,
      custody: "non_custodial",
      wallet_type: "gasfree",
      wallet_role: "gasfree",
      parent_wallet_id: row.id,
      wallet_group_id: row.wallet_group_id ?? row.id,
      backup_status: row.backup_status ?? "imported",
      derivation_path: gasfreeDerivationLabel(row.network, row.derivation_path),
      gas_sponsorship_status: "unavailable",
      monitored: true,
      derivation_index: 0,
      is_default: false,
    } as never)
    .select(
      "id, name, address, network, balance, onchain_balance, onchain_trx_balance, is_default, wallet_type, custody, backup_status, gas_sponsorship_status, derivation_path, created_at, wallet_role, parent_wallet_id, wallet_group_id",
    )
    .single();
  if (insertError) throw new Error(insertError.message);

  const childRow = child as unknown as { id: string };
  await refreshPersonalWalletOnChainBalance(userId, childRow.id).catch(() => undefined);
  return { wallet: child, existing: false, skipped: false };
}

export async function checkGasFreeCapability(address: string, network: ChainNetwork) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("gasfree_wallet_registry" as never)
    .select("status, metadata, updated_at")
    .eq("address", address as never)
    .eq("network", network as never)
    .maybeSingle();
  if (error) {
    return {
      status: "check_failed" as const,
      checkedAt: new Date().toISOString(),
      error:
        error.code === "42P01"
          ? "GasFree registry is not configured"
          : "GasFree availability check failed",
      metadata: { provider: "wtron_registry", network },
    };
  }
  const row = data as {
    status?: string | null;
    metadata?: unknown;
    updated_at?: string | null;
  } | null;
  const status = normalizeGasfreeCapabilityStatus(row?.status);
  return {
    status,
    checkedAt: new Date().toISOString(),
    error: null,
    metadata: {
      provider: "wtron_registry",
      network,
      registered: status === "available" || status === "limited" || status === "enabled",
      registryUpdatedAt: row?.updated_at ?? null,
      registry: row?.metadata ?? null,
    },
  };
}

export async function refreshWalletGasfreeCapability(
  userId: string,
  walletId: string,
  options: { force?: boolean } = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: wallet, error } = await supabaseAdmin
    .from("user_wallets" as never)
    .select("id, user_id, address, network, wallet_type, is_archived, gas_sponsorship_status")
    .eq("id", walletId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = wallet as {
    id: string;
    user_id?: string | null;
    address?: string | null;
    network?: ChainNetwork | null;
    wallet_type?: string | null;
    is_archived?: boolean | null;
    gas_sponsorship_status?: string | null;
  } | null;
  if (!row || row.user_id !== userId || row.is_archived) throw new Error("Wallet not found");

  const metadata = await readWalletGasfreeMetadata(row.id);
  const checkedAtMs = metadata?.gasfree_capability_checked_at
    ? Date.parse(metadata.gasfree_capability_checked_at)
    : 0;
  if (!options.force && checkedAtMs && Date.now() - checkedAtMs < GASFREE_CHECK_TTL_MS) {
    return {
      walletId: row.id,
      status: normalizeGasfreeCapabilityStatus(row.gas_sponsorship_status),
      checkedAt: metadata?.gasfree_capability_checked_at ?? null,
      error: metadata?.gasfree_capability_error ?? null,
      metadata: metadata?.gasfree_capability_metadata ?? {},
      cached: true,
    };
  }

  const capability = await checkGasFreeCapability(row.address ?? "", row.network as ChainNetwork);
  const persisted = await updateWalletGasfreeCapability(row.id, capability);

  return { walletId: row.id, ...capability, cached: false, persisted };
}

export async function backfillGasfreeCapabilitiesForUser(
  userId: string,
  options: { force?: boolean; limit?: number } = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_wallets" as never)
    .select("id")
    .eq("user_id", userId as never)
    .eq("wallet_type", "standard" as never)
    .eq("is_archived", false as never)
    .order("created_at", { ascending: true })
    .limit(options.limit ?? 5);
  if (error) throw new Error(error.message);
  const results = [];
  for (const wallet of (data ?? []) as Array<{ id: string }>) {
    const capability = await refreshWalletGasfreeCapability(userId, wallet.id, options);
    const gasfreeWallet = await ensureGasFreeChildWalletForGeneral(userId, wallet.id).catch(
      (error: unknown) => ({
        error: error instanceof Error ? error.message : "GasFree wallet discovery failed",
      }),
    );
    results.push({ ...capability, gasfreeWallet });
  }
  return results;
}

function isUniqueWalletAddressError(error: { code?: string; message?: string } | null) {
  const message = String(error?.message ?? "");
  return (
    error?.code === "23505" &&
    (message.includes("user_wallets_address_key") ||
      message.includes("user_wallets_active_address_key") ||
      message.includes("user_wallets_address_network_key"))
  );
}

async function detectImportedNetwork(address: string, requested: ChainNetwork, confirmed: boolean) {
  const { getIncomingUsdtTransfers, getNativeTrxBalance, getOutgoingUsdtTransfers } =
    await import("@/lib/tron.server");
  const { readTrc20Balance } = await import("@/lib/tron-transfer.server");
  const { decideImportedWalletNetwork } = await import("@/lib/wallet-network");
  const networks: ChainNetwork[] = ["trc20-mainnet", "trc20-nile"];

  const probes = await Promise.all(
    networks.map(async (network) => {
      const [trxBalance, usdtBalance, incoming, outgoing] = await Promise.all([
        getNativeTrxBalance(network, address),
        readTrc20Balance(network, address),
        getIncomingUsdtTransfers(network, address, { limit: 1 }).catch(() => []),
        getOutgoingUsdtTransfers(network, address, { limit: 1 }).catch(() => []),
      ]);
      return {
        network,
        trxBalance: Number(trxBalance ?? 0),
        usdtBalance: Number(usdtBalance ?? 0),
        txCount: incoming.length + outgoing.length,
      };
    }),
  );

  return decideImportedWalletNetwork(requested, probes, confirmed);
}

export async function provisionPersonalWallet(params: {
  userId: string;
  name: string;
  network: ChainNetwork;
  walletType: "standard" | "gasfree";
  makeDefault: boolean;
  transactionPassword: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { createPersonalWalletMnemonic, deriveTronWalletFromMnemonic } =
    await import("@/lib/tron-personal-wallet");
  const { encryptMnemonic, ensureTransactionPasswordForWalletAction } =
    await import("@/lib/wallet-security.server");

  await assertWalletNetworkCreationAllowed(params.userId, params.network);
  await ensureTransactionPasswordForWalletAction(params.userId, params.transactionPassword);

  const mnemonic = createPersonalWalletMnemonic();
  const derived = deriveTronWalletFromMnemonic(mnemonic);
  const encrypted = encryptMnemonic(mnemonic, params.transactionPassword);
  const gasStatus = params.walletType === "gasfree" ? await readGasfreeStatus() : "unavailable";

  const { data: existing, error: countError } = await supabaseAdmin
    .from("user_wallets" as never)
    .select("id")
    .eq("user_id", params.userId)
    .eq("is_archived", false);
  if (countError) throw new Error(countError.message);
  const isFirst = !existing || existing.length === 0;

  const { data: wallet, error } = await supabaseAdmin
    .from("user_wallets" as never)
    .insert({
      user_id: params.userId,
      name: params.name,
      network: params.network,
      address: derived.address,
      public_key: derived.publicKeyHex,
      custody: "non_custodial",
      wallet_type: params.walletType,
      backup_status: "not_backed_up",
      derivation_path: derived.derivationPath,
      gas_sponsorship_status: gasStatus,
      monitored: true,
      derivation_index: 0,
      is_default: params.makeDefault || isFirst,
      selected_at: params.makeDefault || isFirst ? new Date().toISOString() : null,
    } as never)
    .select(
      "id, name, address, network, balance, onchain_balance, onchain_trx_balance, is_default, wallet_type, custody, backup_status, gas_sponsorship_status, derivation_path, created_at",
    )
    .single();
  if (error) throw new Error(error.message);

  const row = wallet as unknown as { id: string; name: string; address: string };
  const { error: secretError } = await supabaseAdmin
    .from("personal_wallet_secrets" as never)
    .insert({
      wallet_id: row.id,
      user_id: params.userId,
      encrypted_mnemonic: encrypted.encryptedMnemonic,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      kdf_salt: encrypted.kdfSalt,
      derivation_path: derived.derivationPath,
    } as never);
  if (secretError) throw new Error(secretError.message);

  await supabaseAdmin.from("notifications").insert({
    user_id: params.userId,
    audience: "trader",
    title: "Wallet created",
    body: `${row.name} was created. Back up the recovery phrase before receiving funds.`,
    severity: "warning",
  });
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: params.userId,
    actor_type: "user",
    action: "wallet.personal_created",
    entity_type: "user_wallet",
    entity_id: row.id,
    metadata: {
      address: row.address,
      network: params.network,
      wallet_type: params.walletType,
      derivation_path: derived.derivationPath,
    },
  });

  await refreshWalletGasfreeCapability(params.userId, row.id, { force: true });
  await ensureGasFreeChildWalletForGeneral(params.userId, row.id).catch(() => undefined);

  return { wallet, recoveryPhrase: mnemonic };
}

export async function importPersonalWallet(params: {
  userId: string;
  name: string;
  network: ChainNetwork;
  walletType: "standard" | "gasfree";
  mnemonic: string;
  makeDefault: boolean;
  transactionPassword: string;
  networkConfirmed?: boolean;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { deriveTronWalletFromMnemonic } = await import("@/lib/tron-personal-wallet");
  const { encryptMnemonic, ensureTransactionPasswordForWalletAction } =
    await import("@/lib/wallet-security.server");

  await ensureTransactionPasswordForWalletAction(params.userId, params.transactionPassword);

  const derived = deriveTronWalletFromMnemonic(params.mnemonic);
  const importedWalletType = "standard";
  const networkDecision = await detectImportedNetwork(
    derived.address,
    params.network,
    params.networkConfirmed === true,
  );
  if (networkDecision.type === "requires_selection") {
    return {
      requiresNetworkSelection: true,
      reason: networkDecision.reason,
      address: derived.address,
      probes: networkDecision.probes,
    };
  }
  const detectedNetwork = networkDecision.network;
  const capability = await checkGasFreeCapability(derived.address, detectedNetwork);
  const gasStatus = capability.status;
  const hasMetadataColumns = await hasGasfreeCapabilityColumns();
  const dbGasStatus =
    !hasMetadataColumns && gasStatus === "check_failed" ? "unavailable" : gasStatus;

  const { data: duplicate, error: duplicateError } = await supabaseAdmin
    .from("user_wallets" as never)
    .select(
      "id, user_id, name, address, network, balance, onchain_balance, onchain_trx_balance, is_default, wallet_type, custody, backup_status, gas_sponsorship_status, derivation_path, created_at",
    )
    .eq("address", derived.address as never)
    .eq("is_archived", false as never)
    .limit(1);
  if (duplicateError) throw new Error(duplicateError.message);
  const duplicateRecord = ((duplicate as unknown[])?.[0] ?? null) as Record<string, unknown> | null;
  const duplicateRow = duplicateRecord as {
    id: string;
    user_id?: string | null;
    network?: ChainNetwork;
    wallet_type?: string | null;
    backup_status?: string | null;
    gas_sponsorship_status?: string | null;
  } | null;
  if (duplicateRow) {
    if (duplicateRow.user_id !== params.userId) {
      throw new Error(
        "This wallet is already linked to another WTRON account. Contact support to recover access.",
      );
    }
    const duplicateMetadata = await readWalletGasfreeMetadata(duplicateRow.id);
    const importedGasfree =
      duplicateRow.wallet_type === "gasfree" && duplicateRow.backup_status === "imported";
    const statusChanged =
      duplicateRow.gas_sponsorship_status !== dbGasStatus ||
      (hasMetadataColumns && !duplicateMetadata?.gasfree_capability_checked_at);
    if (duplicateRow.network !== detectedNetwork || importedGasfree || statusChanged) {
      const update = {
        network: detectedNetwork,
        ...(importedGasfree ? { wallet_type: importedWalletType } : {}),
        gas_sponsorship_status: dbGasStatus,
        ...(hasMetadataColumns
          ? {
              gasfree_capability_checked_at: capability.checkedAt,
              gasfree_capability_error: capability.error,
              gasfree_capability_metadata: capability.metadata,
            }
          : {}),
        onchain_checked_at: null,
        onchain_trx_checked_at: null,
        last_synced_at: null,
      };
      await supabaseAdmin
        .from("user_wallets" as never)
        .update(update as never)
        .eq("id", duplicateRow.id as never);
    }
    if (params.makeDefault) {
      await supabaseAdmin
        .from("user_wallets" as never)
        .update({ is_default: true, selected_at: new Date().toISOString() } as never)
        .eq("id", duplicateRow.id as never);
    }
    await refreshPersonalWalletOnChainBalance(params.userId, duplicateRow.id);
    await ensureGasFreeChildWalletForGeneral(params.userId, duplicateRow.id).catch(() => undefined);
    return {
      wallet: {
        ...(duplicateRecord ?? {}),
        network: detectedNetwork,
        ...(importedGasfree ? { wallet_type: importedWalletType } : {}),
        gas_sponsorship_status: gasStatus,
        ...(hasMetadataColumns
          ? {
              gasfree_capability_checked_at: capability.checkedAt,
              gasfree_capability_error: capability.error,
              gasfree_capability_metadata: capability.metadata,
            }
          : {}),
      },
      existing: true,
      message: "Wallet already exists. Existing wallet opened.",
      detectedNetwork,
    };
  }

  const encrypted = encryptMnemonic(derived.mnemonic, params.transactionPassword);
  const { data: existing, error: countError } = await supabaseAdmin
    .from("user_wallets" as never)
    .select("id")
    .eq("user_id", params.userId)
    .eq("is_archived", false);
  if (countError) throw new Error(countError.message);
  const isFirst = !existing || existing.length === 0;

  const { data: wallet, error } = await supabaseAdmin
    .from("user_wallets" as never)
    .insert({
      user_id: params.userId,
      name: params.name,
      network: detectedNetwork,
      address: derived.address,
      public_key: derived.publicKeyHex,
      custody: "non_custodial",
      wallet_type: importedWalletType,
      backup_status: "imported",
      derivation_path: derived.derivationPath,
      gas_sponsorship_status: dbGasStatus,
      ...(hasMetadataColumns
        ? {
            gasfree_capability_checked_at: capability.checkedAt,
            gasfree_capability_error: capability.error,
            gasfree_capability_metadata: capability.metadata,
          }
        : {}),
      monitored: true,
      derivation_index: 0,
      is_default: params.makeDefault || isFirst,
      selected_at: params.makeDefault || isFirst ? new Date().toISOString() : null,
    } as never)
    .select(
      "id, name, address, network, balance, onchain_balance, onchain_trx_balance, is_default, wallet_type, custody, backup_status, gas_sponsorship_status, derivation_path, created_at",
    )
    .single();
  if (isUniqueWalletAddressError(error)) {
    const { data: afterConflict } = await supabaseAdmin
      .from("user_wallets" as never)
      .select(
        "id, user_id, name, address, network, balance, onchain_balance, onchain_trx_balance, is_default, wallet_type, custody, backup_status, gas_sponsorship_status, derivation_path, created_at",
      )
      .eq("address", derived.address as never)
      .eq("is_archived", false as never)
      .limit(1);
    const row = ((afterConflict as unknown[])?.[0] ?? null) as
      ({ id: string; user_id?: string | null } & Record<string, unknown>) | null;
    if (row?.user_id === params.userId) {
      await refreshPersonalWalletOnChainBalance(params.userId, row.id);
      return {
        wallet: row,
        existing: true,
        message: "Wallet already exists. Existing wallet opened.",
        detectedNetwork,
      };
    }
    throw new Error(
      "This wallet is already linked to another WTRON account. Contact support to recover access.",
    );
  }
  if (error) throw new Error(error.message);

  const row = wallet as unknown as { id: string; name: string; address: string };
  const { error: secretError } = await supabaseAdmin
    .from("personal_wallet_secrets" as never)
    .insert({
      wallet_id: row.id,
      user_id: params.userId,
      encrypted_mnemonic: encrypted.encryptedMnemonic,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      kdf_salt: encrypted.kdfSalt,
      derivation_path: derived.derivationPath,
    } as never);
  if (secretError) throw new Error(secretError.message);

  await supabaseAdmin.from("notifications").insert({
    user_id: params.userId,
    audience: "trader",
    title: "Wallet imported",
    body: `${row.name} was imported from a recovery phrase.`,
    severity: "success",
  });
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: params.userId,
    actor_type: "user",
    action: "wallet.personal_imported",
    entity_type: "user_wallet",
    entity_id: row.id,
    metadata: {
      address: row.address,
      network: detectedNetwork,
      requested_network: params.network,
      wallet_type: importedWalletType,
      derivation_path: derived.derivationPath,
    },
  });

  await refreshPersonalWalletOnChainBalance(params.userId, row.id);
  await refreshWalletGasfreeCapability(params.userId, row.id, { force: true });
  await ensureGasFreeChildWalletForGeneral(params.userId, row.id).catch(() => undefined);

  return { wallet };
}

export async function revealWalletRecoveryPhrase(params: {
  userId: string;
  walletId: string;
  transactionPassword: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptMnemonic, verifyTransactionPasswordOrThrow } =
    await import("@/lib/wallet-security.server");
  await verifyTransactionPasswordOrThrow(params.userId, params.transactionPassword);

  const { data: wallet, error: walletError } = await supabaseAdmin
    .from("user_wallets" as never)
    .select("id, user_id, backup_status")
    .eq("id", params.walletId)
    .maybeSingle();
  if (walletError) throw new Error(walletError.message);
  const walletRow = wallet as unknown as { id: string; user_id: string } | null;
  if (!walletRow || walletRow.user_id !== params.userId) throw new Error("Wallet not found");

  const { data: secret, error } = await supabaseAdmin
    .from("personal_wallet_secrets" as never)
    .select("encrypted_mnemonic, iv, auth_tag, kdf_salt")
    .eq("wallet_id", params.walletId as never)
    .eq("user_id", params.userId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!secret) throw new Error("Recovery phrase is not available for this wallet");

  const row = secret as {
    encrypted_mnemonic: string;
    iv: string;
    auth_tag: string;
    kdf_salt: string;
  };
  await supabaseAdmin
    .from("user_wallets")
    .update({ backup_status: "backed_up", backup_confirmed_at: new Date().toISOString() } as never)
    .eq("id", params.walletId);

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: params.userId,
    actor_type: "user",
    action: "wallet.recovery_phrase_revealed",
    entity_type: "user_wallet",
    entity_id: params.walletId,
  });

  return {
    recoveryPhrase: decryptMnemonic({
      encryptedMnemonic: row.encrypted_mnemonic,
      iv: row.iv,
      authTag: row.auth_tag,
      kdfSalt: row.kdf_salt,
      password: params.transactionPassword,
    }),
  };
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

export async function refreshPersonalWalletOnChainBalance(
  userId: string,
  walletId: string,
  options: { forceGasfreeCheck?: boolean } = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const {
    getAccountResources,
    getIncomingUsdtTransfers,
    getNativeTrxBalance,
    getNativeTrxTransfers,
    getOutgoingUsdtTransfers,
  } = await import("@/lib/tron.server");
  const { readTrc20Balance } = await import("@/lib/tron-transfer.server");

  const { data: wallet, error } = await supabaseAdmin
    .from("user_wallets")
    .select("id, user_id, address, network, custody, is_archived")
    .eq("id", walletId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!wallet || wallet.user_id !== userId || wallet.is_archived)
    throw new Error("Wallet not found");

  const historyOptions = { limit: 200, paginate: true, maxPages: 20 };
  const [balance, trxBalance, resources] = await Promise.all([
    readTrc20Balance(wallet.network, wallet.address),
    getNativeTrxBalance(wallet.network, wallet.address),
    getAccountResources(wallet.network, wallet.address),
  ]);
  if (balance === null || trxBalance === null) {
    throw new Error("Could not refresh on-chain wallet balances");
  }

  const checkedAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("user_wallets")
    .update({
      onchain_balance: balance,
      onchain_trx_balance: trxBalance,
      onchain_checked_at: checkedAt,
      onchain_trx_checked_at: checkedAt,
      last_synced_at: checkedAt,
    } as never)
    .eq("id", wallet.id);
  if (updateError) throw new Error(updateError.message);

  let historySyncError: string | null = null;
  const [incomingResult, outgoingResult, incomingTrxResult, outgoingTrxResult] =
    await Promise.allSettled([
      getIncomingUsdtTransfers(wallet.network, wallet.address, historyOptions),
      getOutgoingUsdtTransfers(wallet.network, wallet.address, historyOptions),
      getNativeTrxTransfers(wallet.network, wallet.address, "in", historyOptions),
      getNativeTrxTransfers(wallet.network, wallet.address, "out", historyOptions),
    ]);
  const historyError = [incomingResult, outgoingResult, incomingTrxResult, outgoingTrxResult].find(
    (result) => result.status === "rejected",
  );
  if (historyError?.status === "rejected") {
    historySyncError =
      historyError.reason instanceof Error
        ? historyError.reason.message
        : "Could not read wallet history";
  }

  const incoming = incomingResult.status === "fulfilled" ? incomingResult.value : [];
  const outgoing = outgoingResult.status === "fulfilled" ? outgoingResult.value : [];
  const incomingTrx = incomingTrxResult.status === "fulfilled" ? incomingTrxResult.value : [];
  const outgoingTrx = outgoingTrxResult.status === "fulfilled" ? outgoingTrxResult.value : [];

  const transactions = [
    ...incoming.map((transfer) => ({
      wallet_id: wallet.id,
      user_id: userId,
      direction: "in" as const,
      kind: "deposit" as const,
      status: "completed" as const,
      amount: transfer.amount,
      fee: 0,
      currency: "USDT",
      counterparty_address: transfer.from || null,
      network: wallet.network,
      txid: transfer.txid,
      onchain: true,
      block_number: null,
      memo: "On-chain USDT receipt",
      created_at: new Date(transfer.blockTimestamp).toISOString(),
    })),
    ...outgoing.map((transfer) => ({
      wallet_id: wallet.id,
      user_id: userId,
      direction: "out" as const,
      kind: "transfer" as const,
      status: "completed" as const,
      amount: transfer.amount,
      fee: 0,
      currency: "USDT",
      counterparty_address: transfer.to || null,
      network: wallet.network,
      txid: transfer.txid,
      onchain: true,
      block_number: null,
      memo: "On-chain USDT transfer",
      created_at: new Date(transfer.blockTimestamp).toISOString(),
    })),
    ...incomingTrx.map((transfer) => ({
      wallet_id: wallet.id,
      user_id: userId,
      direction: "in" as const,
      kind: "deposit" as const,
      status: "completed" as const,
      amount: transfer.amount,
      fee: 0,
      currency: "TRX",
      counterparty_address: transfer.from || null,
      network: wallet.network,
      txid: transfer.txid,
      onchain: true,
      block_number: null,
      memo: "On-chain TRX receipt",
      created_at: new Date(transfer.blockTimestamp).toISOString(),
    })),
    ...outgoingTrx.map((transfer) => ({
      wallet_id: wallet.id,
      user_id: userId,
      direction: "out" as const,
      kind: "transfer" as const,
      status: "completed" as const,
      amount: transfer.amount,
      fee: 0,
      currency: "TRX",
      counterparty_address: transfer.to || null,
      network: wallet.network,
      txid: transfer.txid,
      onchain: true,
      block_number: null,
      memo: "On-chain TRX transfer",
      created_at: new Date(transfer.blockTimestamp).toISOString(),
    })),
  ];

  if (transactions.length) {
    const txids = Array.from(new Set(transactions.map((transaction) => transaction.txid)));
    const historyKey = (transaction: {
      network: string;
      txid: string;
      currency: string;
      direction: string;
    }) =>
      `${transaction.network}:${transaction.txid}:${transaction.currency}:${transaction.direction}`;

    const existingRows: Array<{
      txid: string | null;
      currency: string;
      direction: string;
      network: string;
    }> = [];
    let existingErrorMessage: string | null = null;
    for (let index = 0; index < txids.length; index += 100) {
      const chunk = txids.slice(index, index + 100);
      const { data: chunkRows, error: existingError } = await supabaseAdmin
        .from("wallet_transactions")
        .select("txid, currency, direction, network")
        .eq("wallet_id", wallet.id)
        .in("txid", chunk);
      if (existingError) {
        existingErrorMessage = existingError.message;
        break;
      }
      existingRows.push(...((chunkRows ?? []) as typeof existingRows));
    }
    if (existingErrorMessage) {
      historySyncError = `Could not read wallet history: ${existingErrorMessage}`;
    } else {
      const existingKeys = new Set(
        (existingRows ?? [])
          .map((row) =>
            row.txid
              ? historyKey({
                  network: row.network,
                  txid: row.txid,
                  currency: row.currency,
                  direction: row.direction,
                })
              : null,
          )
          .filter((key): key is string => Boolean(key)),
      );
      const seenKeys = new Set<string>();
      const missingTransactions = transactions.filter((transaction) => {
        const key = historyKey(transaction);
        if (existingKeys.has(key) || seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      for (let index = 0; index < missingTransactions.length; index += 100) {
        const chunk = missingTransactions.slice(index, index + 100);
        const { error: insertHistoryError } = chunk.length
          ? await supabaseAdmin.from("wallet_transactions" as never).insert(chunk as never)
          : { error: null };
        if (insertHistoryError) {
          historySyncError = `Could not sync wallet history: ${insertHistoryError.message}`;
          break;
        }
      }
    }
  }

  const gasfree = await refreshWalletGasfreeCapability(userId, wallet.id, {
    force: options.forceGasfreeCheck === true,
  }).catch((error: unknown) => ({
    walletId: wallet.id,
    status: "check_failed" as const,
    checkedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : "GasFree capability check failed",
    metadata: {},
    cached: false,
    persisted: false,
  }));

  return {
    walletId: wallet.id,
    balance,
    trxBalance,
    resources,
    checkedAt,
    gasfree,
    historySyncError,
  };
}

export async function executeTransfer(
  client: Client,
  userId: string,
  input: {
    walletId: string;
    toAddress: string;
    amount: number;
    memo?: string | undefined;
    transactionPassword?: string | undefined;
  },
) {
  const { verifyTransactionPasswordOrThrow } = await import("@/lib/wallet-security.server");
  await verifyTransactionPasswordOrThrow(userId, input.transactionPassword ?? "");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: sourceWallet, error: sourceError } = await supabaseAdmin
    .from("user_wallets")
    .select("id, user_id, custody")
    .eq("id", input.walletId)
    .maybeSingle();
  if (sourceError) throw new Error(sourceError.message);
  if (!sourceWallet || sourceWallet.user_id !== userId) throw new Error("Wallet not found");
  if (sourceWallet.custody === "non_custodial") {
    throw new Error("On-chain sending is not enabled yet.");
  }

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
