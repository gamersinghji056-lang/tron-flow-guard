import type { ChainNetwork } from "@/lib/chain";

export interface NetworkProbe {
  network: ChainNetwork;
  trxBalance: number;
  usdtBalance: number;
  txCount: number;
}

export type ImportedWalletNetworkDecision =
  | {
      type: "selected";
      network: ChainNetwork;
      reason: "single_active" | "confirmed" | "production_default" | "mainnet_preferred";
      warning?: "nile_test_activity_only";
    }
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
    const network = active[0]!.network;
    const decision: ImportedWalletNetworkDecision = {
      type: "selected",
      network,
      reason: "single_active",
    };
    if (network === "trc20-nile") decision.warning = "nile_test_activity_only";
    return decision;
  }
  if (active.length > 1) {
    return { type: "selected", network: "trc20-mainnet", reason: "mainnet_preferred" };
  }
  return { type: "selected", network: "trc20-mainnet", reason: "production_default" };
}

export function chooseImportedWalletNetwork(requested: ChainNetwork, probes: NetworkProbe[]) {
  const decision = decideImportedWalletNetwork(requested, probes, false);
  return decision.type === "selected" ? decision.network : null;
}
