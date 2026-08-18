/**
 * Chain configuration shared by the frontend, server functions and the
 * blockchain listener. Client-safe: contains no secrets.
 */
import type { Database } from "@/integrations/supabase/types";

export type ChainNetwork = Database["public"]["Enums"]["chain_network"];
export type DepositStatus = Database["public"]["Enums"]["deposit_status"];

export interface NetworkConfig {
  id: ChainNetwork;
  label: string;
  shortLabel: string;
  /** TronGrid full-node + API base url */
  apiBase: string;
  /** TRC20 USDT token contract on this network */
  usdtContract: string;
  tokenSymbol: string;
  tokenDecimals: number;
  explorerTx: (txid: string) => string;
  explorerAddress: (address: string) => string;
  isTestnet: boolean;
}

export const NETWORKS: Record<ChainNetwork, NetworkConfig> = {
  "trc20-mainnet": {
    id: "trc20-mainnet",
    label: "TRON Mainnet (TRC20)",
    shortLabel: "TRC20",
    apiBase: "https://api.trongrid.io",
    usdtContract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    tokenSymbol: "USDT",
    tokenDecimals: 6,
    explorerTx: (txid) => `https://tronscan.org/#/transaction/${txid}`,
    explorerAddress: (address) => `https://tronscan.org/#/address/${address}`,
    isTestnet: false,
  },
  "trc20-nile": {
    id: "trc20-nile",
    label: "TRON Nile Testnet (TRC20)",
    shortLabel: "TRC20 Nile",
    apiBase: "https://nile.trongrid.io",
    usdtContract: "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj",
    tokenSymbol: "USDT",
    tokenDecimals: 6,
    explorerTx: (txid) => `https://nile.tronscan.org/#/transaction/${txid}`,
    explorerAddress: (address) => `https://nile.tronscan.org/#/address/${address}`,
    isTestnet: true,
  },
};

export const DEFAULT_NETWORK: ChainNetwork = "trc20-nile";

export function networkConfig(network: ChainNetwork | null | undefined): NetworkConfig {
  return NETWORKS[network ?? DEFAULT_NETWORK] ?? NETWORKS[DEFAULT_NETWORK];
}

/** Base58 TRON address shape (mainnet + testnets both use the T prefix). */
export const TRON_ADDRESS_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isTronAddress(value: string): boolean {
  return TRON_ADDRESS_REGEX.test(value.trim());
}

export function shortenHash(value: string | null | undefined, size = 6): string {
  if (!value) return "—";
  if (value.length <= size * 2 + 3) return value;
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}

export function formatUsdt(value: number | string | null | undefined): string {
  const amount = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(amount)) return "0.00";
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function parseTokenBalanceHex(hex: string | undefined, decimals: number): number {
  if (!hex) return 0;
  const baseUnits = BigInt(`0x${hex}`);
  return Number(baseUnits) / 10 ** decimals;
}

export const DEPOSIT_STATUS_META: Record<
  DepositStatus,
  { label: string; tone: "muted" | "info" | "warning" | "success" | "destructive"; hint: string }
> = {
  waiting: {
    label: "Waiting",
    tone: "muted",
    hint: "Waiting for an incoming transfer to the assigned wallet.",
  },
  detected: {
    label: "Transaction Detected",
    tone: "info",
    hint: "A matching transfer was found on-chain and is being verified.",
  },
  confirming: {
    label: "Confirming",
    tone: "warning",
    hint: "Verified. Waiting for the required block confirmations.",
  },
  confirmed: {
    label: "Confirmed",
    tone: "success",
    hint: "Fully confirmed on-chain. Crediting the trader balance.",
  },
  credited: {
    label: "Credited",
    tone: "success",
    hint: "Confirmed on-chain and credited to the trader balance.",
  },
  underpaid: {
    label: "Underpaid",
    tone: "warning",
    hint: "Less USDT arrived than the order requested. Held for review.",
  },
  overpaid: {
    label: "Overpaid",
    tone: "warning",
    hint: "More USDT arrived than the order requested. Handled by the overpayment policy.",
  },
  late_payment: {
    label: "Late Payment",
    tone: "warning",
    hint: "The transfer arrived after the order expired. Never discarded.",
  },
  review: {
    label: "Under Review",
    tone: "warning",
    hint: "Requires an administrator decision before crediting.",
  },
  failed: { label: "Failed", tone: "destructive", hint: "Verification failed. See the reason." },
  expired: { label: "Expired", tone: "muted", hint: "No transfer arrived before the deadline." },
};
