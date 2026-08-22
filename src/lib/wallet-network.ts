import type { ChainNetwork } from "@/lib/chain";

export interface NetworkProbe {
  network: ChainNetwork;
  trxBalance: number;
  usdtBalance: number;
  txCount: number;
}

export function chooseImportedWalletNetwork(
  requested: ChainNetwork,
  probes: NetworkProbe[],
): ChainNetwork {
  const score = (probe: NetworkProbe) =>
    Number(probe.trxBalance > 0) + Number(probe.usdtBalance > 0) + probe.txCount;
  const active = probes.filter((probe) => score(probe) > 0);
  if (!active.length) return requested;

  const mainnet = active.find((probe) => probe.network === "trc20-mainnet");
  if (mainnet) return mainnet.network;
  return active[0]?.network ?? requested;
}
