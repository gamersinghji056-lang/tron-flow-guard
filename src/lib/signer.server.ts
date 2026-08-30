import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ChainNetwork } from "@/lib/chain";
import {
  assertSendAmount,
  assertSigningSwitches,
  assertSufficientBalance,
  assertValidTronAddress,
  type SendAsset,
} from "@/lib/signer-policy";
import { safeErrorMessage, writeServiceHeartbeat } from "@/lib/system-health.server";
import {
  DEFAULT_TRX_MAX_TRANSFER_FEE,
  DEFAULT_TRX_MIN_TRANSFER_FEE,
  DEFAULT_TRX_WTRON_MARGIN,
  DEFAULT_USDT_WTRON_MARGIN_TRX,
  calculateNormalUsdtTrxFee,
  calculateTrxTransferFee,
} from "@/lib/transfer-fee-policy";

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T | null) ?? fallback;
}

async function readNumericSetting(key: string, fallback: number): Promise<number> {
  const value = await readSetting<unknown>(key, fallback);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function feeCollectionWalletSettingKeys(network: ChainNetwork) {
  if (network === "trc20-nile") {
    return ["fee_collection_wallet_id_trc20_nile", "fee_collection_wallet_id"] as const;
  }
  return ["fee_collection_wallet_id_trc20_mainnet", "fee_collection_wallet_id"] as const;
}

function parseFeeCollectionWalletSetting(value: unknown) {
  if (typeof value === "string") return value.replace(/^"|"$/g, "") || null;
  if (value == null) return null;
  return String(value).replace(/^"|"$/g, "") || null;
}

async function feeDestinationForNetwork(network: ChainNetwork) {
  for (const settingKey of feeCollectionWalletSettingKeys(network)) {
    const walletId = parseFeeCollectionWalletSetting(await readSetting<unknown>(settingKey, null));
    if (!walletId) continue;
    const { data: wallet, error } = await supabaseAdmin
      .from("wallets" as never)
      .select("id, address, network, is_active, purpose")
      .eq("id", walletId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = wallet as {
      id?: string | null;
      address?: string | null;
      network?: ChainNetwork | null;
      is_active?: boolean | null;
      purpose?: string | null;
    } | null;
    if (
      row?.id &&
      row.network === network &&
      row.is_active === true &&
      row.purpose === "FEE_COLLECTION"
    ) {
      return { id: row.id, address: row.address ?? null };
    }
  }
  return null;
}

async function assertFeeCollectionReady(input: {
  network: ChainNetwork;
  amount: number;
  currency: SendAsset;
}) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return null;
  const destination = await feeDestinationForNetwork(input.network);
  if (!destination?.id || !destination.address) {
    throw new Error(`${input.currency}_FEE_COLLECTION_WALLET_NOT_CONFIGURED`);
  }
  return destination;
}

async function recordWalletSendFeeLiability(input: {
  requestId: string;
  userId: string;
  network: ChainNetwork;
  amount: number;
  currency: SendAsset;
  destinationWalletId?: string | null;
}) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return;
  const destinationWalletId =
    input.destinationWalletId ?? (await feeDestinationForNetwork(input.network))?.id;
  const { error } = await supabaseAdmin.from("fee_liabilities" as never).insert({
    source: "wallet_send_request",
    order_id: input.requestId,
    user_id: input.userId,
    vendor_id: null,
    fee_type:
      input.currency === "USDT" ? "wallet_send_customer_fee_usdt" : "wallet_send_customer_fee_trx",
    amount: input.amount,
    currency: input.currency,
    destination_wallet_id: destinationWalletId,
    status: destinationWalletId ? "PENDING_SWEEP" : "ACCRUED",
    idempotency_key: `wallet-send:${input.requestId}:customer-fee`,
  } as never);
  if (error && error.code !== "23505") throw new Error(error.message);
}

