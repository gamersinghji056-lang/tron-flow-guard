/**
 * Blockchain listener service (server-only).
 *
 * Runs as an isolated background worker: it is invoked by the scheduled
 * `/api/public/listener/tick` route and never imported by the frontend.
 *
 * Responsibilities
 *  1. Read runtime settings (active network, required confirmations).
 *  2. Poll TronGrid for incoming TRC20 USDT transfers on every active wallet.
 *  3. Persist raw chain events, de-duplicated by (txid, network).
 *  4. Verify each event against the strict rule set and match it to a request.
 *  5. Refresh confirmation counts and auto-credit at the confirmation target.
 *  6. Expire stale requests, emit notifications and write listener logs.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_NETWORK, networkConfig, type ChainNetwork } from "./chain";
import {
  getIncomingUsdtTransfers,
  getLatestBlock,
  getTransactionInfo,
  withRetry,
  type Trc20Transfer,
} from "./tron.server";

/** Matching tolerance: on-chain amount may differ by at most this much USDT. */
const AMOUNT_TOLERANCE = 0.01;
/** Transfers older than the request minus this window are not considered. */
const MATCH_BACKDATE_MS = 15 * 60 * 1000;

export interface ListenerTickResult {
  ok: boolean;
  network: ChainNetwork;
  latestBlock: number | null;
  walletsPolled: number;
  eventsSeen: number;
  newEvents: number;
  depositsUpdated: number;
  depositsCredited: number;
  expired: number;
  durationMs: number;
  errors: string[];
}

type SettingsMap = Record<string, unknown>;

async function readSettings(): Promise<SettingsMap> {
  const { data } = await supabaseAdmin.from("system_settings").select("key, value");
  const map: SettingsMap = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return map;
}

