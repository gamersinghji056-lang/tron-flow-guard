/**
 * Blockchain listener service (server-only).
 *
 * ONE engine backs every path: the scheduled tick, the admin "Check the chain
 * now" action, and reconciliation. There is no separate simulated code path and
 * no timer that advances a status without chain evidence.
 *
 * Pipeline
 *   A. Read runtime settings and resolve the active network.
 *   B. Read the chain head. Failure here is recorded and the run reports OFFLINE.
 *   C. Enumerate every monitored address on that network (company deposit
 *      wallets AND trader personal wallets), then poll each one's TRC20
 *      transfer history. History-based polling is what recovers transfers that
 *      landed while the service was down.
 *   D. Persist raw events (unique per txid+network), strictly verify the token
 *      contract, and record a canonical `transactions` row per valid transfer.
 *      Company-wallet transfers are additionally matched to a deposit order
 *      under the configured amount / late-payment policy.
 *   E. Refresh confirmations from the chain and credit exactly once at target.
 *   F. Expire stale orders, persist the listener checkpoint and health.
 *
 * Money is compared in integer base units. Floating point is display-only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_NETWORK, networkConfig, type ChainNetwork } from "./chain";
import { listHotAddresses, listMonitoredAddresses, type MonitoredAddress } from "./monitor.server";

import {
  getIncomingUsdtTransfers,
  getLatestBlock,
  getNativeTrxBalance,
  getTransactionInfo,
  getTrc20UsdtBalance,
  withRetry,
  type Trc20Transfer,
} from "./tron.server";
import { recordSystemError } from "./system-health.server";
import { enqueueWebhookEvent } from "./webhooks.server";

export interface ListenerTickResult {
  ok: boolean;
  network: ChainNetwork;
  latestBlock: number | null;
  addressesMonitored: number;
  addressesPolled: number;
  eventsSeen: number;
  newEvents: number;
  transactionsRecorded: number;
  depositsUpdated: number;
  depositsCredited: number;
  walletsCredited: number;
  expired: number;
  reconciled: boolean;
  timingsMs: Record<string, number>;
  durationMs: number;
  errors: string[];
}

type SettingsMap = Record<string, unknown>;

interface LooseDepositRequestQuery {
  select: (columns: string) => {
    eq: (column: string, value: unknown) => LooseDepositRequestQueryFilter;
  };
}

interface LooseDepositRequestQueryFilter {
  eq: (column: string, value: unknown) => LooseDepositRequestQueryFilter;
  in: (column: string, values: unknown[]) => LooseDepositRequestQueryFilter;
  is: (column: string, value: unknown) => LooseDepositRequestQueryFilter;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  maybeSingle: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
}

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
    metadata: (entry.metadata ?? {}) as never,
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
    metadata: metadata as never,
  });
}

/** Integer base units for a human USDT amount. Never used for display. */
function toBaseUnits(amount: number | string, decimals: number): bigint {
  const [whole, frac = ""] = String(amount).split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt((whole || "0") + padded);
}

/**
 * Strict verification. Returns null when the transfer is a genuine USDT
 * TRC20 credit to the expected address on the expected network.
 */
function verifyTransfer(
  transfer: Trc20Transfer,
  expectedAddress: string,
  network: ChainNetwork,
): string | null {
  const config = networkConfig(network);
  if (transfer.to !== expectedAddress)
    return "Receiver address does not match the monitored wallet";
  // Token contract is authoritative: a look-alike token must never credit.
  if (!transfer.tokenContract) return "Transfer has no token contract";
  if (transfer.tokenContract !== config.usdtContract) {
    return `Token contract ${transfer.tokenContract} is not the configured USDT contract on ${config.label}`;
  }
  if (transfer.tokenSymbol && transfer.tokenSymbol.toUpperCase() !== "USDT") {
    return "Token is not USDT";
  }
  if (transfer.baseUnits <= 0n) return "Transfer amount is zero or invalid";
  if (!transfer.txid) return "Missing transaction id";
  if (transfer.decimals !== config.tokenDecimals) {
    return `Unexpected token decimals ${transfer.decimals}`;
  }
  return null;
}