async function reconcileWalletActiveSendRequests(walletId: string, network: ChainNetwork) {
  const { data } = await supabaseAdmin
    .from("wallet_send_requests" as never)
    .select("id, txid, wallet_transaction_id")
    .eq("wallet_id", walletId as never)
    .eq("network", network as never)
    .in("status", ["BROADCAST", "CONFIRMING"] as never)
    .not("txid", "is", null)
    .limit(10);
  const rows = (data ?? []) as Array<{
    id: string;
    txid?: string | null;
    wallet_transaction_id?: string | null;
  }>;
  if (!rows.length) return;
  const { getTransactionInfo } = await import("@/lib/tron.server");
  for (const row of rows) {
    if (!row.txid) continue;
    const info = await getTransactionInfo(network, row.txid);
    if (!info.blockNumber) {
      await supabaseAdmin
        .from("wallet_send_requests" as never)
        .update({ status: "CONFIRMING" } as never)
        .eq("id", row.id as never);
      continue;
    }
    const status = info.success ? "CONFIRMED" : "FAILED";
    await supabaseAdmin
      .from("wallet_send_requests" as never)
      .update({
        status,
        confirmed_at: info.success ? new Date().toISOString() : null,
        failed_at: info.success ? null : new Date().toISOString(),
        failure_code: info.success ? null : info.status,
        safe_failure_message: info.success ? null : info.status,
      } as never)
      .eq("id", row.id as never);
    if (row.wallet_transaction_id) {
      await supabaseAdmin
        .from("wallet_transactions" as never)
        .update({
          status: info.success ? "completed" : "failed",
          block_number: info.blockNumber,
          failure_reason: info.success ? null : info.status,
        } as never)
        .eq("id", row.wallet_transaction_id as never);
    }
  }
}

async function buildTransferCostQuote(input: {
  asset: SendAsset;
  network: ChainNetwork;
  ownerAddress: string;
  toAddress: string;
  amount: number;
}) {
  const { estimateTrc20TransferEnergy, estimateTrxTransferNetworkCost } =
    await import("@/lib/tron-transfer.server");
  if (input.asset === "USDT") {
    const energyRouteEnabled = await readSetting("tron_energy_route_enabled", false);
    const energyProvider = await readSetting<"tronrental">("tron_energy_provider", "tronrental");
    const estimatedEnergy = await estimateTrc20TransferEnergy(input);
    let providerCostUsdt = 0;
    let providerCostTrx = 0;
    let providerQuote: unknown = null;
    let purchasedEnergy = 0;
    if (energyRouteEnabled === true) {
      const { quoteEnergy } = await import("@/lib/energy-provider.server");
      const quote = await quoteEnergy({
        energyRequired: estimatedEnergy,
        provider: energyProvider,
      });
      providerCostUsdt = quote.priceUsdt;
      providerCostTrx = quote.priceTrx;
      providerQuote = quote.raw;
      purchasedEnergy = quote.energyAmount;
    }
    const fee = calculateNormalUsdtTrxFee({
      providerCostTrx,
      providerCostUsdt,
      marginTrx: await readNumericSetting(
        "usdt_trx_transfer_fee_margin",
        DEFAULT_USDT_WTRON_MARGIN_TRX,
      ),
    });
    return {
      asset: input.asset,
      estimatedNetworkFeeTrx: fee.customerFeeTrx,
      platformFee: fee.customerFeeTrx,
      totalDebit: input.amount,
      customerFeeUsdt: 0,
      providerCostUsdt,
      providerCostTrx,
      wtronRevenueUsdt: 0,
      estimatedEnergy,
      purchasedEnergy,
      networkCostTrx: 0,
      customerFeeTrx: fee.customerFeeTrx,
      wtronRevenueTrx: fee.wtronRevenueTrx,
      feeCurrency: "TRX" as const,
      provider: energyRouteEnabled === true ? energyProvider : null,
      providerQuote,
      blocked: fee.blocked,
      blockCode: fee.blockCode,
    };
  }

  const networkCostTrx = await estimateTrxTransferNetworkCost(input);
  const trxFee = calculateTrxTransferFee({
    networkCostTrx,
    marginTrx: await readNumericSetting("trx_transfer_fee_margin", DEFAULT_TRX_WTRON_MARGIN),
    minFeeTrx: await readNumericSetting("trx_min_transfer_fee", DEFAULT_TRX_MIN_TRANSFER_FEE),
    maxFeeTrx: await readNumericSetting("trx_max_transfer_fee", DEFAULT_TRX_MAX_TRANSFER_FEE),
  });
  return {
    asset: input.asset,
    estimatedNetworkFeeTrx: trxFee.networkCostTrx,
    platformFee: trxFee.customerFeeTrx,
    totalDebit: input.amount + trxFee.customerFeeTrx,
    customerFeeUsdt: 0,
    providerCostUsdt: 0,
    providerCostTrx: 0,
    wtronRevenueUsdt: 0,
    estimatedEnergy: 0,
    purchasedEnergy: 0,
    networkCostTrx: trxFee.networkCostTrx,
    customerFeeTrx: trxFee.customerFeeTrx,
    wtronRevenueTrx: trxFee.wtronRevenueTrx,
    feeCurrency: "TRX" as const,
    provider: null,
    providerQuote: null,
    blocked: trxFee.blocked,
    blockCode: trxFee.blockCode,
  };
}