async function log(entry: {
  level?: string;
  message: string;
  network?: ChainNetwork;
  latestBlock?: number | null;
  eventsSeen?: number;
  depositsUpdated?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("listener_logs").insert({
    level: entry.level ?? "info",
    scope: "blockchain-listener",
    message: entry.message,
    network: entry.network ?? null,
    latest_block: entry.latestBlock ?? null,
    events_seen: entry.eventsSeen ?? 0,
    deposits_updated: entry.depositsUpdated ?? 0,
    duration_ms: entry.durationMs ?? null,
    metadata: entry.metadata ?? {},
  });
}

async function notify(entry: {
  userId?: string | null;
  audience: "trader" | "admin";
  title: string;
  body?: string;
  severity?: "info" | "success" | "warning" | "error";
  depositRequestId?: string | null;
}) {
  await supabaseAdmin.from("notifications").insert({
    user_id: entry.userId ?? null,
    audience: entry.audience,
    title: entry.title,
    body: entry.body ?? null,
    severity: entry.severity ?? "info",
    deposit_request_id: entry.depositRequestId ?? null,
  });
}

async function audit(action: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await supabaseAdmin.from("audit_logs").insert({
    actor_type: "listener",
    action,
    entity_type: "deposit_request",
    entity_id: entityId,
    metadata,
  });
}

/**
 * Strict verification rule set. Returns null when the transfer is valid,
 * otherwise a human-readable reason.
 */
function verifyTransfer(
  transfer: Trc20Transfer,
  walletAddress: string,
  network: ChainNetwork,
): string | null {
  const config = networkConfig(network);
  if (transfer.to !== walletAddress) return "Receiver address does not match the company wallet";
  if (transfer.tokenContract && transfer.tokenContract !== config.usdtContract) {
    return "Transfer is not the official USDT token contract";
  }
  if (transfer.tokenSymbol && transfer.tokenSymbol.toUpperCase() !== "USDT") {
    return "Token is not USDT";
  }
  if (!(transfer.amount > 0)) return "Transfer amount is zero or invalid";
  if (!transfer.txid) return "Missing transaction id";
  return null;
}

/** One full listener pass. Never throws: failures are logged and reported. */
export async function runListenerTick(trigger: string): Promise<ListenerTickResult> {
  const startedAt = Date.now();
  const errors: string[] = [];
  const settings = await readSettings();

  const network = ((settings["active_network"] as ChainNetwork) ?? DEFAULT_NETWORK) as ChainNetwork;
  const requiredConfirmations = Number(settings["required_confirmations"] ?? 16) || 16;
  const largeThreshold = Number(settings["large_deposit_threshold"] ?? 1000) || 1000;

  const result: ListenerTickResult = {
    ok: true,
    network,
    latestBlock: null,
    walletsPolled: 0,
    eventsSeen: 0,
    newEvents: 0,
    depositsUpdated: 0,
    depositsCredited: 0,
    expired: 0,
    durationMs: 0,
    errors,
  };

  // ── 1. chain head ───────────────────────────────────────────────────────────
  try {
    result.latestBlock = await withRetry(() => getLatestBlock(network));
  } catch (error) {
    result.ok = false;
    errors.push(error instanceof Error ? error.message : "Unable to read the chain head");
    await log({
      level: "error",
      message: "Listener could not reach the blockchain node",
      network,
      metadata: { trigger, errors },
      durationMs: Date.now() - startedAt,
    });
    await notify({
      audience: "admin",
      title: "Blockchain listener offline",
      body: "The listener could not reach the TRON node on its last run.",
      severity: "error",
    });
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // ── 2. poll every active wallet on the active network ──────────────────────
  const { data: wallets } = await supabaseAdmin
    .from("wallets")
    .select("id, address, network, is_active")
    .eq("network", network)
    .eq("is_active", true);

  for (const wallet of wallets ?? []) {
    result.walletsPolled += 1;
    let transfers: Trc20Transfer[] = [];
    try {
      transfers = await withRetry(() => getIncomingUsdtTransfers(network, wallet.address));
    } catch (error) {
      result.ok = false;
      errors.push(
        `Wallet ${wallet.address}: ${error instanceof Error ? error.message : "poll failed"}`,
      );
      continue;
    }
    result.eventsSeen += transfers.length;

    for (const transfer of transfers) {
      // De-duplication: unique (txid, network) — already-processed ids are skipped.
      const { data: existingEvent } = await supabaseAdmin
        .from("blockchain_events")
        .select("id, matched")
        .eq("txid", transfer.txid)
        .eq("network", network)
        .maybeSingle();

      if (!existingEvent) {
        result.newEvents += 1;
        await supabaseAdmin.from("blockchain_events").insert({
          network,
          txid: transfer.txid,
          wallet_address: wallet.address,
          token_contract: transfer.tokenContract,
          amount: transfer.amount,
          block_timestamp: new Date(transfer.blockTimestamp).toISOString(),
          raw: transfer.raw as never,
        });
      } else if (existingEvent.matched) {
        continue;
      }

      // Replay protection: a txid may only ever back a single deposit.
      const { data: usedTx } = await supabaseAdmin
        .from("transactions")
        .select("id")
        .eq("txid", transfer.txid)
        .maybeSingle();
      if (usedTx) continue;

      const failureReason = verifyTransfer(transfer, wallet.address, network);

      // Find the oldest open request on this wallet whose amount matches.
      const { data: candidates } = await supabaseAdmin
        .from("deposit_requests")
        .select("id, user_id, expected_amount, created_at, status, order_ref")
        .eq("wallet_id", wallet.id)
        .eq("network", network)
        .in("status", ["waiting", "detected"])
        .is("txid", null)
        .order("created_at", { ascending: true });

      const match = (candidates ?? []).find((candidate) => {
        const expected = Number(candidate.expected_amount);
        const amountOk = Math.abs(expected - transfer.amount) <= AMOUNT_TOLERANCE;
        const timeOk =
          transfer.blockTimestamp >= new Date(candidate.created_at).getTime() - MATCH_BACKDATE_MS;
        return amountOk && timeOk;
      });

      if (!match) continue;

      let info = { blockNumber: null as number | null, success: true, status: "UNKNOWN" };
      try {
        info = await withRetry(() => getTransactionInfo(network, transfer.txid), 2);
      } catch {
        errors.push(`Could not read receipt for ${transfer.txid}`);
      }

      const rejection = failureReason ?? (info.success ? null : "Transaction failed on-chain");

      await supabaseAdmin.from("transactions").insert({
        deposit_request_id: match.id,
        user_id: match.user_id,
        txid: transfer.txid,
        network,
        token_contract: transfer.tokenContract || networkConfig(network).usdtContract,
        token_symbol: transfer.tokenSymbol || "USDT",
        sender_address: transfer.from,
        receiver_address: transfer.to,
        amount: transfer.amount,
        block_number: info.blockNumber,
        confirmations: info.blockNumber ? Math.max(0, result.latestBlock - info.blockNumber) : 0,
        chain_status: info.status,
        block_timestamp: new Date(transfer.blockTimestamp).toISOString(),
        verified: !rejection,
        verification_error: rejection,
        processed: Boolean(rejection),
      });

      await supabaseAdmin
        .from("blockchain_events")
        .update({ matched: true })
        .eq("txid", transfer.txid)
        .eq("network", network);

      if (rejection) {
        await supabaseAdmin
          .from("deposit_requests")
          .update({
            status: "failed",
            txid: transfer.txid,
            failure_reason: rejection,
            received_amount: transfer.amount,
            sender_address: transfer.from,
            block_number: info.blockNumber,
            detected_at: new Date().toISOString(),
          })
          .eq("id", match.id);

        await audit("deposit.verification_failed", match.id, { txid: transfer.txid, rejection });
        await notify({
          userId: match.user_id,
          audience: "trader",
          title: "Deposit failed verification",
          body: rejection,
          severity: "error",
          depositRequestId: match.id,
        });
        await notify({
          audience: "admin",
          title: `Failed deposit ${match.order_ref}`,
          body: rejection,
          severity: "error",
          depositRequestId: match.id,
        });
        result.depositsUpdated += 1;
        continue;
      }

      await supabaseAdmin
        .from("deposit_requests")
        .update({
          status: "detected",
          txid: transfer.txid,
          received_amount: transfer.amount,
          sender_address: transfer.from,
          block_number: info.blockNumber,
          confirmations: info.blockNumber
            ? Math.max(0, (result.latestBlock ?? 0) - info.blockNumber)
            : 0,
          required_confirmations: requiredConfirmations,
          detected_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq("id", match.id);

      await audit("deposit.detected", match.id, { txid: transfer.txid, amount: transfer.amount });
      await notify({
        userId: match.user_id,
        audience: "trader",
        title: "Deposit detected on-chain",
        body: `${transfer.amount} USDT detected. Waiting for ${requiredConfirmations} confirmations.`,
        severity: "info",
        depositRequestId: match.id,
      });
      await notify({
        audience: "admin",
        title: `New deposit ${match.order_ref}`,
        body: `${transfer.amount} USDT detected on ${networkConfig(network).shortLabel}.`,
        severity: "info",
        depositRequestId: match.id,
      });
      if (transfer.amount >= largeThreshold) {
        await notify({
          audience: "admin",
          title: `Large deposit ${match.order_ref}`,
          body: `${transfer.amount} USDT exceeds the ${largeThreshold} USDT alert threshold.`,
          severity: "warning",
          depositRequestId: match.id,
        });
      }
      result.depositsUpdated += 1;
    }
  }

  // ── 3. refresh confirmations + auto-credit ────────────────────────────────
  const { data: pending } = await supabaseAdmin
    .from("deposit_requests")
    .select("id, user_id, txid, block_number, status, confirmations, order_ref, received_amount")
    .in("status", ["detected", "confirming"])
    .eq("network", network)
    .not("txid", "is", null);

  for (const deposit of pending ?? []) {
    let blockNumber = deposit.block_number;
    if (!blockNumber && deposit.txid) {
      try {
        blockNumber = (await withRetry(() => getTransactionInfo(network, deposit.txid!), 2))
          .blockNumber;
      } catch {
        errors.push(`Could not refresh receipt for ${deposit.txid}`);
      }
    }
    if (!blockNumber) continue;

    const confirmations = Math.max(0, (result.latestBlock ?? 0) - blockNumber + 1);

    if (deposit.txid) {
      await supabaseAdmin
        .from("transactions")
        .update({ confirmations, block_number: blockNumber })
        .eq("txid", deposit.txid);
    }

    if (confirmations >= requiredConfirmations) {
      const { data: credit } = await supabaseAdmin.rpc("credit_deposit", {
        _deposit_id: deposit.id,
      });
      const creditedRow = Array.isArray(credit) ? credit[0] : null;
      await supabaseAdmin
        .from("deposit_requests")
        .update({ confirmations, block_number: blockNumber })
        .eq("id", deposit.id);
      await supabaseAdmin
        .from("transactions")
        .update({ processed: true })
        .eq("deposit_request_id", deposit.id);

      if (creditedRow?.credited) {
        result.depositsCredited += 1;
        await notify({
          userId: deposit.user_id,
          audience: "trader",
          title: "Deposit successful",
          body: `${creditedRow.amount} USDT has been credited to your balance.`,
          severity: "success",
          depositRequestId: deposit.id,
        });
        await notify({
          audience: "admin",
          title: `Deposit confirmed ${deposit.order_ref}`,
          body: `${creditedRow.amount} USDT credited automatically.`,
          severity: "success",
          depositRequestId: deposit.id,
        });
      }
      result.depositsUpdated += 1;
      continue;
    }

    await supabaseAdmin
      .from("deposit_requests")
      .update({ status: "confirming", confirmations, block_number: blockNumber })
      .eq("id", deposit.id);

    if (deposit.status !== "confirming") {
      await audit("deposit.confirming", deposit.id, { confirmations });
      await notify({
        userId: deposit.user_id,
        audience: "trader",
        title: "Deposit confirming",
        body: `Your deposit is confirming (${confirmations}/${requiredConfirmations}).`,
        severity: "info",
        depositRequestId: deposit.id,
      });
    }
    result.depositsUpdated += 1;
  }

  // ── 4. housekeeping ───────────────────────────────────────────────────────
  const { data: expiredCount } = await supabaseAdmin.rpc("expire_stale_deposits");
  result.expired = Number(expiredCount ?? 0);

  await supabaseAdmin
    .from("system_settings")
    .update({ value: new Date().toISOString() as never, updated_at: new Date().toISOString() })
    .eq("key", "listener_heartbeat");

  result.durationMs = Date.now() - startedAt;

  await log({
    level: result.ok ? "info" : "warn",
    message: result.ok
      ? `Tick complete — ${result.newEvents} new event(s), ${result.depositsUpdated} deposit(s) updated`
      : `Tick completed with ${errors.length} error(s)`,
    network,
    latestBlock: result.latestBlock,
    eventsSeen: result.eventsSeen,
    depositsUpdated: result.depositsUpdated,
    durationMs: result.durationMs,
    metadata: { trigger, errors, credited: result.depositsCredited, expired: result.expired },
  });

  return result;
}
