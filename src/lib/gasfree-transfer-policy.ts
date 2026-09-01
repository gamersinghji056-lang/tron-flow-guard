import type { ChainNetwork } from "@/lib/chain";

export const GASFREE_PROVIDER_NAME = "gasfree_open_api";
export const GASFREE_SUPPORTED_ASSET = "USDT";
export const GASFREE_MAINNET_PROVIDER_BASE_URL = "https://open.gasfree.io/tron";
export const GASFREE_NILE_PROVIDER_BASE_URL = "https://open-test.gasfree.io/nile";

export const GASFREE_MAINNET_ENV_NAMES = [
  "GASFREE_PROVIDER_BASE_URL",
  "GASFREE_SERVICE_PROVIDER_ADDRESS",
  "GASFREE_API_KEY",
  "GASFREE_API_SECRET",
  "GASFREE_REQUEST_TIMEOUT_MS",
] as const;

export const GASFREE_NILE_ENV_NAMES = [
  "GASFREE_NILE_PROVIDER_BASE_URL",
  "GASFREE_NILE_SERVICE_PROVIDER_ADDRESS",
  "GASFREE_NILE_API_KEY",
  "GASFREE_NILE_API_SECRET",
  "GASFREE_REQUEST_TIMEOUT_MS",
] as const;

export const GASFREE_ENV_NAMES = [...GASFREE_MAINNET_ENV_NAMES, ...GASFREE_NILE_ENV_NAMES] as const;

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

export type GasFreeAccountState =
  | "DISCOVERED"
  | "READY"
  | "ACTIVATION_REQUIRED"
  | "ACTIVATING"
  | "ACTIVE"
  | "TRANSFERS_DISABLED"
  | "PROVIDER_UNAVAILABLE"
  | "DISABLED_BY_ADMIN"
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_TEST_FUNDS"
  | "ERROR";

export type TransactionPasswordAuthorizationState =
  | "PASSWORD_NOT_PROVIDED"
  | "WRONG_PASSWORD"
  | "PASSWORD_NOT_CONFIGURED"
  | "PASSWORD_LOCKED"
  | "PASSWORD_VERIFIED";

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