async function auditSigner(input: {
  requestId?: string | null;
  actorId?: string | null;
  walletId?: string | null;
  asset?: SendAsset | null;
  amount?: number | null;
  destination?: string | null;
  network?: ChainNetwork | null;
  result: string;
  txid?: string | null;
  message?: unknown;
}) {
  await supabaseAdmin.from("signer_audit_logs" as never).insert({
    request_id: input.requestId ?? null,
    actor_id: input.actorId ?? null,
    actor_type: input.actorId ? "user" : "system",
    wallet_id: input.walletId ?? null,
    asset: input.asset ?? null,
    amount: input.amount ?? null,
    destination: input.destination ?? null,
    network: input.network ?? null,
    result: input.result,
    txid: input.txid ?? null,
    safe_message: input.message ? safeErrorMessage(input.message) : null,
  } as never);
}

export async function createAndBroadcastPersonalSend(input: {
  userId: string;
  walletId: string;
  asset: SendAsset;
  toAddress: string;
  amount: number;
  transactionPassword: string;
  idempotencyKey: string;
  memo?: string | undefined;
}) {
  const { verifyTransactionPasswordOrThrow, decryptMnemonic } =
    await import("@/lib/wallet-security.server");
  await verifyTransactionPasswordOrThrow(input.userId, input.transactionPassword);

  assertValidTronAddress(input.toAddress);
  assertSendAmount(input.asset, input.amount);

  const { data: existing } = await supabaseAdmin
    .from("wallet_send_requests" as never)
    .select("*")
    .eq("user_id", input.userId as never)
    .eq("wallet_id", input.walletId as never)
    .eq("idempotency_key", input.idempotencyKey as never)
    .maybeSingle();
  if (existing) return existing;

  const { data: wallet, error: walletError } = await supabaseAdmin
    .from("user_wallets")
    .select(
      "id, user_id, address, network, custody, wallet_type, gas_sponsorship_status, derivation_path, is_archived",
    )
    .eq("id", input.walletId)
    .maybeSingle();
  if (walletError) throw new Error(walletError.message);
  if (!wallet || wallet.user_id !== input.userId || wallet.is_archived) {
    throw new Error("Wallet not found");
  }
  if (input.toAddress.trim() === wallet.address) throw new Error("Cannot send to the same wallet");
  if (wallet.wallet_type === "gasfree") {
    throw new Error("Use GasFree Send for this USDT-only wallet.");
  }

  const network = wallet.network as ChainNetwork;
  await reconcileWalletActiveSendRequests(wallet.id, network);
  const costQuote = await buildTransferCostQuote({
    asset: input.asset,
    network,
    ownerAddress: wallet.address,
    toAddress: input.toAddress.trim(),
    amount: input.amount,
  });
  if (costQuote.blocked) throw new Error(costQuote.blockCode ?? "Transfer cost is too high");
  const estimatedNetworkFeeTrx = costQuote.estimatedNetworkFeeTrx;
  const platformFee = costQuote.platformFee;
  const totalDebit = costQuote.totalDebit;
  const feeCurrency = costQuote.feeCurrency;
  const feeLiabilityAmount = platformFee;
  const feeDestination = await assertFeeCollectionReady({
    network,
    amount: feeLiabilityAmount,
    currency: feeCurrency,
  });

  const { data: request, error: requestError } = await supabaseAdmin
    .from("wallet_send_requests" as never)
    .insert({
      user_id: input.userId,
      wallet_id: input.walletId,
      idempotency_key: input.idempotencyKey,
      asset: input.asset,
      network,
      from_address: wallet.address,
      to_address: input.toAddress.trim(),
      amount: input.amount,
      estimated_network_fee_trx: estimatedNetworkFeeTrx,
      platform_fee: platformFee,
      total_debit: totalDebit,
      customer_fee_usdt: costQuote.customerFeeUsdt,
      provider_cost_usdt: costQuote.providerCostUsdt,
      provider_cost_trx: costQuote.providerCostTrx,
      wtron_revenue_usdt: costQuote.wtronRevenueUsdt,
      customer_fee_trx: costQuote.customerFeeTrx,
      network_cost_trx: costQuote.networkCostTrx,
      wtron_revenue_trx: costQuote.wtronRevenueTrx,
      energy_estimated: costQuote.estimatedEnergy,
      energy_purchased: costQuote.purchasedEnergy,
      energy_provider: costQuote.provider,
      provider_quote: costQuote.providerQuote ?? {},
      status: "CREATED",
      metadata: {
        memo: input.memo ?? null,
        signer_boundary: "server_module_v1",
        customer_fee_currency: feeCurrency,
        internal_provider_quote: costQuote.providerQuote,
      },
    } as never)
    .select("*")
    .single();
  if (requestError) {
    if (requestError.code === "23505") {
      throw new Error("Another send is already active for this wallet");
    }
    throw new Error(requestError.message);
  }
  const requestId = (request as { id: string }).id;

  try {
    assertSigningSwitches({
      dbEnabled: await readSetting("on_chain_send_enabled", false),
      envEnabled: process.env["TRON_SIGNING_ENABLED"],
      network,
      mainnetEnabled:
        (await readSetting("tron_signing_mainnet_enabled", false)) &&
        process.env["TRON_SIGNING_MAINNET_ENABLED"] === "true"
          ? "true"
          : "false",
    });

    const { refreshPersonalWalletOnChainBalance } = await import("@/lib/wallets.server");
    const balances = await refreshPersonalWalletOnChainBalance(input.userId, input.walletId);
    assertSufficientBalance({
      asset: input.asset,
      amount: totalDebit,
      usdtBalance: balances.balance,
      trxBalance: balances.trxBalance,
      estimatedTrxRequired: estimatedNetworkFeeTrx,
    });

    const { data: secret, error: secretError } = await supabaseAdmin
      .from("personal_wallet_secrets" as never)
      .select("encrypted_mnemonic, iv, auth_tag, kdf_salt, derivation_path")
      .eq("wallet_id", input.walletId as never)
      .eq("user_id", input.userId as never)
      .maybeSingle();
    if (secretError) throw new Error(secretError.message);
    if (!secret) throw new Error("Signing material is not available for this wallet");

    await supabaseAdmin
      .from("wallet_send_requests" as never)
      .update({ status: "SIGNING", authorized_at: new Date().toISOString() } as never)
      .eq("id", requestId as never);

    const secretRow = secret as {
      encrypted_mnemonic: string;
      iv: string;
      auth_tag: string;
      kdf_salt: string;
      derivation_path?: string | null;
    };
    const { deriveTronWalletFromMnemonic } = await import("@/lib/tron-personal-wallet");
    const mnemonic = decryptMnemonic({
      encryptedMnemonic: secretRow.encrypted_mnemonic,
      iv: secretRow.iv,
      authTag: secretRow.auth_tag,
      kdfSalt: secretRow.kdf_salt,
      password: input.transactionPassword,
    });
    const derived = deriveTronWalletFromMnemonic(mnemonic, secretRow.derivation_path ?? undefined);
    if (derived.address !== wallet.address) throw new Error("Derived key does not match wallet");

    const {
      assertTransferSignerAuthorized,
      broadcastSignedTrc20Transfer,
      broadcastSignedTrxTransfer,
    } = await import("@/lib/tron-transfer.server");
    const permission = await assertTransferSignerAuthorized({
      network,
      ownerAddress: wallet.address,
      signerAddress: derived.address,
      asset: input.asset,
    });
    const feePermission =
      input.asset === "USDT" && feeCurrency === "TRX" && platformFee > 0
        ? await assertTransferSignerAuthorized({
            network,
            ownerAddress: wallet.address,
            signerAddress: derived.address,
            asset: "TRX",
          })
        : null;
    await supabaseAdmin
      .from("wallet_send_requests" as never)
      .update({
        status: "BROADCASTING",
        signed_at: new Date().toISOString(),
        metadata: {
          memo: input.memo ?? null,
          customer_fee_currency: feeCurrency,
          signer_boundary: "server_module_v1",
          permission_id: permission.permissionId,
          permission_name: permission.permissionName,
          permission_source: permission.source,
          fee_permission_id: feePermission?.permissionId ?? null,
          fee_destination_wallet_id: feeDestination?.id ?? null,
        },
      } as never)
      .eq("id", requestId as never);

    let energyOrderId: string | null = null;
    if (input.asset === "USDT" && costQuote.provider === "tronrental") {
      const { getEnergyOrderStatus, purchaseEnergy } = await import("@/lib/energy-provider.server");
      const energyOrder = await purchaseEnergy({
        receiver: wallet.address,
        energyRequired: costQuote.estimatedEnergy,
        provider: costQuote.provider,
      });
      energyOrderId = energyOrder.providerOrderId || null;
      let energyOrderStatus = energyOrder.status;
      for (
        let attempt = 0;
        energyOrderId && attempt < 5 && energyOrderStatus.toLowerCase() === "pending";
        attempt += 1
      ) {
        await sleep(1_500);
        const status = await getEnergyOrderStatus(energyOrderId);
        energyOrderStatus = status.status;
      }
      if (!["filled", "completed", "success"].includes(energyOrderStatus.toLowerCase())) {
        throw new Error("Energy provider order is not ready");
      }
      await supabaseAdmin
        .from("wallet_send_requests" as never)
        .update({
          provider_order_id: energyOrderId,
          provider_order_status: energyOrderStatus,
          energy_purchased: energyOrder.energyAmount,
          provider_cost_trx: energyOrder.priceTrx,
          provider_cost_usdt: energyOrder.priceUsdt,
          actual_provider_cost_usdt: energyOrder.priceUsdt,
          metadata: {
            memo: input.memo ?? null,
            customer_fee_currency: feeCurrency,
            signer_boundary: "server_module_v1",
            permission_id: permission.permissionId,
            permission_name: permission.permissionName,
            permission_source: permission.source,
            fee_permission_id: feePermission?.permissionId ?? null,
            fee_destination_wallet_id: feeDestination?.id ?? null,
            energy_order_status: energyOrderStatus,
            energy_order: energyOrder.raw,
          },
        } as never)
        .eq("id", requestId as never);
    }

    let feeTxid: string | null = null;
    let feeWalletTransactionId: string | null = null;
    if (input.asset === "USDT" && feeCurrency === "TRX" && platformFee > 0) {
      if (!feeDestination?.address) throw new Error("TRX_FEE_COLLECTION_WALLET_NOT_CONFIGURED");
      const feeBroadcast = await broadcastSignedTrxTransfer({
        network,
        privateKeyHex: derived.privateKeyHex,
        ownerAddress: wallet.address,
        toAddress: feeDestination.address,
        amount: platformFee,
        permissionId: feePermission?.permissionId ?? null,
      });
      if (!feeBroadcast.ok || !feeBroadcast.txid) {
        throw new Error(feeBroadcast.error ?? "Fee transfer rejected");
      }
      feeTxid = feeBroadcast.txid;
      const { data: feeWalletTx } = await supabaseAdmin
        .from("wallet_transactions" as never)
        .insert({
          wallet_id: input.walletId,
          user_id: input.userId,
          direction: "out",
          kind: "fee",
          status: "broadcasting",
          amount: platformFee,
          fee: 0,
          currency: "TRX",
          counterparty_address: feeDestination.address,
          memo: "WTRON transfer fee",
          network,
          txid: feeTxid,
          onchain: true,
        } as never)
        .select("id")
        .single();
      feeWalletTransactionId = (feeWalletTx as { id?: string } | null)?.id ?? null;
      await supabaseAdmin
        .from("wallet_send_requests" as never)
        .update({
          metadata: {
            memo: input.memo ?? null,
            customer_fee_currency: feeCurrency,
            signer_boundary: "server_module_v1",
            permission_id: permission.permissionId,
            permission_name: permission.permissionName,
            permission_source: permission.source,
            fee_permission_id: feePermission?.permissionId ?? null,
            fee_destination_wallet_id: feeDestination.id,
            fee_txid: feeTxid,
            fee_wallet_transaction_id: feeWalletTransactionId,
          },
        } as never)
        .eq("id", requestId as never);
    }

    const broadcast =
      input.asset === "USDT"
        ? await broadcastSignedTrc20Transfer({
            network,
            privateKeyHex: derived.privateKeyHex,
            ownerAddress: wallet.address,
            toAddress: input.toAddress.trim(),
            amount: input.amount,
            permissionId: permission.permissionId,
          })
        : await broadcastSignedTrxTransfer({
            network,
            privateKeyHex: derived.privateKeyHex,
            ownerAddress: wallet.address,
            toAddress: input.toAddress.trim(),
            amount: input.amount,
            permissionId: permission.permissionId,
          });

    if (!broadcast.ok || !broadcast.txid) {
      throw new Error(broadcast.error ?? "Broadcast rejected");
    }

    const { data: walletTx } = await supabaseAdmin
      .from("wallet_transactions" as never)
      .insert({
        wallet_id: input.walletId,
        user_id: input.userId,
        direction: "out",
        kind: "transfer",
        status: "broadcasting",
        amount: input.amount,
        fee: platformFee,
        currency: input.asset,
        counterparty_address: input.toAddress.trim(),
        memo: input.memo ?? null,
        network,
        txid: broadcast.txid,
        onchain: true,
      } as never)
      .select("id")
      .single();

    const { data: updated } = await supabaseAdmin
      .from("wallet_send_requests" as never)
      .update({
        status: "BROADCAST",
        txid: broadcast.txid,
        broadcast_at: new Date().toISOString(),
        provider_order_id: energyOrderId,
        broadcast_result: {
          ok: true,
          txid: broadcast.txid,
          provider_order_id: energyOrderId,
          fee_txid: feeTxid,
        },
        wallet_transaction_id: (walletTx as { id?: string } | null)?.id ?? null,
      } as never)
      .eq("id", requestId as never)
      .select("*")
      .single();

    try {
      await recordWalletSendFeeLiability({
        requestId,
        userId: input.userId,
        network,
        amount: feeLiabilityAmount,
        currency: feeCurrency,
        destinationWalletId: feeDestination?.id ?? null,
      });
    } catch (liabilityError) {
      await supabaseAdmin
        .from("wallet_send_requests" as never)
        .update({
          metadata: {
            memo: input.memo ?? null,
            customer_fee_currency: feeCurrency,
            fee_liability_error:
              liabilityError instanceof Error ? liabilityError.message : "Fee liability failed",
          },
        } as never)
        .eq("id", requestId as never);
    }

    await writeServiceHeartbeat({
      service: "SIGNER",
      status: "HEALTHY",
      message: "Last signing request broadcast",
      metadata: {
        network,
        mainnetEnabled: process.env["TRON_SIGNING_MAINNET_ENABLED"] === "true",
      },
    });
    await auditSigner({
      requestId,
      actorId: input.userId,
      walletId: input.walletId,
      asset: input.asset,
      amount: input.amount,
      destination: input.toAddress.trim(),
      network,
      result: "BROADCAST",
      txid: broadcast.txid,
    });
    return updated;
  } catch (error) {
    const safe = safeErrorMessage(error);
    await supabaseAdmin
      .from("wallet_send_requests" as never)
      .update({
        status: "FAILED",
        failure_code: safe,
        safe_failure_message: safe,
        failed_at: new Date().toISOString(),
        broadcast_result: { ok: false, error: safe },
      } as never)
      .eq("id", requestId as never);
    await writeServiceHeartbeat({
      service: "SIGNER",
      status: safe.includes("DISABLED") ? "DISABLED" : "DEGRADED",
      message: safe,
      errorCode: safe,
      metadata: { network },
    });
    await auditSigner({
      requestId,
      actorId: input.userId,
      walletId: input.walletId,
      asset: input.asset,
      amount: input.amount,
      destination: input.toAddress.trim(),
      network,
      result: "FAILED",
      message: safe,
    });
    throw new Error(safe);
  }
}

