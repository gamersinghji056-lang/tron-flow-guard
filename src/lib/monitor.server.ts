/**
 * Monitored-address registry and honest listener health (server-only).
 *
 * Two hard rules live here:
 *
 *  1. **Every** active address is watched — company P2P deposit wallets AND
 *     trader personal wallets. Previously only company wallets were polled,
 *     which is why USDT sent to a personal address was never detected.
 *  2. An address is only ever polled on the network it is bound to. A mainnet
 *     address is never queried against a testnet node, and vice versa.
 */
import type { ChainNetwork } from "./chain";

export type MonitoredKind = "company" | "personal";

export interface MonitoredAddress {
  kind: MonitoredKind;
  /** `wallets.id` for company wallets, `user_wallets.id` for personal ones. */
  id: string;
  address: string;
  network: ChainNetwork;
  name: string;
  /** Owning trader. Company deposit wallets may be unassigned (null). */
  userId: string | null;
}

/**
 * Enumerates every address the listener must poll on `network`.
 * Both queries filter on `network`, so cross-chain polling is impossible.
 */
export async function listMonitoredAddresses(
  network: ChainNetwork,
  options: { includePersonal?: boolean } = {},
): Promise<MonitoredAddress[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const out: MonitoredAddress[] = [];

  const { data: company } = await supabaseAdmin
    .from("wallets")
    .select("id, name, address, network, assigned_user_id")
    .eq("network", network)
    .eq("is_active", true);

  for (const row of company ?? []) {
    out.push({
      kind: "company",
      id: row.id,
      address: row.address,
      network: row.network,
      name: row.name,
      userId: row.assigned_user_id ?? null,
    });
  }

  if (options.includePersonal !== false) {
    const { data: personal } = await supabaseAdmin
      .from("user_wallets")
      .select("id, name, address, network, user_id")
      .eq("network", network)
      .eq("is_archived", false)
      .eq("monitored", true);

    for (const row of personal ?? []) {
      out.push({
        kind: "personal",
        id: row.id,
        address: row.address,
        network: row.network,
        name: row.name,
        userId: row.user_id,
      });
    }
  }

  // De-duplicate: the same address may be registered as both a company deposit
  // wallet and a personal wallet. Poll it once; company mapping wins.
  const seen = new Set<string>();
  return out.filter((entry) => {
    const key = `${entry.network}:${entry.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type ListenerStatus = "live" | "degraded" | "offline" | "never_run";

export interface ListenerHealth {
  status: ListenerStatus;
  /** Plain-English reason. Always populated for non-live states. */
  reason: string | null;
  network: ChainNetwork | null;
  chainHeadBlock: number | null;
  lastProcessedBlock: number | null;
  addressesMonitored: number;
  lastSuccessAt: string | null;
  lastPollAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  consecutiveFailures: number;
  secondsSinceSuccess: number | null;
  staleAfterSeconds: number;
}

/**
 * Derives listener status from persisted backend state only.
 *
 * "live" requires ALL of: a recorded successful poll, that poll being recent,
 * a readable chain head, at least one monitored address, and no consecutive
 * failures. A loaded frontend can never produce "live" on its own.
 */
export async function readListenerHealth(network?: ChainNetwork): Promise<ListenerHealth> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settingRows } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", ["active_network", "listener_stale_seconds"]);
  const settings = Object.fromEntries((settingRows ?? []).map((r) => [r.key, r.value]));
  const activeNetwork = (network ??
    (settings["active_network"] as ChainNetwork) ??
    "trc20-nile") as ChainNetwork;
  const staleAfterSeconds = Number(settings["listener_stale_seconds"] ?? 120) || 120;

  const { data: state } = await supabaseAdmin
    .from("listener_state")
    .select("*")
    .eq("network", activeNetwork)
    .maybeSingle();

  const base: ListenerHealth = {
    status: "never_run",
    reason: "The listener has not completed a run on this network yet.",
    network: activeNetwork,
    chainHeadBlock: state?.chain_head_block ?? null,
    lastProcessedBlock: state?.last_processed_block ?? null,
    addressesMonitored: state?.addresses_monitored ?? 0,
    lastSuccessAt: state?.last_success_at ?? null,
    lastPollAt: state?.last_poll_at ?? null,
    lastError: state?.last_error ?? null,
    lastErrorAt: state?.last_error_at ?? null,
    consecutiveFailures: state?.consecutive_failures ?? 0,
    secondsSinceSuccess: null,
    staleAfterSeconds,
  };

  if (!state || !state.last_success_at) return base;

  const secondsSinceSuccess = Math.round(
    (Date.now() - new Date(state.last_success_at).getTime()) / 1000,
  );
  base.secondsSinceSuccess = secondsSinceSuccess;

  if (state.consecutive_failures > 0) {
    return {
      ...base,
      status: state.consecutive_failures >= 3 ? "offline" : "degraded",
      reason:
        state.last_error ??
        `The last ${state.consecutive_failures} listener run(s) failed to reach the blockchain node.`,
    };
  }
  if (secondsSinceSuccess > staleAfterSeconds * 5) {
    return {
      ...base,
      status: "offline",
      reason: `No successful blockchain poll for ${secondsSinceSuccess}s.`,
    };
  }
  if (secondsSinceSuccess > staleAfterSeconds) {
    return {
      ...base,
      status: "degraded",
      reason: `Last successful blockchain poll was ${secondsSinceSuccess}s ago (stale after ${staleAfterSeconds}s).`,
    };
  }
  if (!state.chain_head_block) {
    return { ...base, status: "degraded", reason: "The chain head block is unknown." };
  }
  if (state.addresses_monitored === 0) {
    return {
      ...base,
      status: "degraded",
      reason: "The listener is healthy but no active address is being monitored on this network.",
    };
  }

  return { ...base, status: "live", reason: null };
}