async function persistState(network: ChainNetwork, patch: Record<string, unknown>): Promise<void> {
  await supabaseAdmin
    .from("listener_state")
    .upsert({ network, ...patch } as never, { onConflict: "network" });
}

async function persistHealth(status: string, detail: string, extra: Record<string, unknown>) {
  await supabaseAdmin.from("service_health").upsert(
    {
      service: "blockchain-listener",
      status,
      detail,
      ...extra,
    } as never,
    { onConflict: "service" },
  );
}

async function refreshCompanyWalletScanState(network: ChainNetwork, targets: MonitoredAddress[]) {
  const companyTargets = targets.filter((target) => target.kind === "company");
  if (!companyTargets.length) return;

  const checkedAt = new Date().toISOString();
  const CONCURRENCY = 4;
  const queue = [...companyTargets];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const target = queue.shift();
        if (!target) return;
        try {
          const [usdtBalance, trxBalance] = await Promise.all([
            getTrc20UsdtBalance(network, target.address),
            getNativeTrxBalance(network, target.address),
          ]);
          const patch: Record<string, unknown> = {
            last_listener_scan_at: checkedAt,
            onchain_checked_at: checkedAt,
          };
          if (usdtBalance !== null) patch["onchain_usdt_balance"] = usdtBalance;
          if (trxBalance !== null) patch["onchain_trx_balance"] = trxBalance;
          await supabaseAdmin
            .from("wallets")
            .update(patch as never)
            .eq("id", target.id)
            .eq("network", network);
        } catch (error) {
          await recordSystemError({
            service: "BLOCKCHAIN WORKER",
            severity: "warning",
            code: "COMPANY_WALLET_BALANCE_REFRESH_FAILED",
            message: error,
            stage: "ADDRESS_SCAN",
            walletId: target.id,
            address: target.address,
            retryable: true,
          });
        }
      }
    }),
  );
}

