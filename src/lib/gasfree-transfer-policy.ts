import type { ChainNetwork } from "@/lib/chain";

export const GASFREE_PROVIDER_NAME = "gasfree_open_api";
export const GASFREE_SUPPORTED_ASSET = "USDT";
export const GASFREE_MAINNET_PROVIDER_BASE_URL = "https://open.gasfree.io/tron";
export const GASFREE_NILE_PROVIDER_BASE_URL = "https://open-test.gasfree.io/nile";

export const GASFREE_ENV_NAMES = [
  "GASFREE_PROVIDER_BASE_URL",
  "GASFREE_SERVICE_PROVIDER_ADDRESS",
  "GASFREE_API_KEY",
  "GASFREE_API_SECRET",
  "GASFREE_REQUEST_TIMEOUT_MS",
] as const;

export type GasFreeServiceStatus =
  | "NOT_CONFIGURED"
  | "ELIGIBILITY_CHECK"
  | "ACTIVATION_REQUIRED"
  | "PENDING"
  | "AVAILABLE"
  | "TEMPORARILY_UNAVAILABLE"
  | "LIMIT_REACHED"
  | "DISABLED"
  | "PROVIDER_ERROR";

export type GasFreeTransferStatus =
  | "CREATED"
  | "VALIDATING"
  | "AUTHORIZED"
  | "SUBMITTED_TO_PROVIDER"
  | "BROADCAST"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FAILED"
  | "EXPIRED";

export interface GasFreeSettingsLike {
  enabled?: boolean;
  mainnetEnabled?: boolean;
  killSwitch?: boolean;
  supportedAsset?: string;
  perTxMaxUsdt?: number;
  userDailyMaxUsdt?: number;
  globalDailyMaxUsdt?: number;
}

export interface GasFreeProviderConfigLike {
  providerBaseUrl?: string | null;
  serviceProviderAddress?: string | null;
  apiKeyConfigured?: boolean;
  apiSecretConfigured?: boolean;
}

export function gasFreeProviderBaseUrl(network: ChainNetwork, override?: string | null) {
  if (override?.trim()) return override.trim().replace(/\/+$/, "");
  return network === "trc20-mainnet"
    ? GASFREE_MAINNET_PROVIDER_BASE_URL
    : GASFREE_NILE_PROVIDER_BASE_URL;
}

export function gasFreeApiSigningPath(baseUrl: string, endpoint: string) {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  return `${basePath}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

export function gasFreeApiCredentialsState(input: {
  apiKey?: string | null;
  apiSecret?: string | null;
}) {
  if (!input.apiKey && !input.apiSecret) return "not_configured" as const;
  if (input.apiKey && input.apiSecret) return "configured" as const;
  return "incomplete" as const;
}

export function gasFreeServiceReadiness(input: {
  settings: GasFreeSettingsLike;
  provider: GasFreeProviderConfigLike;
  network: ChainNetwork;
  asset: string;
  amount?: number;
}) {
  const asset = input.asset.toUpperCase();
  if (asset !== (input.settings.supportedAsset ?? GASFREE_SUPPORTED_ASSET).toUpperCase()) {
    return { status: "TEMPORARILY_UNAVAILABLE" as const, reason: "Unsupported GasFree asset." };
  }
  if (!input.provider.providerBaseUrl) {
    return {
      status: "NOT_CONFIGURED" as const,
      reason: "GasFree provider configuration is missing.",
    };
  }
  if (input.provider.apiKeyConfigured !== input.provider.apiSecretConfigured) {
    return {
      status: "NOT_CONFIGURED" as const,
      reason: "GasFree API key and secret must be configured together.",
    };
  }
  if (!input.provider.apiKeyConfigured || !input.provider.apiSecretConfigured) {
    return {
      status: "NOT_CONFIGURED" as const,
      reason: "GasFree API credentials are required by the provider.",
    };
  }
  if (input.settings.killSwitch !== false) {
    return { status: "DISABLED" as const, reason: "Emergency kill switch is enabled." };
  }
  if (input.settings.enabled !== true) {
    return { status: "DISABLED" as const, reason: "GasFree transfer service is disabled." };
  }
  if (input.network !== "trc20-mainnet") {
    return {
      status: "TEMPORARILY_UNAVAILABLE" as const,
      reason: "Only TRON Mainnet USDT is supported.",
    };
  }
  if (input.settings.mainnetEnabled !== true) {
    return { status: "DISABLED" as const, reason: "GasFree Mainnet transfers are disabled." };
  }
  const max = Number(input.settings.perTxMaxUsdt ?? 0);
  if (!Number.isFinite(max) || max <= 0) {
    return { status: "DISABLED" as const, reason: "GasFree per-transaction limit is disabled." };
  }
  if (input.amount !== undefined && input.amount > max) {
    return {
      status: "LIMIT_REACHED" as const,
      reason: "GasFree transfer amount exceeds the configured limit.",
    };
  }
  return {
    status: "AVAILABLE" as const,
    reason: "GasFree provider is configured for TRON Mainnet USDT.",
  };
}

export function isGasFreeTransferExecutable(status: GasFreeServiceStatus) {
  return status === "AVAILABLE";
}

export function gasFreeRequiresTransactionPassword(status: GasFreeServiceStatus) {
  return status === "AVAILABLE" || status === "ACTIVATION_REQUIRED";
}

export function validateGasFreeReplay(input: {
  idempotencyKey: string;
  deadlineMs: number;
  nowMs: number;
}) {
  if (input.idempotencyKey.trim().length < 8) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  if (input.deadlineMs <= input.nowMs) throw new Error("GASFREE_AUTHORIZATION_EXPIRED");
  if (input.deadlineMs - input.nowMs > 30 * 60_000) {
    throw new Error("GASFREE_AUTHORIZATION_DEADLINE_TOO_LONG");
  }
  return true;
}