export interface GasFreeProviderRuntimeConfig {
  providerBaseUrl: string;
  serviceProviderAddress: string | null;
  apiKey: string | null;
  apiSecret: string | null;
  apiKeyConfigured: boolean;
  apiSecretConfigured: boolean;
  timeoutMs: number;
  envNames: readonly string[];
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

function parseTimeout(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveGasFreeProviderConfig(
  network: ChainNetwork,
  env: Pick<NodeJS.ProcessEnv, string> = process.env,
): GasFreeProviderRuntimeConfig {
  if (network === "trc20-nile") {
    const providerBaseUrl = gasFreeProviderBaseUrl(network, env["GASFREE_NILE_PROVIDER_BASE_URL"]);
    const apiKey = env["GASFREE_NILE_API_KEY"]?.trim() || null;
    const apiSecret = env["GASFREE_NILE_API_SECRET"]?.trim() || null;
    return {
      providerBaseUrl,
      serviceProviderAddress: env["GASFREE_NILE_SERVICE_PROVIDER_ADDRESS"]?.trim() || null,
      apiKey,
      apiSecret,
      apiKeyConfigured: Boolean(apiKey),
      apiSecretConfigured: Boolean(apiSecret),
      timeoutMs: parseTimeout(env["GASFREE_REQUEST_TIMEOUT_MS"], 8_000),
      envNames: GASFREE_NILE_ENV_NAMES,
    };
  }

  const providerBaseUrl = gasFreeProviderBaseUrl(network, env["GASFREE_PROVIDER_BASE_URL"]);
  const apiKey = env["GASFREE_API_KEY"]?.trim() || null;
  const apiSecret = env["GASFREE_API_SECRET"]?.trim() || null;
  return {
    providerBaseUrl,
    serviceProviderAddress: env["GASFREE_SERVICE_PROVIDER_ADDRESS"]?.trim() || null,
    apiKey,
    apiSecret,
    apiKeyConfigured: Boolean(apiKey),
    apiSecretConfigured: Boolean(apiSecret),
    timeoutMs: parseTimeout(env["GASFREE_REQUEST_TIMEOUT_MS"], 8_000),
    envNames: GASFREE_MAINNET_ENV_NAMES,
  };
}

export function gasFreeServiceReadiness(input: {
  settings: GasFreeSettingsLike;
  provider: GasFreeProviderConfigLike;
  network: ChainNetwork;
  asset: string;
  amount?: number;
  allowTestnet?: boolean;
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
  if (input.network !== "trc20-mainnet" && input.allowTestnet === true) {
    return {
      status: "AVAILABLE" as const,
      reason: "GasFree provider is configured for TRON Nile USDT diagnostics.",
    };
  }
  if (input.settings.killSwitch !== false) {
    return { status: "DISABLED" as const, reason: "Emergency kill switch is enabled." };
  }
  if (input.settings.enabled !== true) {
    return { status: "DISABLED" as const, reason: "GasFree transfer service is disabled." };
  }
  if (input.network !== "trc20-mainnet" && input.allowTestnet !== true) {
    return {
      status: "TEMPORARILY_UNAVAILABLE" as const,
      reason: "Only TRON Mainnet USDT is supported.",
    };
  }
  if (input.network === "trc20-mainnet" && input.settings.mainnetEnabled !== true) {
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

export function gasFreeAccountState(input: {
  discovered?: boolean | null;
  active?: boolean | null;
  allowSubmit?: boolean | null;
  serviceStatus: GasFreeServiceStatus;
  testFundsSufficient?: boolean | null;
  balanceSufficient?: boolean | null;
}) {
  if (input.serviceStatus === "DISABLED") return "DISABLED_BY_ADMIN" as const;
  if (input.serviceStatus === "PROVIDER_ERROR" || input.serviceStatus === "NOT_CONFIGURED") {
    return "PROVIDER_UNAVAILABLE" as const;
  }
  if (input.testFundsSufficient === false) return "INSUFFICIENT_TEST_FUNDS" as const;
  if (input.balanceSufficient === false) return "INSUFFICIENT_BALANCE" as const;
  if (input.active === true) return "ACTIVE" as const;
  if (input.allowSubmit === false) return "ACTIVATING" as const;
  if (input.discovered === true && input.active == null) return "DISCOVERED" as const;
  return "ACTIVATION_REQUIRED" as const;
}

export function gasFreeOperationalState(input: {
  discovered?: boolean | null;
  accountActive?: boolean | null;
  serviceStatus: GasFreeServiceStatus;
  tokenSupported?: boolean | null;
}) {
  if (!input.discovered) return "ERROR" as const;
  if (input.accountActive !== true) {
    return gasFreeAccountState({
      discovered: true,
      active: input.accountActive ?? null,
      serviceStatus: input.serviceStatus,
    });
  }
  if (input.serviceStatus === "AVAILABLE" && input.tokenSupported !== false)
    return "READY" as const;
  if (input.serviceStatus === "DISABLED") return "TRANSFERS_DISABLED" as const;
  if (input.serviceStatus === "PROVIDER_ERROR" || input.serviceStatus === "NOT_CONFIGURED") {
    return "PROVIDER_UNAVAILABLE" as const;
  }
  return "ACTIVE" as const;
}

export function classifyTransactionPasswordAuthorizationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message) return "WRONG_PASSWORD" as const;
  if (/temporarily locked/i.test(message)) return "PASSWORD_LOCKED" as const;
  if (/set a transaction password/i.test(message)) return "PASSWORD_NOT_CONFIGURED" as const;
  if (/required/i.test(message) && /password/i.test(message))
    return "PASSWORD_NOT_PROVIDED" as const;
  if (/incorrect|authenticate|unsupported state/i.test(message)) return "WRONG_PASSWORD" as const;
  return "WRONG_PASSWORD" as const;
}

export function providerTxidForPersistence(input: { txnHash?: string | null }) {
  return input.txnHash?.trim() || null;
}

export function isGasFreeTransferExecutable(status: GasFreeServiceStatus) {
  return status === "AVAILABLE" || status === "ACTIVATION_REQUIRED";
}

export function gasFreeCustomerFee(configuredFee: number, providerFee: number) {
  const configured = Number.isFinite(configuredFee) && configuredFee > 0 ? configuredFee : 0;
  const provider = Number.isFinite(providerFee) && providerFee > 0 ? providerFee : 0;
  return Math.max(configured, provider);
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