/** One full listener pass. Never throws: failures are recorded and reported. */
export async function runListenerTick(trigger: string): Promise<ListenerTickResult> {
  const startedAt = Date.now();
  const errors: string[] = [];
  const settings = await readSettings();

  const network = ((settings["active_network"] as ChainNetwork) ?? DEFAULT_NETWORK) as ChainNetwork;
  const config = networkConfig(network);
  const requiredConfirmations = Number(settings["required_confirmations"] ?? 16) || 16;
  const largeThreshold = Number(settings["large_deposit_threshold"] ?? 1000) || 1000;
  const monitorPersonal = settings["monitor_personal_wallets"] !== false;
  const toleranceBase = toBaseUnits(
    Number(settings["amount_tolerance_usdt"] ?? 0.01) || 0,
    config.tokenDecimals,
  );
  const overpaymentPolicy = String(settings["overpayment_policy"] ?? "credit_full");
  const underpaymentPolicy = String(settings["underpayment_policy"] ?? "review");
  const latePaymentPolicy = String(settings["late_payment_policy"] ?? "credit");

  const result: ListenerTickResult = {
    ok: true,
    network,
    latestBlock: null,
    addressesMonitored: 0,
    addressesPolled: 0,
    eventsSeen: 0,
    newEvents: 0,
    transactionsRecorded: 0,
    depositsUpdated: 0,
    depositsCredited: 0,
    walletsCredited: 0,
    expired: 0,
    reconciled: false,
    timingsMs: {},
    durationMs: 0,
    errors,
  };

  async function measure<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    try {
      return await fn();
    } finally {
      result.timingsMs[key] = (result.timingsMs[key] ?? 0) + Date.now() - started;
    }
  }

  // Decide whether this run must sweep further back than the usual window.
  const { data: priorState } = await supabaseAdmin
    .from("listener_state")
    .select("last_success_at, consecutive_failures")
    .eq("network", network)
    .maybeSingle();

  const lastSuccessMs = priorState?.last_success_at
    ? new Date(priorState.last_success_at).getTime()
    : 0;
  const gapMs = lastSuccessMs ? Date.now() - lastSuccessMs : Number.MAX_SAFE_INTEGER;
  // A gap over 5 minutes (or an explicit request) means transfers may have been
  // missed while the service was down — widen the history sweep to recover them.
  const fast = trigger === "fast";
  const reconcile = trigger === "reconcile" || (!fast && gapMs > 5 * 60_000);
  result.reconciled = reconcile;
  const sweepOptions = reconcile
    ? {
        limit: 200,
        // 30-minute safety buffer behind the last known-good poll.
        ...(lastSuccessMs ? { minTimestamp: Math.max(0, lastSuccessMs - 30 * 60_000) } : {}),
      }
    : { limit: fast ? 15 : 50 };

  await persistState(network, { last_poll_at: new Date().toISOString() });

  // ── B. chain head ──────────────────────────────────────────────────────────
  try {
    result.latestBlock = await measure("latestBlock", () =>
      withRetry(() => getLatestBlock(network)),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read the chain head";
    result.ok = false;
    errors.push(message);
    await persistState(network, {
      last_error: message,
      last_error_at: new Date().toISOString(),
      consecutive_failures: (priorState?.consecutive_failures ?? 0) + 1,
    });
    await persistHealth("offline", `Cannot reach the ${config.label} node: ${message}`, {
      last_error: message,
      last_error_at: new Date().toISOString(),
    });
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
      body: `The listener could not reach the ${config.label} node.`,
      severity: "error",
    });
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // ── C. every monitored address on this network ─────────────────────────────
  // A `fast` pass polls only "hot" addresses (live orders / recently used
  // wallets) so detection latency stays flat as wallet count grows. Full passes
  // still sweep every address, which is what recovers anything missed.
  const allMonitored = await measure("monitoredAddressLoad", () =>
    listMonitoredAddresses(network, {
      includePersonal: monitorPersonal,
    }),
  );
  let monitored = allMonitored;
  if (fast) {
    const hot = await measure("hotAddressLoad", () =>
      listHotAddresses(network, { includePersonal: monitorPersonal }),
    );
    if (hot.length) monitored = hot;
  }
  result.addressesMonitored = allMonitored.length;
  await measure("companyWalletBalanceRefresh", () =>
    refreshCompanyWalletScanState(network, allMonitored),
  );

  // Addresses are polled concurrently: TronGrid latency dominates a pass, so
  // sequential polling was the main source of the slow "Waiting" window.
  const CONCURRENCY = 6;
  const queue = [...monitored];

  async function pollOne(target: MonitoredAddress) {
    result.addressesPolled += 1;
    let transfers: Trc20Transfer[] = [];
    try {
      transfers = await measure("tronAddressHistory", () =>
        withRetry(() => getIncomingUsdtTransfers(network, target.address, sweepOptions)),
      );
    } catch (error) {
      result.ok = false;
      errors.push(`${target.address}: ${error instanceof Error ? error.message : "poll failed"}`);
      return;
    }
    result.eventsSeen += transfers.length;

    // Transfers for one address stay sequential: ingestion is the money path
    // and must not race itself on the same deposit order.
    for (const transfer of transfers) {
      try {
        await measure("transferIngestion", () =>
          ingestTransfer({
            transfer,
            target,
            network,
            requiredConfirmations,
            largeThreshold,
            toleranceBase,
            overpaymentPolicy,
            underpaymentPolicy,
            latePaymentPolicy,
            latestBlock: result.latestBlock,
            result,
          }),
        );
      } catch (error) {
        errors.push(
          `${transfer.txid}: ${error instanceof Error ? error.message : "ingest failed"}`,
        );
      }
    }
  }

  await measure("addressScan", () =>
    Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (;;) {
          const next = queue.shift();
          if (!next) return;
          await pollOne(next);
        }
      }),
    ),
  );

  // ── E. confirmations + credit ──────────────────────────────────────────────
  await measure("confirmationRefresh", () =>
    settleConfirmedTransactions({
      network,
      requiredConfirmations,
      latestBlock: result.latestBlock,
      result,
      errors,
    }),
  );
  await measure("outgoingSendReconciliation", async () => {
    const { reconcileOutgoingSendRequests } = await import("@/lib/signer.server");
    await reconcileOutgoingSendRequests(network);
  });

  // ── F. expiry, checkpoint, health ──────────────────────────────────────────
  try {
    const { data: expired } = await measure("expiry", async () =>
      supabaseAdmin.rpc("expire_stale_deposits"),
    );
    result.expired = Number(expired ?? 0);
  } catch {
    errors.push("Could not expire stale deposit orders");
  }

  const finishedAt = new Date().toISOString();
  const healthy = result.ok && errors.length === 0;

  await persistState(network, {
    chain_head_block: result.latestBlock,
    last_processed_block: result.latestBlock,
    addresses_monitored: result.addressesMonitored,
    last_poll_at: finishedAt,
    ...(healthy
      ? { last_success_at: finishedAt, consecutive_failures: 0, last_error: null }
      : {
          last_error: errors[0] ?? "Listener finished with errors",
          last_error_at: finishedAt,
          consecutive_failures: (priorState?.consecutive_failures ?? 0) + 1,
        }),
    reconcile_cursor: finishedAt,
  });

  await persistHealth(
    healthy ? "ok" : "degraded",
    healthy
      ? `Polled ${result.addressesPolled} address(es) on ${config.label} at block ${result.latestBlock}.`
      : `Completed with ${errors.length} error(s).`,
    {
      latest_block: result.latestBlock,
      ...(healthy
        ? { last_ok_at: finishedAt }
        : { last_error: errors[0] ?? null, last_error_at: finishedAt }),
      metadata: {
        addressesMonitored: result.addressesMonitored,
        reconciled: result.reconciled,
        trigger,
        timingsMs: result.timingsMs,
        durationMs: result.durationMs,
        latestSuccessAt: healthy ? finishedAt : priorState?.last_success_at,
      },
    },
  );

  await supabaseAdmin
    .from("system_settings")
    .update({ value: finishedAt as never })
    .eq("key", "listener_heartbeat");

  result.durationMs = Date.now() - startedAt;
  await log({
    level: healthy ? "info" : "warn",
    message:
      `Tick complete — ${result.addressesPolled}/${result.addressesMonitored} address(es), ` +
      `${result.newEvents} new event(s), ${result.depositsUpdated} order(s) updated, ` +
      `${result.depositsCredited} order(s) credited, ${result.walletsCredited} wallet credit(s)`,
    network,
    latestBlock: result.latestBlock,
    eventsSeen: result.eventsSeen,
    depositsUpdated: result.depositsUpdated,
    durationMs: result.durationMs,
    metadata: { trigger, reconciled: result.reconciled, errors, timingsMs: result.timingsMs },
  });

  return result;
}