export async function previewPersonalSendCost(input: {
  userId: string;
  walletId: string;
  asset: SendAsset;
  toAddress: string;
  amount: number;
}) {
  assertValidTronAddress(input.toAddress);
  assertSendAmount(input.asset, input.amount);
  const { data: wallet, error } = await supabaseAdmin
    .from("user_wallets" as never)
    .select(
      "id, user_id, address, network, wallet_type, wallet_role, custody, is_archived, onchain_balance, onchain_trx_balance",
    )
    .eq("id", input.walletId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = wallet as {
    id?: string;
    user_id?: string | null;
    address?: string | null;
    network?: ChainNetwork | null;
    wallet_type?: string | null;
    wallet_role?: string | null;
    custody?: string | null;
    is_archived?: boolean | null;
    onchain_balance?: number | string | null;
    onchain_trx_balance?: number | string | null;
  } | null;
  if (!row || row.user_id !== input.userId || row.is_archived) throw new Error("Wallet not found");
  if (!row.address || !row.network) throw new Error("Wallet is missing chain metadata");
  if (row.wallet_type === "gasfree" || row.wallet_role === "gasfree") {
    throw new Error("Use GasFree Send for this USDT-only wallet.");
  }
  const quote = await buildTransferCostQuote({
    asset: input.asset,
    network: row.network,
    ownerAddress: row.address,
    toAddress: input.toAddress.trim(),
    amount: input.amount,
  });
  const [signerSecretResult, transactionPasswordResult] = await Promise.all([
    supabaseAdmin
      .from("personal_wallet_secrets" as never)
      .select("wallet_id")
      .eq("wallet_id", input.walletId as never)
      .eq("user_id", input.userId as never)
      .maybeSingle(),
    supabaseAdmin
      .from("transaction_passwords" as never)
      .select("user_id, locked_until")
      .eq("user_id", input.userId as never)
      .maybeSingle(),
  ]);
  if (signerSecretResult.error) throw new Error(signerSecretResult.error.message);
  if (transactionPasswordResult.error) throw new Error(transactionPasswordResult.error.message);
  const signerSecret = signerSecretResult.data;
  const transactionPassword = transactionPasswordResult.data;
  const signingEnabled =
    (await readSetting("on_chain_send_enabled", false)) &&
    process.env["TRON_SIGNING_ENABLED"] === "true";
  const mainnetSigningEnabled =
    row.network !== "trc20-mainnet" ||
    ((await readSetting("tron_signing_mainnet_enabled", false)) &&
      process.env["TRON_SIGNING_MAINNET_ENABLED"] === "true");
  const transactionPasswordRow = transactionPassword as unknown as {
    locked_until?: string | null;
  } | null;
  const transactionPasswordLocked = Boolean(
    transactionPasswordRow?.locked_until &&
    new Date(transactionPasswordRow.locked_until).getTime() > Date.now(),
  );
  return {
    asset: input.asset,
    customerFee: quote.platformFee,
    customerFeeCurrency: quote.feeCurrency,
    totalDebit: quote.totalDebit,
    estimatedEnergy: quote.estimatedEnergy,
    provider: quote.provider,
    providerCostUsdt: quote.providerCostUsdt,
    providerCostTrx: quote.providerCostTrx,
    networkCostTrx: quote.networkCostTrx,
    wtronRevenueUsdt: quote.wtronRevenueUsdt,
    customerFeeTrx: quote.customerFeeTrx,
    wtronRevenueTrx: quote.wtronRevenueTrx,
    blocked: quote.blocked,
    blockCode: quote.blockCode,
    signingEnabled,
    mainnetSigningEnabled,
    energyRouteEnabled: quote.provider !== null,
    signerReady: Boolean(signerSecret),
    transactionPasswordConfigured: Boolean(transactionPassword),
    transactionPasswordLocked,
    availableBalance:
      input.asset === "USDT"
        ? Number(row.onchain_balance ?? 0)
        : Number(row.onchain_trx_balance ?? 0),
    availableTrxBalance: Number(row.onchain_trx_balance ?? 0),
  };
}

export async function reconcileOutgoingSendRequests(network?: ChainNetwork) {
  const { getTransactionInfo } = await import("@/lib/tron.server");
  let query = supabaseAdmin
    .from("wallet_send_requests" as never)
    .select("id, network, txid, wallet_transaction_id")
    .in("status", ["BROADCAST", "CONFIRMING"] as never)
    .not("txid", "is", null)
    .limit(50);
  if (network) query = query.eq("network", network as never);
  const { data } = await query;
  for (const row of (data ?? []) as Array<{
    id: string;
    network: ChainNetwork;
    txid: string;
    wallet_transaction_id?: string | null;
  }>) {
    try {
      const info = await getTransactionInfo(row.network, row.txid);
      if (!info.blockNumber) {
        await supabaseAdmin
          .from("wallet_send_requests" as never)
          .update({ status: "CONFIRMING" } as never)
          .eq("id", row.id as never);
        continue;
      }
      const status = info.success ? "CONFIRMED" : "FAILED";
      await supabaseAdmin
        .from("wallet_send_requests" as never)
        .update({
          status,
          confirmed_at: info.success ? new Date().toISOString() : null,
          failed_at: info.success ? null : new Date().toISOString(),
          failure_code: info.success ? null : info.status,
          safe_failure_message: info.success ? null : info.status,
        } as never)
        .eq("id", row.id as never);
      if (row.wallet_transaction_id) {
        await supabaseAdmin
          .from("wallet_transactions" as never)
          .update({
            status: info.success ? "completed" : "failed",
            block_number: info.blockNumber,
            failure_reason: info.success ? null : info.status,
          } as never)
          .eq("id", row.wallet_transaction_id as never);
      }
    } catch {
      // Existing listener health records chain access failures; leave request retryable.
    }
  }
}
