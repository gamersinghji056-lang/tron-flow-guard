import type { ChainNetwork } from "@/lib/chain";

export interface NetworkProbe {
  network: ChainNetwork;
  trxBalance: number;
  usdtBalance: number;
  txCount: number;
}

export type ImportedWalletNetworkDecision =
  | { type: "selected"; network: ChainNetwork; reason: "single_active" | "confirmed" }
  | {
      type: "requires_selection";
      reason: "multiple_active" | "no_activity";
      probes: NetworkProbe[];
    };

function probeScore(probe: NetworkProbe) {
  return Number(probe.trxBalance > 0) + Number(probe.usdtBalance > 0) + probe.txCount;
}

export function decideImportedWalletNetwork(
  requested: ChainNetwork,
  probes: NetworkProbe[],
  confirmed: boolean,
): ImportedWalletNetworkDecision {
  if (confirmed) return { type: "selected", network: requested, reason: "confirmed" };

  const active = probes.filter((probe) => probeScore(probe) > 0);
  if (active.length === 1) {
    return { type: "selected", network: active[0]!.network, reason: "single_active" };
  }
  if (active.length > 1) return { type: "requires_selection", reason: "multiple_active", probes };
  return { type: "requires_selection", reason: "no_activity", probes };
}

export function chooseImportedWalletNetwork(requested: ChainNetwork, probes: NetworkProbe[]) {
  const decision = decideImportedWalletNetwork(requested, probes, false);
  return decision.type === "selected" ? decision.network : null;
}