/**
 * Records one on-chain transfer: raw event, canonical transaction row, and —
 * for company deposit wallets — the matched deposit order under policy.
 */
async function ingestTransfer(args: {
  transfer: Trc20Transfer;
  target: MonitoredAddress;
  network: ChainNetwork;
  requiredConfirmations: number;
  largeThreshold: number;
  toleranceBase: bigint;
  overpaymentPolicy: string;
  underpaymentPolicy: string;
  latePaymentPolicy: string;
  latestBlock: number | null;
  result: ListenerTickResult;
}): Promise<void> {
  const { transfer, target, network, result } = args;
  const config = networkConfig(network);

  // Raw event, de-duplicated on (txid, network).
  const { data: existingEvent } = await supabaseAdmin
    .from("blockchain_events")
    .select("id")
    .eq("txid", transfer.txid)
    .eq("network", network)
    .maybeSingle();

  if (!existingEvent) {
    result.newEvents += 1;
    await supabaseAdmin.from("blockchain_events").insert({
      network,
      txid: transfer.txid,
      wallet_address: target.address,
      token_contract: transfer.tokenContract,
      amount: transfer.amount,
      block_timestamp: new Date(transfer.blockTimestamp).toISOString(),
      raw: transfer.raw as never,
    });
  }

  // Idempotency: a txid may only ever produce one canonical transaction row.
  const { data: existingTx } = await supabaseAdmin
    .from("transactions")
    .select("id")
    .eq("txid", transfer.txid)
    .maybeSingle();
  if (existingTx) return;

  const rejection = verifyTransfer(transfer, target.address, network);

  let info = { blockNumber: null as number | null, success: true, status: "UNKNOWN" };
  try {
    info = await withRetry(() => getTransactionInfo(network, transfer.txid), 2);
  } catch {
    // Receipt unavailable this pass; confirmations settle on a later run.
  }

  const chainRejection = rejection ?? (info.success ? null : "Transaction failed on-chain");
  const confirmations =
    info.blockNumber && args.latestBlock ? Math.max(0, args.latestBlock - info.blockNumber + 1) : 0;

  // Match a deposit order only for company P2P deposit wallets.
  interface MatchedOrder {
    id: string;
    user_id: string;
    order_ref: string;
    expected_amount: string | number;
    expires_at: string;
    purpose?: string | null;
    direct_sell_order_id?: string | null;
  }
  let matchedOrder: MatchedOrder | null = null;

  let orderStatus: string = "detected";
  let creditAmount = transfer.amount;
  let holdReason: string | null = null;

  if (target.kind === "company" && !chainRejection) {
    const depositRequests = supabaseAdmin.from(
      "deposit_requests",
    ) as unknown as LooseDepositRequestQuery;
    const { data: candidates } = await depositRequests
      .select(
        "id, user_id, order_ref, expected_amount, expires_at, created_at, status, purpose, direct_sell_order_id",
      )
      .eq("wallet_id", target.id)
      .eq("network", network)
      .in("status", ["waiting", "detected", "expired"])
      .is("txid", null)
      .order("created_at", { ascending: true });

    const scored = ((candidates ?? []) as MatchedOrder[]).map((candidate) => {
      const expectedBase = toBaseUnits(candidate.expected_amount, config.tokenDecimals);
      const diff = transfer.baseUnits - expectedBase;
      return { candidate, expectedBase, diff, abs: diff < 0n ? -diff : diff };
    });

    // Prefer an exact/in-tolerance match, else the closest open order.
    const exact = scored.find((entry: (typeof scored)[number]) => entry.abs <= args.toleranceBase);
    const chosen =
      exact ??
      scored.sort((a: (typeof scored)[number], b: (typeof scored)[number]) =>
        a.abs < b.abs ? -1 : a.abs > b.abs ? 1 : 0,
      )[0] ??
      null;

    if (chosen) {
      matchedOrder = chosen.candidate as unknown as MatchedOrder;
      const late = new Date(chosen.candidate.expires_at).getTime() < transfer.blockTimestamp;

      if (chosen.abs <= args.toleranceBase) {
        orderStatus = late ? "late_payment" : "detected";
      } else if (chosen.diff < 0n) {
        orderStatus = args.underpaymentPolicy === "credit_received" ? "detected" : "underpaid";
        if (orderStatus === "underpaid") holdReason = "Received less than the requested amount";
      } else {
        if (args.overpaymentPolicy === "review") {
          orderStatus = "overpaid";
          holdReason = "Received more than the requested amount";
        } else if (args.overpaymentPolicy === "credit_expected") {
          orderStatus = late ? "late_payment" : "detected";
          creditAmount = Number(chosen.candidate.expected_amount);
        } else {
          orderStatus = late ? "late_payment" : "detected";
        }
      }

      if (late && args.latePaymentPolicy === "review" && !holdReason) {
        orderStatus = "review";
        holdReason = "Payment arrived after the order expired";
      }
    }
  }

  result.transactionsRecorded += 1;
  await supabaseAdmin.from("transactions").insert({
    deposit_request_id: matchedOrder?.id ?? null,
    user_id: matchedOrder?.user_id ?? target.userId,
    txid: transfer.txid,
    network,
    token_contract: transfer.tokenContract || config.usdtContract,
    token_symbol: transfer.tokenSymbol || "USDT",
    sender_address: transfer.from,
    receiver_address: transfer.to,
    amount: creditAmount,
    block_number: info.blockNumber,
    confirmations,
    chain_status: info.status,
    block_timestamp: new Date(transfer.blockTimestamp).toISOString(),
    verified: !chainRejection,
    verification_error: chainRejection ?? holdReason,
    // `processed` gates crediting: held or rejected transfers are never credited
    // automatically, they wait for an administrator decision.
    processed: Boolean(chainRejection) || Boolean(holdReason),
  });

  await supabaseAdmin
    .from("blockchain_events")
    .update({ matched: Boolean(matchedOrder) || target.kind === "personal" })
    .eq("txid", transfer.txid)
    .eq("network", network);

  // Personal wallet: mark the address as proven-active on chain.
  if (target.kind === "personal" && !chainRejection) {
    await supabaseAdmin
      .from("user_wallets")
      .update({
        activated_on_chain: true,
        onchain_checked_at: new Date().toISOString(),
      })
      .eq("id", target.id);

    await notify({
      userId: target.userId,
      audience: "trader",
      title: "Incoming transfer detected",
      body: `${transfer.amount} USDT detected for ${target.name}. Waiting for ${args.requiredConfirmations} confirmations.`,
      severity: "info",
    });
  }

  if (!matchedOrder) return;

  if (chainRejection) {
    await supabaseAdmin
      .from("deposit_requests")
      .update({
        status: "failed",
        txid: transfer.txid,
        failure_reason: chainRejection,
        received_amount: transfer.amount,
        sender_address: transfer.from,
        block_number: info.blockNumber,
        detected_at: new Date().toISOString(),
      })
      .eq("id", matchedOrder.id);
    await audit("deposit.verification_failed", matchedOrder.id, {
      txid: transfer.txid,
      chainRejection,
    });
    await enqueueWebhookEvent("deposit.failed", {
      id: matchedOrder.id,
      txid: transfer.txid,
      reason: chainRejection,
      user_id: matchedOrder.user_id,
    });
    result.depositsUpdated += 1;
    return;
  }

  await supabaseAdmin
    .from("deposit_requests")
    .update({
      status: orderStatus as never,
      txid: transfer.txid,
      received_amount: transfer.amount,
      sender_address: transfer.from,
      block_number: info.blockNumber,
      confirmations,
      required_confirmations: args.requiredConfirmations,
      detected_at: new Date().toISOString(),
      failure_reason: holdReason,
    })
    .eq("id", matchedOrder.id);

  if (matchedOrder.purpose === "direct_sell" && matchedOrder.direct_sell_order_id) {
    const directSellStatus =
      orderStatus === "underpaid"
        ? "partial_payment"
        : orderStatus === "overpaid"
          ? "overpayment"
          : holdReason
            ? "manual_review"
            : "usdt_detected";
    await supabaseAdmin
      .from("direct_sell_orders" as never)
      .update({
        status: directSellStatus,
        received_usdt: transfer.amount,
        remaining_usdt: Math.max(0, Number(matchedOrder.expected_amount) - transfer.amount),
        sender_address: transfer.from,
        txid: transfer.txid,
        block_number: info.blockNumber,
        confirmations,
        failure_reason: holdReason,
      } as never)
      .eq("id", matchedOrder.direct_sell_order_id as never);
    await enqueueWebhookEvent(
      directSellStatus === "manual_review"
        ? "direct_sell.manual_review"
        : "direct_sell.usdt_detected",
      {
        id: matchedOrder.direct_sell_order_id,
        deposit_request_id: matchedOrder.id,
        txid: transfer.txid,
        amount: transfer.amount,
        status: directSellStatus,
      },
    );
  }

  result.depositsUpdated += 1;
  await audit("deposit.detected", matchedOrder.id, {
    txid: transfer.txid,
    amount: transfer.amount,
    status: orderStatus,
  });
  await enqueueWebhookEvent("deposit.detected", {
    id: matchedOrder.id,
    txid: transfer.txid,
    amount: transfer.amount,
    status: orderStatus,
    user_id: matchedOrder.user_id,
  });

  await notify({
    userId: matchedOrder.user_id,
    audience: "trader",
    title: holdReason ? "Deposit needs review" : "Deposit detected on-chain",
    body:
      holdReason ??
      `${transfer.amount} USDT detected. Waiting for ${args.requiredConfirmations} confirmations.`,
    severity: holdReason ? "warning" : "info",
    depositRequestId: matchedOrder.id,
  });
  await notify({
    audience: "admin",
    title: `${holdReason ? "Deposit held" : "New deposit"} ${matchedOrder.order_ref}`,
    body: holdReason ?? `${transfer.amount} USDT detected on ${config.shortLabel}.`,
    severity: holdReason ? "warning" : "info",
    depositRequestId: matchedOrder.id,
  });

  if (transfer.amount >= args.largeThreshold) {
    await notify({
      audience: "admin",
      title: `Large deposit ${matchedOrder.order_ref}`,
      body: `${transfer.amount} USDT exceeds the ${args.largeThreshold} USDT alert threshold.`,
      severity: "warning",
      depositRequestId: matchedOrder.id,
    });
  }
}

