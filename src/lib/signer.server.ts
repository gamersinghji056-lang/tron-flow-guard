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

const USDT_TRX_REQUIREMENT = 30;
const TRX_TRANSFER_REQUIREMENT = 0.1;

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T | null) ?? fallback;
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
  if (wallet.wallet_type === "gasfree" && wallet.gas_sponsorship_status === "available") {
    throw new Error("GasFree sponsored send is not configured for this signer");
  }

  const network = wallet.network as ChainNetwork;
  const estimatedNetworkFeeTrx =
    input.asset === "USDT" ? USDT_TRX_REQUIREMENT : TRX_TRANSFER_REQUIREMENT;

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
      platform_fee: 0,
      total_debit: input.amount,
      status: "CREATED",
      metadata: { memo: input.memo ?? null, signer_boundary: "server_module_v1" },
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
      amount: input.amount,
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

    const { broadcastSignedTrc20Transfer, broadcastSignedTrxTransfer } =
      await import("@/lib/tron-transfer.server");
    await supabaseAdmin
      .from("wallet_send_requests" as never)
      .update({ status: "BROADCASTING", signed_at: new Date().toISOString() } as never)
      .eq("id", requestId as never);

    const broadcast =
      input.asset === "USDT"
        ? await broadcastSignedTrc20Transfer({
            network,
            privateKeyHex: derived.privateKeyHex,
            ownerAddress: wallet.address,
            toAddress: input.toAddress.trim(),
            amount: input.amount,
          })
        : await broadcastSignedTrxTransfer({
            network,
            privateKeyHex: derived.privateKeyHex,
            ownerAddress: wallet.address,
            toAddress: input.toAddress.trim(),
            amount: input.amount,
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
        fee: 0,
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
        broadcast_result: { ok: true, txid: broadcast.txid },
        wallet_transaction_id: (walletTx as { id?: string } | null)?.id ?? null,
      } as never)
      .eq("id", requestId as never)
      .select("*")
      .single();

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