/**
 * Refreshes confirmation counts from the chain and credits at target.
 * Crediting is idempotent at the database level, so repeated runs, a manual
 * chain check and reconciliation can never double-credit.
 */
async function settleConfirmedTransactions(args: {
  network: ChainNetwork;
  requiredConfirmations: number;
  latestBlock: number | null;
  result: ListenerTickResult;
  errors: string[];
}): Promise<void> {
  const { network, requiredConfirmations, latestBlock, result, errors } = args;
  if (!latestBlock) return;
  const chainHeadBlock = latestBlock;

  const { data: open } = await supabaseAdmin
    .from("transactions")
    .select("id, txid, block_number, deposit_request_id, receiver_address, user_id, amount")
    .eq("network", network)
    .eq("verified", true)
    .eq("processed", false);

  const queue = [...(open ?? [])];

  async function settleOne(tx: (typeof queue)[number]) {
    let blockNumber = tx.block_number;
    let chainStatus: string | null = null;
    if (!blockNumber) {
      try {
        const info = await withRetry(() => getTransactionInfo(network, tx.txid), 2);
        blockNumber = info.blockNumber;
        chainStatus = info.status;
        if (!info.success) {
          await supabaseAdmin
            .from("transactions")
            .update({
              verified: false,
              processed: true,
              verification_error: "Transaction failed on-chain",
              chain_status: info.status,
            })
            .eq("id", tx.id);
          return;
        }
      } catch {
        errors.push(`Could not refresh receipt for ${tx.txid}`);
        return;
      }
    }
    if (!blockNumber) return;

    const confirmations = Math.max(0, chainHeadBlock - blockNumber + 1);
    await supabaseAdmin
      .from("transactions")
      .update({
        confirmations,
        block_number: blockNumber,
        ...(chainStatus ? { chain_status: chainStatus } : {}),
      })
      .eq("id", tx.id);

    if (tx.deposit_request_id) {
      const depositRequests = supabaseAdmin.from(
        "deposit_requests",
      ) as unknown as LooseDepositRequestQuery;
      const { data: order } = await depositRequests
        .select("id, status, order_ref, user_id, purpose, direct_sell_order_id")
        .eq("id", tx.deposit_request_id)
        .maybeSingle();
      if (!order) return;
      const depositOrder = order as {
        id: string;
        status: string;
        order_ref: string;
        user_id: string;
        purpose?: string | null;
        direct_sell_order_id?: string | null;
      };

      const nextStatus =
        confirmations >= requiredConfirmations
          ? "confirmed"
          : depositOrder.status === "late_payment"
            ? "late_payment"
            : "confirming";

      await supabaseAdmin
        .from("deposit_requests")
        .update({ confirmations, block_number: blockNumber, status: nextStatus as never })
        .eq("id", depositOrder.id);
      await enqueueWebhookEvent(
        confirmations >= requiredConfirmations ? "deposit.confirmed" : "deposit.confirming",
        {
          id: depositOrder.id,
          txid: tx.txid,
          confirmations,
          required_confirmations: requiredConfirmations,
          status: nextStatus,
          user_id: depositOrder.user_id,
        },
        confirmations >= requiredConfirmations
          ? `deposit.confirmed:${depositOrder.id}`
          : `deposit.confirming:${depositOrder.id}:${confirmations}`,
      );

      if (depositOrder.purpose === "direct_sell" && depositOrder.direct_sell_order_id) {
        const directSellStatus =
          confirmations >= requiredConfirmations ? "inr_payment_pending" : "usdt_confirming";
        await supabaseAdmin
          .from("direct_sell_orders" as never)
          .update({
            status: directSellStatus,
            confirmations,
            block_number: blockNumber,
            ...(confirmations >= requiredConfirmations
              ? { usdt_confirmed_at: new Date().toISOString() }
              : {}),
          } as never)
          .eq("id", depositOrder.direct_sell_order_id as never);

        if (confirmations >= requiredConfirmations) {
          await supabaseAdmin.from("transactions").update({ processed: true }).eq("id", tx.id);
          await audit("direct_sell.usdt_confirmed", depositOrder.id, { txid: tx.txid });
          await enqueueWebhookEvent("direct_sell.usdt_confirmed", {
            id: depositOrder.direct_sell_order_id,
            deposit_request_id: depositOrder.id,
            txid: tx.txid,
            confirmations,
          });
          await notify({
            userId: depositOrder.user_id,
            audience: "trader",
            title: "USDT confirmed",
            body: `${depositOrder.order_ref} is ready for INR payment processing.`,
            severity: "success",
            depositRequestId: depositOrder.id,
          });
        }
        return;
      }

      if (confirmations < requiredConfirmations) return;

      // Atomic, idempotent credit inside the database.
      const { data: credit, error } = await supabaseAdmin.rpc("credit_deposit", {
        _deposit_id: depositOrder.id,
      });
      if (error) {
        errors.push(`Credit failed for ${depositOrder.order_ref}: ${error.message}`);
        return;
      }
      const row = Array.isArray(credit) ? credit[0] : null;
      await supabaseAdmin.from("transactions").update({ processed: true }).eq("id", tx.id);

      if (row?.credited) {
        result.depositsCredited += 1;
        await supabaseAdmin
          .from("deposit_requests")
          .update({ status: "credited" as never })
          .eq("id", depositOrder.id);
        await audit("deposit.credited", depositOrder.id, { txid: tx.txid, amount: row.amount });
        await enqueueWebhookEvent("deposit.credited", {
          id: depositOrder.id,
          txid: tx.txid,
          amount: row.amount,
          user_id: depositOrder.user_id,
        });
        await notify({
          userId: depositOrder.user_id,
          audience: "trader",
          title: "Deposit credited",
          body: `${row.amount} USDT credited from ${depositOrder.order_ref}.`,
          severity: "success",
          depositRequestId: depositOrder.id,
        });
      }
      return;
    }

    // No order: a direct transfer into a personal wallet.
    if (confirmations < requiredConfirmations) return;

    const { data: wallet } = await supabaseAdmin
      .from("user_wallets")
      .select("id, user_id, name")
      .eq("address", tx.receiver_address)
      .eq("network", network)
      .maybeSingle();

    if (!wallet) {
      await supabaseAdmin
        .from("transactions")
        .update({
          processed: true,
          verification_error: "No monitored wallet owns the receiving address",
        })
        .eq("id", tx.id);
      return;
    }

    const { data: credit, error } = await supabaseAdmin.rpc("credit_wallet_onchain_deposit", {
      _wallet_id: wallet.id,
      _amount: Number(tx.amount),
      _txid: tx.txid,
      _from_address: null,
      _network: network,
      _block_number: blockNumber,
    } as never);

    if (error) {
      errors.push(`Wallet credit failed for ${tx.txid}: ${error.message}`);
      return;
    }
    await supabaseAdmin.from("transactions").update({ processed: true }).eq("id", tx.id);
    const row = Array.isArray(credit) ? credit[0] : null;
    if (row?.credited) result.walletsCredited += 1;
  }

  const CONCURRENCY = 4;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const tx = queue.shift();
        if (!tx) return;
        await settleOne(tx);
      }
    }),
  );
}
