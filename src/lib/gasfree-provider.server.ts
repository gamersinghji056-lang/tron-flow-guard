import { createHmac, randomUUID } from "node:crypto";
import * as GasFreeSdk from "@gasfree/gasfree-sdk";
import type { ChainNetwork } from "@/lib/chain";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isTronAddress } from "@/lib/chain";
import {
  deriveGasFreeAddressFromGeneralAddress,
  gasfreeChainIdForNetwork,
} from "@/lib/gasfree-address";
import {
  GASFREE_PROVIDER_NAME,
  GASFREE_SUPPORTED_ASSET,
  classifyTransactionPasswordAuthorizationError,
  gasFreeAccountState,
  gasFreeOperationalState,
  gasFreeServiceReadiness,
  isGasFreeTransferExecutable,
  providerTxidForPersistence,
  resolveGasFreeProviderConfig,
  validateGasFreeReplay,
  type GasFreeServiceStatus,
} from "@/lib/gasfree-transfer-policy";
import { signGasFreePermitTypedData } from "@/lib/gasfree-signing";
import { safeErrorMessage, writeServiceHeartbeat } from "@/lib/system-health.server";
import {
  evaluateTransferPolicy,
  type TransferPolicySettings,
  type UserTransferControlLike,
} from "@/lib/transfer-control-policy";
import {
  assertUserTransferPolicyAllowed,
  evaluateUserTransferPolicy,
} from "@/lib/transfer-control-policy.server";

const gasfreeSdkModule =
  "default" in GasFreeSdk && GasFreeSdk.default
    ? (GasFreeSdk.default as typeof import("@gasfree/gasfree-sdk"))
    : (GasFreeSdk as typeof import("@gasfree/gasfree-sdk"));
const { TronGasFree } = gasfreeSdkModule;

type SettingValue = string | number | boolean | null;
type GasFreeApiEnvelope<T> = {
  code?: number;
  reason?: string | null;
  message?: string | null;
  data?: T | null;
};

export interface GasFreeOpenApiProvider {
  address: string;
  name: string;
  icon?: string | null;
  website?: string | null;
  config?: {
    maxPendingTransfer?: number | string | null;
    minDeadlineDuration?: number | string | null;
    maxDeadlineDuration?: number | string | null;
    defaultDeadlineDuration?: number | string | null;
  } | null;
}

export interface GasFreeOpenApiToken {
  tokenAddress: string;
  symbol: string;
  decimal: number;
  supported?: boolean | null;
  activateFee?: number | string | null;
  transferFee?: number | string | null;
}

export interface GasFreeOpenApiAccount {
  accountAddress: string;
  gasFreeAddress: string;
  active?: boolean | null;
  nonce: number | string;
  allowSubmit?: boolean | null;
  allow_submit?: boolean | null;
  assets?: Array<{
    tokenAddress: string;
    tokenSymbol?: string | null;
    activateFee?: number | string | null;
    transferFee?: number | string | null;
    decimal?: number | string | null;
    frozen?: number | string | null;
  }> | null;
}

export interface GasFreeOpenApiTransferStatus {
  id: string;
  state?: "WAITING" | "INPROGRESS" | "CONFIRMING" | "SUCCEED" | "FAILED" | string | null;
  txnHash?: string | null;
  txnState?: string | null;
  nonce?: number | string | null;
  estimatedActivateFee?: number | string | null;
  estimatedTransferFee?: number | string | null;
  estimatedTotalFee?: number | string | null;
  estimatedTotalCost?: number | string | null;
  expiredAt?: string | null;
}

export interface GasFreeTransferReadiness {
  provider: string;
  providerAddress?: string | null;
  status: GasFreeServiceStatus;
  reason: string;
  network: ChainNetwork;
  asset: string;
  configured: boolean;
  envNames: readonly string[];
  serviceProviderConfigured: boolean;
  apiKeyConfigured: boolean;
  apiSecretConfigured: boolean;
  apiCredentialsRequired: boolean;
  chainId: number;
  tokenAddress?: string | null;
  transferFee?: number | null;
  activateFee?: number | null;
  providerFee?: number | null;
  defaultDeadlineSeconds?: number | null;
  accountStatus?: string | null;
  activationState?: string | null;
  accountActive?: boolean | null;
  accountAllowSubmit?: boolean | null;
  accountNonce?: string | null;
  quoteAvailable?: boolean | null;
  productTransferAllowed?: boolean | null;
  productTransferBlockedBy?: string | null;
  productTransferReason?: string | null;
}

export interface GasFreePermitTransferInput {
  token: string;
  serviceProvider: string;
  user: string;
  receiver: string;
  value: string;
  maxFee: string;
  deadline: string;
  version: string;
  nonce: string;
}

function parseBoolean(value: SettingValue, fallback: boolean) {
  if (value === true || value === false) return value;
  if (typeof value === "string") return value === "true";
  return fallback;
}

function parseNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJsonString(value: unknown, fallback: string) {
  return String(value ?? fallback).replace(/^"|"$/g, "");
}

function usdtBaseUnits(amount: number, decimals = 6) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
  const factor = 10 ** decimals;
  return String(Math.round(amount * factor));
}

function apiPath(baseUrl: string, endpoint: string) {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  return `${basePath}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

async function readSettings() {
  const keys = [
    "gasfree_transfer_enabled",
    "gasfree_provider",
    "gasfree_mainnet_enabled",
    "gasfree_supported_asset",
    "gasfree_per_tx_max_usdt",
    "gasfree_user_daily_max_usdt",
    "gasfree_global_daily_max_usdt",
    "gasfree_kill_switch",
    "gasfree_provider_fee_policy",
    "gasfree_wtron_fee_policy",
  ];
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", keys);
  if (error) throw new Error(error.message);
  const map = new Map((data ?? []).map((row) => [row.key, row.value as SettingValue]));
  return {
    enabled: parseBoolean(map.get("gasfree_transfer_enabled") ?? null, false),
    provider: parseJsonString(map.get("gasfree_provider"), GASFREE_PROVIDER_NAME),
    mainnetEnabled: parseBoolean(map.get("gasfree_mainnet_enabled") ?? null, false),
    supportedAsset: parseJsonString(map.get("gasfree_supported_asset"), GASFREE_SUPPORTED_ASSET),
    perTxMaxUsdt: parseNumber(map.get("gasfree_per_tx_max_usdt") ?? null, 0),
    userDailyMaxUsdt: parseNumber(map.get("gasfree_user_daily_max_usdt") ?? null, 0),
    globalDailyMaxUsdt: parseNumber(map.get("gasfree_global_daily_max_usdt") ?? null, 0),
    killSwitch: parseBoolean(map.get("gasfree_kill_switch") ?? null, true),
  };
}

function readProviderConfig(network: ChainNetwork) {
  return resolveGasFreeProviderConfig(network);
}

function signedHeaders(input: {
  method: "GET" | "POST";
  path: string;
  apiKey?: string | null;
  apiSecret?: string | null;
}) {
  if (!input.apiKey && !input.apiSecret) return {};
  if (!input.apiKey || !input.apiSecret) {
    throw new Error("GasFree API key and secret must be configured together.");
  }
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", input.apiSecret)
    .update(`${input.method}${input.path}${timestamp}`)
    .digest("base64");
  return {
    Timestamp: timestamp,
    Authorization: `ApiKey ${input.apiKey}:${signature}`,
  };
}

async function gasfreeFetch<T>(
  network: ChainNetwork,
  endpoint: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
) {
  const config = readProviderConfig(network);
  const method = options.method ?? "GET";
  const path = apiPath(config.providerBaseUrl, endpoint);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const requestInit: RequestInit = {
      method,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...signedHeaders({
          method,
          path,
          apiKey: config.apiKey,
          apiSecret: config.apiSecret,
        }),
      },
      signal: controller.signal,
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    };
    const response = await fetch(`${config.providerBaseUrl}${endpoint}`, requestInit);
    if (!response.ok) throw new Error(`GasFree provider HTTP ${response.status}`);
    const envelope = (await response.json()) as GasFreeApiEnvelope<T>;
    if (envelope.code !== 200) {
      throw new Error(envelope.reason || envelope.message || "GasFree provider request failed");
    }
    return envelope.data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("GasFree provider request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function validateProvider(row: GasFreeOpenApiProvider) {
  if (!row || !isTronAddress(row.address)) throw new Error("GasFree provider address is invalid");
  return row;
}

function validateToken(row: GasFreeOpenApiToken) {
  if (!row || !isTronAddress(row.tokenAddress)) throw new Error("GasFree token address is invalid");
  if (String(row.symbol ?? "").toUpperCase() !== GASFREE_SUPPORTED_ASSET) {
    throw new Error("GasFree token is not USDT");
  }
  if (Number(row.decimal) !== 6) throw new Error("GasFree USDT decimal is not 6");
  return row;
}

export async function getProviderConfig(network: ChainNetwork) {
  const data = await gasfreeFetch<{ providers?: GasFreeOpenApiProvider[] }>(
    network,
    "/api/v1/config/provider/all",
  );
  const providers = (data?.providers ?? []).map(validateProvider);
  if (!providers.length) throw new Error("GasFree provider list is empty");
  const pinned = readProviderConfig(network).serviceProviderAddress;
  if (pinned) {
    const provider = providers.find((row) => row.address === pinned);
    if (!provider) throw new Error("Pinned GasFree provider is not in provider list");
    return provider;
  }
  return providers[0]!;
}

export async function getSupportedTokens(network: ChainNetwork) {
  const data = await gasfreeFetch<{ tokens?: GasFreeOpenApiToken[] }>(
    network,
    "/api/v1/config/token/all",
  );
  return (data?.tokens ?? [])
    .filter((row) => row.supported !== false)
    .filter((row) => String(row.symbol ?? "").toUpperCase() === GASFREE_SUPPORTED_ASSET)
    .map(validateToken);
}

export async function getAccountInfo(network: ChainNetwork, generalAddress: string) {
  if (!isTronAddress(generalAddress)) throw new Error("General wallet address is invalid");
  const account = await gasfreeFetch<GasFreeOpenApiAccount>(
    network,
    `/api/v1/address/${encodeURIComponent(generalAddress)}`,
  );
  if (
    !account ||
    !isTronAddress(account.accountAddress) ||
    !isTronAddress(account.gasFreeAddress)
  ) {
    throw new Error("GasFree account response is invalid");
  }
  const expected = deriveGasFreeAddressFromGeneralAddress(generalAddress, network);
  if (account.accountAddress !== generalAddress || account.gasFreeAddress !== expected) {
    throw new Error("GasFree account response does not match this wallet");
  }
  return account;
}

export async function getGasFreeAddressStatus(network: ChainNetwork, generalAddress: string) {
  const account = await getAccountInfo(network, generalAddress);
  return {
    gasFreeAddress: account.gasFreeAddress,
    active: account.active === true,
    nonce: String(account.nonce),
    allowSubmit: account.allowSubmit ?? account.allow_submit ?? false,
  };
}

export async function getTransferQuote(input: {
  network: ChainNetwork;
  generalAddress: string;
  amount: number;
}) {
  const [provider, tokens, account] = await Promise.all([
    getProviderConfig(input.network),
    getSupportedTokens(input.network),
    getAccountInfo(input.network, input.generalAddress),
  ]);
  const token = tokens.find((row) => String(row.symbol).toUpperCase() === GASFREE_SUPPORTED_ASSET);
  if (!token) throw new Error("GasFree USDT is not supported by provider");
  const asset = account.assets?.find(
    (row) =>
      row.tokenAddress === token.tokenAddress ||
      String(row.tokenSymbol ?? "").toUpperCase() === GASFREE_SUPPORTED_ASSET,
  );
  const activateFee =
    account.active === true ? 0 : parseNumber(asset?.activateFee ?? token.activateFee, 0);
  const transferFee = parseNumber(asset?.transferFee ?? token.transferFee, 0);
  const frozen = parseNumber(asset?.frozen, 0);
  const maxFee = activateFee + transferFee;
  const decimals = Number(token.decimal);
  const value = usdtBaseUnits(input.amount, decimals);
  const defaultDeadlineSeconds = parseNumber(provider.config?.defaultDeadlineDuration, 180);
  const minDeadlineSeconds = parseNumber(provider.config?.minDeadlineDuration, 60);
  const maxDeadlineSeconds = parseNumber(provider.config?.maxDeadlineDuration, 600);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const deadlineSeconds =
    nowSeconds + Math.min(Math.max(defaultDeadlineSeconds, minDeadlineSeconds), maxDeadlineSeconds);
  return {
    provider,
    token,
    account,
    value,
    activateFee,
    transferFee,
    frozen,
    maxFee,
    nonce: String(account.nonce),
    deadlineSeconds,
    decimals,
    allowSubmit: account.allowSubmit ?? account.allow_submit ?? false,
  };
}

export function prepareTransfer(input: {
  network: ChainNetwork;
  token: string;
  serviceProvider: string;
  generalAddress: string;
  receiver: string;
  value: string;
  maxFee: string;
  deadline: string;
  nonce: string;
}) {
  if (!isTronAddress(input.token)) throw new Error("GasFree token is invalid");
  if (!isTronAddress(input.serviceProvider)) throw new Error("GasFree provider address is invalid");
  if (!isTronAddress(input.generalAddress)) throw new Error("General wallet address is invalid");
  if (!isTronAddress(input.receiver)) throw new Error("Recipient address is invalid");
  const sdk = new TronGasFree({ chainId: gasfreeChainIdForNetwork(input.network) });
  const typedData = sdk.assembleGasFreeTransactionJson({
    token: input.token,
    serviceProvider: input.serviceProvider,
    user: input.generalAddress,
    receiver: input.receiver,
    value: input.value,
    maxFee: input.maxFee,
    deadline: input.deadline,
    version: "1",
    nonce: input.nonce,
  });
  return {
    typedData,
    message: typedData.message as GasFreePermitTransferInput,
    ledgerHash: sdk.getGasFreeLedgerRawHash({
      message: typedData.message as unknown as Parameters<
        InstanceType<typeof TronGasFree>["getGasFreeLedgerRawHash"]
      >[0]["message"],
    }),
  };
}

export async function submitPermitTransfer(
  network: ChainNetwork,
  body: GasFreePermitTransferInput & {
    requestId: string;
    sig: string;
  },
) {
  return gasfreeFetch<GasFreeOpenApiTransferStatus>(network, "/api/v1/gasfree/submit", {
    method: "POST",
    body,
  });
}

export async function getTransferStatus(network: ChainNetwork, traceId: string) {
  if (!traceId) throw new Error("GasFree trace ID is required");
  return gasfreeFetch<GasFreeOpenApiTransferStatus>(
    network,
    `/api/v1/gasfree/${encodeURIComponent(traceId)}`,
  );
}

export async function healthCheck(network: ChainNetwork = "trc20-mainnet") {
  const provider = await getProviderConfig(network);
  const tokens = await getSupportedTokens(network);
  return {
    provider,
    tokens,
    healthy: tokens.some((row) => String(row.symbol).toUpperCase() === GASFREE_SUPPORTED_ASSET),
  };
}

export async function getGasFreeTransferReadiness(input: {
  network: ChainNetwork;
  asset?: string;
  amount?: number;
  generalAddress?: string;
  allowTestnet?: boolean;
  userId?: string;
}): Promise<GasFreeTransferReadiness> {
  const [settings, productPolicy] = await Promise.all([
    readSettings(),
    input.userId
      ? evaluateUserTransferPolicy({ userId: input.userId, kind: "gasfree_usdt" })
      : Promise.resolve(null),
  ]);
  const providerConfig = readProviderConfig(input.network);
  const staticReadiness = gasFreeServiceReadiness({
    settings,
    provider: {
      providerBaseUrl: providerConfig.providerBaseUrl,
      serviceProviderAddress: providerConfig.serviceProviderAddress ?? "discovered",
      apiKeyConfigured: providerConfig.apiKeyConfigured,
      apiSecretConfigured: providerConfig.apiSecretConfigured,
    },
    network: input.network,
    asset: input.asset ?? GASFREE_SUPPORTED_ASSET,
    ...(input.amount === undefined ? {} : { amount: input.amount }),
    allowTestnet: input.allowTestnet === true,
  });
  const base = {
    provider: settings.provider || GASFREE_PROVIDER_NAME,
    status: staticReadiness.status,
    reason: staticReadiness.reason,
    network: input.network,
    asset: (input.asset ?? GASFREE_SUPPORTED_ASSET).toUpperCase(),
    configured: staticReadiness.status !== "NOT_CONFIGURED",
    envNames: providerConfig.envNames,
    serviceProviderConfigured: Boolean(providerConfig.serviceProviderAddress),
    apiKeyConfigured: providerConfig.apiKeyConfigured,
    apiSecretConfigured: providerConfig.apiSecretConfigured,
    apiCredentialsRequired: true,
    chainId: gasfreeChainIdForNetwork(input.network),
  };
  const canProbeAccount =
    Boolean(input.generalAddress) &&
    Boolean(providerConfig.providerBaseUrl) &&
    providerConfig.apiKeyConfigured === true &&
    providerConfig.apiSecretConfigured === true;
  if (productPolicy && !productPolicy.allowed) {
    return {
      ...base,
      status: "DISABLED",
      reason: productPolicy.reason ?? "Transfers are temporarily unavailable.",
      accountStatus:
        productPolicy.blockedBy === "user" ? "TRANSFERS_DISABLED" : "DISABLED_BY_ADMIN",
      productTransferAllowed: false,
      productTransferBlockedBy: productPolicy.blockedBy,
      productTransferReason: productPolicy.reason,
      quoteAvailable: false,
    };
  }
  try {
    const [provider, tokens] = await Promise.all([
      getProviderConfig(input.network),
      getSupportedTokens(input.network),
    ]);
    const token = tokens.find(
      (row) => String(row.symbol).toUpperCase() === GASFREE_SUPPORTED_ASSET,
    );
    if (!token) {
      return {
        ...base,
        provider: provider.name || GASFREE_PROVIDER_NAME,
        providerAddress: provider.address,
        status: "TEMPORARILY_UNAVAILABLE",
        reason: "GasFree USDT is unsupported.",
        quoteAvailable: false,
      };
    }
    const account = canProbeAccount
      ? await getAccountInfo(input.network, input.generalAddress as string)
      : null;
    const asset = account?.assets?.find(
      (row) =>
        row.tokenAddress === token.tokenAddress ||
        String(row.tokenSymbol ?? "").toUpperCase() === GASFREE_SUPPORTED_ASSET,
    );
    const activateFee = parseNumber(asset?.activateFee ?? token.activateFee, 0);
    const transferFee = parseNumber(asset?.transferFee ?? token.transferFee, 0);
    const accountActive = account ? account.active === true : null;
    const allowSubmit = account ? (account.allowSubmit ?? account.allow_submit ?? false) : null;
    const accountStatus = account
      ? gasFreeAccountState({
          discovered: true,
          active: accountActive,
          allowSubmit,
          serviceStatus: staticReadiness.status,
        })
      : null;
    const activationState =
      accountStatus === "ACTIVE"
        ? "ACTIVE"
        : accountStatus === "ACTIVATING"
          ? "ACTIVATING"
          : account
            ? "ACTIVATION_REQUIRED"
            : null;
    const enrichedBase = {
      ...base,
      productTransferAllowed: productPolicy?.allowed ?? null,
      productTransferBlockedBy: productPolicy?.blockedBy ?? null,
      productTransferReason: productPolicy?.reason ?? null,
      provider: provider.name || GASFREE_PROVIDER_NAME,
      providerAddress: provider.address,
      tokenAddress: token.tokenAddress,
      transferFee,
      activateFee: accountActive ? 0 : activateFee,
      providerFee: ((accountActive ? 0 : activateFee) + transferFee) / 10 ** 6,
      defaultDeadlineSeconds: parseNumber(provider.config?.defaultDeadlineDuration, 180),
      accountStatus:
        account && accountActive
          ? gasFreeOperationalState({
              discovered: true,
              accountActive,
              serviceStatus: staticReadiness.status,
              tokenSupported: true,
            })
          : accountStatus,
      activationState,
      accountActive,
      accountAllowSubmit: allowSubmit,
      accountNonce: account?.nonce == null ? null : String(account.nonce),
      quoteAvailable: Boolean(account && token),
    };
    if (!isGasFreeTransferExecutable(staticReadiness.status)) return enrichedBase;
    const executableStatus =
      account && accountActive !== true
        ? allowSubmit === true
          ? ("ACTIVATION_REQUIRED" as const)
          : ("PENDING" as const)
        : staticReadiness.status;
    return {
      ...enrichedBase,
      status: executableStatus,
      reason: "GasFree provider is available for TRON USDT.",
      accountStatus: account && accountActive ? "READY" : accountStatus,
    };
  } catch (error) {
    return {
      ...base,
      status: "PROVIDER_ERROR",
      reason: safeErrorMessage(error),
      accountStatus: canProbeAccount ? "PROVIDER_UNAVAILABLE" : null,
      quoteAvailable: false,
    };
  }
}

export async function checkGasFreeProviderHealth(network: ChainNetwork = "trc20-mainnet") {
  const readiness = await getGasFreeTransferReadiness({
    network,
    asset: GASFREE_SUPPORTED_ASSET,
    allowTestnet: network === "trc20-nile",
  });
  await writeServiceHeartbeat({
    service: "GASFREE",
    status: readiness.status === "AVAILABLE" ? "HEALTHY" : "DISABLED",
    message: readiness.status === "AVAILABLE" ? null : readiness.reason,
    errorCode: readiness.status === "AVAILABLE" ? null : readiness.status,
    metadata: {
      provider: readiness.provider,
      provider_address: readiness.providerAddress ?? null,
      network: readiness.network,
      asset: readiness.asset,
      configured: readiness.configured,
      token_address: readiness.tokenAddress ?? null,
      env_names: readiness.envNames,
    },
  });
  return readiness;
}

export async function testGasFreeProviderConnection(network: ChainNetwork = "trc20-mainnet") {
  let readiness: GasFreeTransferReadiness;
  try {
    readiness = await checkGasFreeProviderHealth(network);
  } catch (error) {
    const message = safeErrorMessage(error);
    await writeServiceHeartbeat({
      service: "GASFREE",
      status: "DEGRADED",
      message: "GasFree provider test failed.",
      errorCode: "PROVIDER_ERROR",
      metadata: {
        network,
        error: message,
        env_names: resolveGasFreeProviderConfig(network).envNames,
      },
    }).catch(() => undefined);
    return {
      connected: false,
      status: "PROVIDER_ERROR" as const,
      provider: "GasFree",
      providerAddress: null,
      network,
      asset: GASFREE_SUPPORTED_ASSET,
      tokenAddress: null,
      baseUrlConfigured: false,
      credentialState: "MISSING" as const,
      envNames: resolveGasFreeProviderConfig(network).envNames,
      serviceProvider: "Auto-discovery pending",
      message: "Provider authentication or health check failed.",
    };
  }
  const connected = readiness.status === "AVAILABLE";
  const credentialState =
    readiness.apiKeyConfigured && readiness.apiSecretConfigured
      ? "CONFIGURED"
      : readiness.apiKeyConfigured || readiness.apiSecretConfigured
        ? "INCOMPLETE"
        : "MISSING";
  return {
    connected,
    status: readiness.status,
    provider: readiness.provider || "GasFree",
    providerAddress: readiness.providerAddress ?? null,
    network: readiness.network,
    asset: readiness.asset,
    tokenAddress: readiness.tokenAddress ?? null,
    baseUrlConfigured: readiness.configured,
    credentialState,
    envNames: readiness.envNames,
    serviceProvider: readiness.providerAddress
      ? "Auto-discovered"
      : readiness.serviceProviderConfigured
        ? "Pinned"
        : "Auto-discovery pending",
    message: connected
      ? "Connected"
      : readiness.status === "PROVIDER_ERROR"
        ? "Provider authentication or health check failed."
        : readiness.status === "NOT_CONFIGURED"
          ? "GasFree provider environment is not configured."
          : readiness.reason,
  };
}

export async function getAdminGasFreeDiagnostics() {
  const [mainnetResult, nileResult, settings, recent] = await Promise.all([
    testGasFreeProviderConnection("trc20-mainnet").catch((error: unknown) => ({
      connected: false,
      status: "PROVIDER_ERROR" as const,
      provider: "GasFree",
      providerAddress: null,
      network: "trc20-mainnet" as const,
      asset: GASFREE_SUPPORTED_ASSET,
      tokenAddress: null,
      baseUrlConfigured: false,
      credentialState: "MISSING" as const,
      envNames: resolveGasFreeProviderConfig("trc20-mainnet").envNames,
      serviceProvider: "Unavailable",
      message: safeErrorMessage(error),
    })),
    testGasFreeProviderConnection("trc20-nile").catch((error: unknown) => ({
      connected: false,
      status: "PROVIDER_ERROR" as const,
      provider: "GasFree",
      providerAddress: null,
      network: "trc20-nile" as const,
      asset: GASFREE_SUPPORTED_ASSET,
      tokenAddress: null,
      baseUrlConfigured: false,
      credentialState: "MISSING" as const,
      envNames: resolveGasFreeProviderConfig("trc20-nile").envNames,
      serviceProvider: "Unavailable",
      message: safeErrorMessage(error),
    })),
    readSettings(),
    supabaseAdmin
      .from("gasfree_transfer_requests" as never)
      .select(
        "id, network, provider_request_id, status, txid, failure_code, failure_reason, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastRequest = recent.error ? null : recent.data;
  return {
    mainnet: mainnetResult,
    nile: nileResult,
    transferEnabled: settings.enabled,
    mainnetEnabled: settings.mainnetEnabled,
    killSwitch: settings.killSwitch,
    productionReadiness:
      mainnetResult.connected &&
      settings.enabled === true &&
      settings.mainnetEnabled === true &&
      settings.killSwitch === false
        ? "PRODUCTION_ENABLED"
        : mainnetResult.connected
          ? "TECHNICALLY_READY"
          : "NOT_READY",
    lastProviderRequest: lastRequest
      ? {
          id: (lastRequest as { id?: string }).id ?? null,
          network: (lastRequest as { network?: string }).network ?? null,
          providerRequestId:
            (lastRequest as { provider_request_id?: string | null }).provider_request_id ?? null,
          status: (lastRequest as { status?: string | null }).status ?? null,
          txid: (lastRequest as { txid?: string | null }).txid ?? null,
          failureCode: (lastRequest as { failure_code?: string | null }).failure_code ?? null,
          failureReason: (lastRequest as { failure_reason?: string | null }).failure_reason ?? null,
          updatedAt: (lastRequest as { updated_at?: string | null }).updated_at ?? null,
        }
      : null,
  };
}

export async function getAdminGasFreeWalletDiagnostics(limit = 50) {
  const cappedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const since24h = Date.now() - 24 * 60 * 60_000;
  const { data: wallets, error } = await supabaseAdmin
    .from("user_wallets" as never)
    .select(
      "id, user_id, name, address, network, wallet_type, wallet_role, parent_wallet_id, wallet_group_id, custody, backup_status, onchain_balance, onchain_trx_balance, onchain_checked_at, gas_sponsorship_status, gasfree_capability_checked_at, gasfree_capability_error, created_at",
    )
    .eq("is_archived", false as never)
    .order("created_at", { ascending: false })
    .limit(cappedLimit);
  if (error) throw new Error(error.message);

  const rows = (wallets ?? []) as Array<{
    id: string;
    user_id?: string | null;
    name?: string | null;
    address?: string | null;
    network?: ChainNetwork | null;
    wallet_type?: string | null;
    wallet_role?: string | null;
    parent_wallet_id?: string | null;
    wallet_group_id?: string | null;
    custody?: string | null;
    backup_status?: string | null;
    onchain_balance?: number | string | null;
    onchain_trx_balance?: number | string | null;
    onchain_checked_at?: string | null;
    gas_sponsorship_status?: string | null;
    gasfree_capability_checked_at?: string | null;
    gasfree_capability_error?: string | null;
    created_at?: string | null;
  }>;
  const parentIds = Array.from(new Set(rows.map((row) => row.parent_wallet_id).filter(Boolean)));
  const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));

  const [
    parentsRes,
    childrenRes,
    profilesRes,
    rolesRes,
    telegramRes,
    passwordRes,
    secretRes,
    txRes,
    requestRes,
    nileAccessRes,
    transferControlRes,
    transferPolicySettingsRes,
  ] = await Promise.all([
    parentIds.length
      ? supabaseAdmin
          .from("user_wallets" as never)
          .select("id, address, network, is_archived")
          .in("id", parentIds as never)
      : Promise.resolve({ data: [], error: null }),
    rows.length
      ? supabaseAdmin
          .from("user_wallets" as never)
          .select("id, parent_wallet_id, address, network, wallet_type, wallet_role, is_archived")
          .in("parent_wallet_id", rows.map((row) => row.id) as never)
          .eq("wallet_role", "gasfree" as never)
          .eq("wallet_type", "gasfree" as never)
          .eq("is_archived", false as never)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabaseAdmin
          .from("profiles" as never)
          .select("id, email, full_name, username")
          .in("id", userIds as never)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabaseAdmin
          .from("user_roles" as never)
          .select("user_id, role")
          .in("user_id", userIds as never)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabaseAdmin
          .from("telegram_accounts" as never)
          .select("user_id, telegram_user_id, username, status")
          .in("user_id", userIds as never)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabaseAdmin
          .from("transaction_passwords" as never)
          .select("user_id, locked_until")
          .in("user_id", userIds as never)
      : Promise.resolve({ data: [], error: null }),
    rows.length
      ? supabaseAdmin
          .from("personal_wallet_secrets" as never)
          .select("wallet_id, user_id")
          .in("wallet_id", rows.map((row) => row.id) as never)
      : Promise.resolve({ data: [], error: null }),
    rows.length
      ? supabaseAdmin
          .from("wallet_transactions" as never)
          .select("wallet_id, direction, currency, amount, fee, status, created_at, txid")
          .in("wallet_id", rows.map((row) => row.id) as never)
          .order("created_at", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
    rows.length
      ? supabaseAdmin
          .from("gasfree_transfer_requests" as never)
          .select(
            "id, wallet_id, network, provider_request_id, status, txid, failure_code, failure_reason, provider_fee, created_at, updated_at",
          )
          .in("wallet_id", rows.map((row) => row.id) as never)
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabaseAdmin
          .from("nile_test_wallet_users" as never)
          .select("user_id, enabled")
          .in("user_id", userIds as never)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabaseAdmin
          .from("user_transfer_controls" as never)
          .select(
            "user_id, all_transfers_enabled, normal_usdt_enabled, normal_trx_enabled, gasfree_usdt_enabled, reason, changed_at",
          )
          .in("user_id", userIds as never)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("system_settings" as never)
      .select("key, value")
      .in("key", [
        "wallet_transfers_enabled",
        "normal_usdt_transfers_enabled",
        "normal_trx_transfers_enabled",
        "gasfree_usdt_transfers_enabled",
      ] as never),
  ]);
  for (const result of [
    parentsRes,
    childrenRes,
    profilesRes,
    rolesRes,
    telegramRes,
    passwordRes,
    secretRes,
    txRes,
    requestRes,
    nileAccessRes,
    transferControlRes,
    transferPolicySettingsRes,
  ]) {
    if (result.error && result.error.code !== "42P01") throw new Error(result.error.message);
  }
  const transferPolicySettings = Object.fromEntries(
    ((transferPolicySettingsRes.data ?? []) as Array<{ key?: string | null; value?: unknown }>).map(
      (row) => [row.key, row.value],
    ),
  ) as TransferPolicySettings;

  const parents = new Map(
    (
      (parentsRes.data ?? []) as Array<{
        id: string;
        address?: string | null;
        network?: ChainNetwork | null;
        is_archived?: boolean | null;
      }>
    ).map((row) => [row.id, row]),
  );
  const profiles = new Map(
    (
      (profilesRes.data ?? []) as Array<{
        id: string;
        email?: string | null;
        full_name?: string | null;
        username?: string | null;
      }>
    ).map((row) => [row.id, row]),
  );
  const rolesByUser = new Map<string, string[]>();
  for (const row of (rolesRes.data ?? []) as Array<{
    user_id?: string | null;
    role?: string | null;
  }>) {
    if (!row.user_id || !row.role) continue;
    rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), row.role]);
  }
  const telegramByUser = new Map(
    (
      (telegramRes.data ?? []) as Array<{
        user_id?: string | null;
        telegram_user_id?: number | null;
        username?: string | null;
        status?: string | null;
      }>
    )
      .filter((row) => row.user_id)
      .map((row) => [row.user_id as string, row]),
  );
  const passwords = new Map(
    (
      (passwordRes.data ?? []) as Array<{
        user_id?: string | null;
        locked_until?: string | null;
      }>
    ).map((row) => [row.user_id, row]),
  );
  const secretWalletIds = new Set(
    ((secretRes.data ?? []) as Array<{ wallet_id?: string | null }>).map((row) => row.wallet_id),
  );
  const nileAccess = new Set(
    ((nileAccessRes.data ?? []) as Array<{ user_id?: string | null; enabled?: boolean | null }>)
      .filter((row) => row.user_id && row.enabled)
      .map((row) => row.user_id),
  );
  const transferControls = new Map(
    (
      (transferControlRes.data ?? []) as Array<{
        user_id?: string | null;
        all_transfers_enabled?: boolean | null;
        normal_usdt_enabled?: boolean | null;
        normal_trx_enabled?: boolean | null;
        gasfree_usdt_enabled?: boolean | null;
        reason?: string | null;
        changed_at?: string | null;
      }>
    )
      .filter((row) => row.user_id)
      .map((row) => [row.user_id as string, row]),
  );
  const gasfreeChildByParent = new Map(
    (
      (childrenRes.data ?? []) as Array<{
        id: string;
        parent_wallet_id?: string | null;
        address?: string | null;
        network?: ChainNetwork | null;
      }>
    )
      .filter((row) => row.parent_wallet_id)
      .map((row) => [row.parent_wallet_id as string, row]),
  );
  const txByWallet = new Map<string, Array<Record<string, unknown>>>();
  for (const transaction of (txRes.data ?? []) as Array<Record<string, unknown>>) {
    const walletId = String(transaction["wallet_id"] ?? "");
    if (!walletId) continue;
    txByWallet.set(walletId, [...(txByWallet.get(walletId) ?? []), transaction]);
  }
  const lastRequestByWallet = new Map<string, Record<string, unknown>>();
  for (const request of (requestRes.data ?? []) as Array<Record<string, unknown>>) {
    const walletId = String(request["wallet_id"] ?? "");
    if (walletId && !lastRequestByWallet.has(walletId)) lastRequestByWallet.set(walletId, request);
  }

  const diagnostics = [];
  for (const wallet of rows) {
    const parent = wallet.parent_wallet_id ? parents.get(wallet.parent_wallet_id) : null;
    const child = gasfreeChildByParent.get(wallet.id);
    const profile = wallet.user_id ? profiles.get(wallet.user_id) : null;
    const telegram = wallet.user_id ? telegramByUser.get(wallet.user_id) : null;
    const password = wallet.user_id ? passwords.get(wallet.user_id) : null;
    const transferControl = wallet.user_id ? transferControls.get(wallet.user_id) : null;
    const transferPolicy = evaluateTransferPolicy({
      kind:
        wallet.wallet_role === "gasfree" || wallet.wallet_type === "gasfree"
          ? "gasfree_usdt"
          : "normal_usdt",
      settings: transferPolicySettings,
      userControl: transferControl as UserTransferControlLike | null,
    });
    const userRoles = wallet.user_id ? (rolesByUser.get(wallet.user_id) ?? []) : [];
    const walletTx = txByWallet.get(wallet.id) ?? [];
    const successfulUsdt = walletTx.filter(
      (row) => row["status"] === "completed" && row["currency"] === "USDT",
    );
    const successfulUsdt24h = successfulUsdt.filter(
      (row) => typeof row["created_at"] === "string" && Date.parse(row["created_at"]) >= since24h,
    );
    const lastTx = walletTx[0];
    let readiness: GasFreeTransferReadiness | null = null;
    let lastError = wallet.gasfree_capability_error ?? null;
    const gasfreeAddress = wallet.wallet_role === "gasfree" ? wallet.address : child?.address;
    const generalAddress = wallet.wallet_role === "gasfree" ? parent?.address : wallet.address;
    if (
      wallet.network &&
      gasfreeAddress &&
      generalAddress &&
      (wallet.wallet_role !== "gasfree" ||
        (parent?.network === wallet.network && parent.is_archived !== true))
    ) {
      readiness = await getGasFreeTransferReadiness({
        network: wallet.network,
        asset: GASFREE_SUPPORTED_ASSET,
        amount: 0.000001,
        generalAddress,
        allowTestnet: wallet.network === "trc20-nile",
      });
      if (readiness.status === "PROVIDER_ERROR") lastError = readiness.reason;
    }
    const lastRequest = lastRequestByWallet.get(wallet.id);
    diagnostics.push({
      walletId: wallet.id,
      userId: wallet.user_id ?? null,
      user:
        profile?.email ?? profile?.full_name ?? profile?.username ?? wallet.user_id ?? "Unknown",
      accountRole: userRoles.includes("vendor") ? "Vendor" : "Trader",
      telegramUsername: telegram?.username ? `@${telegram.username}` : null,
      telegramUserId: telegram?.telegram_user_id ?? null,
      walletName: wallet.name ?? "Wallet",
      walletType: wallet.wallet_type ?? "standard",
      walletRole: wallet.wallet_role ?? "general",
      custody: wallet.custody ?? null,
      backupStatus: wallet.backup_status ?? null,
      generatedImported:
        wallet.backup_status === "imported"
          ? "Imported"
          : wallet.custody === "non_custodial"
            ? "Generated"
            : "Not available",
      generalWalletAddress: generalAddress ?? null,
      gasFreeAddress: gasfreeAddress ?? null,
      network: wallet.network ?? null,
      usdtBalance: wallet.onchain_balance == null ? null : Number(wallet.onchain_balance),
      trxBalance: wallet.onchain_trx_balance == null ? null : Number(wallet.onchain_trx_balance),
      gasFreeState: readiness?.accountStatus ?? (gasfreeAddress ? "DISCOVERED" : "Not available"),
      activationStatus: readiness?.activationState ?? null,
      nonce: readiness?.accountNonce ?? null,
      provider: readiness?.provider ?? GASFREE_PROVIDER_NAME,
      providerStatus: readiness?.status ?? "NOT_CONFIGURED",
      lastProviderCheck: wallet.gasfree_capability_checked_at ?? wallet.onchain_checked_at ?? null,
      lastSuccessfulQuote: readiness?.quoteAvailable
        ? `${readiness.activateFee ?? 0} activation / ${readiness.transferFee ?? 0} transfer`
        : null,
      lastGasFreeTransaction: lastRequest
        ? {
            providerRequestId: lastRequest["provider_request_id"] ?? null,
            status: lastRequest["status"] ?? null,
            txid: lastRequest["txid"] ?? null,
            network: lastRequest["network"] ?? null,
            updatedAt: lastRequest["updated_at"] ?? null,
          }
        : null,
      lastError,
      signerAvailable:
        wallet.wallet_role === "general" ? secretWalletIds.has(wallet.id) : Boolean(parent?.id),
      transactionPasswordConfigured: Boolean(password),
      transactionPasswordLocked: Boolean(
        password?.locked_until && Date.parse(password.locked_until) > Date.now(),
      ),
      successfulTransferCount: successfulUsdt.length,
      successfulTransferCount24h: successfulUsdt24h.length,
      totalUsdtSent: successfulUsdt
        .filter((row) => row["direction"] === "out")
        .reduce((sum, row) => sum + Number(row["amount"] ?? 0), 0),
      totalUsdtReceived: successfulUsdt
        .filter((row) => row["direction"] === "in")
        .reduce((sum, row) => sum + Number(row["amount"] ?? 0), 0),
      totalUsdtVolume24h: successfulUsdt24h.reduce(
        (sum, row) => sum + Number(row["amount"] ?? 0),
        0,
      ),
      totalFees:
        walletTx.length > 0
          ? walletTx.reduce((sum, row) => sum + Number(row["fee"] ?? 0), 0)
          : null,
      gasfreeTransferCount: (requestRes.data ?? []).filter(
        (row) => (row as { wallet_id?: string }).wallet_id === wallet.id,
      ).length,
      createdAt: wallet.created_at ?? null,
      lastTransaction: lastTx
        ? {
            status: lastTx["status"] ?? null,
            txid: lastTx["txid"] ?? null,
            createdAt: lastTx["created_at"] ?? null,
          }
        : null,
      lastBlockchainSync: wallet.onchain_checked_at ?? null,
      nileTestWalletEnabled: wallet.user_id ? nileAccess.has(wallet.user_id) : false,
      transferEnabled: transferPolicy.allowed,
      transferDisabledReason: transferPolicy.reason,
      transferControlChangedAt: transferControl?.changed_at ?? null,
      adminAction: "User authorization required",
    });
  }
  const summary = {
    totalWallets: diagnostics.length,
    mainnetWallets: diagnostics.filter((row) => row.network === "trc20-mainnet").length,
    nileWallets: diagnostics.filter((row) => row.network === "trc20-nile").length,
    gasfreeWallets: diagnostics.filter((row) => row.walletType === "gasfree").length,
    activationRequired: diagnostics.filter((row) => row.activationStatus === "ACTIVATION_REQUIRED")
      .length,
    trackedUsdt: diagnostics.reduce(
      (sum, row) => sum + (typeof row.usdtBalance === "number" ? row.usdtBalance : 0),
      0,
    ),
    successfulTransfers24h: diagnostics.reduce(
      (sum, row) => sum + row.successfulTransferCount24h,
      0,
    ),
    transferVolume24h: diagnostics.reduce((sum, row) => sum + row.totalUsdtVolume24h, 0),
  };
  return { summary, rows: diagnostics };
}

async function loadGeneralSecret(input: {
  userId: string;
  walletId: string;
  transactionPassword: string;
  expectedAddress: string;
}) {
  const { decryptMnemonic } = await import("@/lib/wallet-security.server");
  const { deriveTronWalletFromMnemonic } = await import("@/lib/tron-personal-wallet");
  const { data: secret, error } = await supabaseAdmin
    .from("personal_wallet_secrets" as never)
    .select("encrypted_mnemonic, iv, auth_tag, kdf_salt, derivation_path")
    .eq("wallet_id", input.walletId as never)
    .eq("user_id", input.userId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = secret as {
    encrypted_mnemonic?: string | null;
    iv?: string | null;
    auth_tag?: string | null;
    kdf_salt?: string | null;
    derivation_path?: string | null;
  } | null;
  if (!row?.encrypted_mnemonic || !row.iv || !row.auth_tag || !row.kdf_salt) {
    throw new Error("Wallet secret is unavailable for GasFree signing.");
  }
  const mnemonic = decryptMnemonic({
    encryptedMnemonic: row.encrypted_mnemonic,
    iv: row.iv,
    authTag: row.auth_tag,
    kdfSalt: row.kdf_salt,
    password: input.transactionPassword,
  });
  const derived = deriveTronWalletFromMnemonic(mnemonic, row.derivation_path ?? undefined);
  if (derived.address !== input.expectedAddress) {
    throw new Error("Wallet secret does not match the linked General address.");
  }
  return derived.privateKeyHex;
}

export async function verifyGasFreeTransactionPassword(input: {
  userId: string;
  walletId: string;
  transactionPassword?: string | null;
}) {
  void input.walletId;
  if (!input.transactionPassword) {
    return { ok: false, state: "PASSWORD_NOT_PROVIDED" as const };
  }
  try {
    const { verifyTransactionPasswordOrThrow } = await import("@/lib/wallet-security.server");
    await verifyTransactionPasswordOrThrow(input.userId, input.transactionPassword);
    return { ok: true, state: "PASSWORD_VERIFIED" as const };
  } catch (error) {
    return { ok: false, state: classifyTransactionPasswordAuthorizationError(error) };
  }
}

function mapProviderState(state?: string | null) {
  if (state === "SUCCEED") return "CONFIRMED";
  if (state === "CONFIRMING") return "CONFIRMING";
  if (state === "INPROGRESS") return "BROADCAST";
  if (state === "FAILED") return "FAILED";
  return "SUBMITTED_TO_PROVIDER";
}

function parseFeeCollectionWalletSetting(value: unknown) {
  if (typeof value === "string") return value.replace(/^"|"$/g, "") || null;
  if (value == null) return null;
  return String(value).replace(/^"|"$/g, "") || null;
}

function gasfreeFeeCollectionWalletSettingKeys(network: ChainNetwork) {
  const networkSuffix = network === "trc20-nile" ? "trc20_nile" : "trc20_mainnet";
  const networkFallback =
    network === "trc20-nile"
      ? "fee_collection_wallet_id_trc20_nile"
      : "fee_collection_wallet_id_trc20_mainnet";
  return [
    `fee_collection_wallet_id_usdt_${networkSuffix}`,
    networkFallback,
    "fee_collection_wallet_id",
  ] as const;
}

async function readFeeCollectionWalletSetting(key: string) {
  const { data, error } = await supabaseAdmin
    .from("system_settings" as never)
    .select("value")
    .eq("key", key as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseFeeCollectionWalletSetting((data as { value?: unknown } | null)?.value);
}

async function walletHasPurposeAssignment(walletId: string, purpose: string) {
  const { data, error } = await supabaseAdmin
    .from("wallet_purpose_assignments" as never)
    .select("wallet_id")
    .eq("wallet_id", walletId as never)
    .eq("purpose", purpose as never)
    .eq("is_active", true as never)
    .maybeSingle();
  if (error && error.code !== "42P01") throw new Error(error.message);
  return Boolean(data);
}

async function gasFreeFeeDestinationForNetwork(network: ChainNetwork) {
  for (const settingKey of gasfreeFeeCollectionWalletSettingKeys(network)) {
    const walletId = await readFeeCollectionWalletSetting(settingKey);
    if (!walletId) continue;
    const { data: wallet, error } = await supabaseAdmin
      .from("wallets" as never)
      .select("id, network, is_active, purpose")
      .eq("id", walletId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = wallet as {
      id?: string | null;
      network?: ChainNetwork | null;
      is_active?: boolean | null;
      purpose?: string | null;
    } | null;
    if (
      row?.id &&
      row.network === network &&
      row.is_active === true &&
      (row.purpose === "FEE_COLLECTION" ||
        (await walletHasPurposeAssignment(row.id, "FEE_COLLECTION")))
    ) {
      return row.id;
    }
  }
  return null;
}

async function assertGasFreeProductTransferPolicy(userId: string) {
  await assertUserTransferPolicyAllowed({ userId, kind: "gasfree_usdt" });
}

async function recordGasFreePlatformFeeLiability(input: {
  requestId: string;
  userId: string;
  network: ChainNetwork;
  collectibleFee: number;
}) {
  if (!Number.isFinite(input.collectibleFee) || input.collectibleFee <= 0) return;
  const destinationWalletId = await gasFreeFeeDestinationForNetwork(input.network);
  const { error } = await supabaseAdmin.from("fee_liabilities" as never).insert({
    source: "gasfree_transfer_request",
    order_id: null,
    user_id: input.userId,
    vendor_id: null,
    fee_type: "gasfree_transfer_platform_fee",
    amount: input.collectibleFee,
    currency: "USDT",
    destination_wallet_id: destinationWalletId,
    status: destinationWalletId ? "PENDING_SWEEP" : "ACCRUED",
    idempotency_key: `gasfree-transfer:${input.requestId}:platform-fee`,
  } as never);
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function reconcileGasFreeTransferRequest(requestId: string) {
  const { data: request, error } = await supabaseAdmin
    .from("gasfree_transfer_requests" as never)
    .select("id, user_id, network, provider_request_id, platform_fee, provider_fee")
    .eq("id", requestId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = request as {
    id: string;
    user_id?: string | null;
    network?: ChainNetwork | null;
    provider_request_id?: string | null;
    platform_fee?: number | string | null;
    provider_fee?: number | string | null;
  } | null;
  if (!row?.provider_request_id || !row.network) throw new Error("GasFree trace ID is unavailable");
  const status = await getTransferStatus(row.network, row.provider_request_id);
  const txid = providerTxidForPersistence(status);
  if (status.state === "SUCCEED" && row.user_id) {
    await recordGasFreePlatformFeeLiability({
      requestId: row.id,
      userId: row.user_id,
      network: row.network,
      collectibleFee: Math.max(Number(row.platform_fee ?? 0) - Number(row.provider_fee ?? 0), 0),
    });
  }
  await supabaseAdmin
    .from("gasfree_transfer_requests" as never)
    .update({
      status: mapProviderState(status.state),
      txid,
      provider_nonce: status.nonce == null ? undefined : String(status.nonce),
      confirmed_at: status.state === "SUCCEED" ? new Date().toISOString() : undefined,
      metadata: {
        provider_status: status.state ?? null,
        txn_state: status.txnState ?? null,
        estimated_total_fee: status.estimatedTotalFee ?? null,
        estimated_total_cost: status.estimatedTotalCost ?? null,
      },
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id as never);
  return status;
}

export async function createGasFreeTransferRequest(input: {
  userId: string;
  walletId: string;
  recipient: string;
  amount: number;
  transactionPassword: string;
  idempotencyKey: string;
}) {
  const { verifyTransactionPasswordOrThrow } = await import("@/lib/wallet-security.server");
  const { hasNileTestWalletAccess } = await import("@/lib/wallets.server");

  if (!isTronAddress(input.recipient)) throw new Error("Enter a valid TRON address");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const { data: wallet, error } = await supabaseAdmin
    .from("user_wallets" as never)
    .select(
      "id, user_id, address, network, wallet_type, wallet_role, parent_wallet_id, is_archived, onchain_balance",
    )
    .eq("id", input.walletId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = wallet as {
    id: string;
    user_id?: string | null;
    address?: string | null;
    network?: ChainNetwork | null;
    wallet_type?: string | null;
    wallet_role?: string | null;
    parent_wallet_id?: string | null;
    is_archived?: boolean | null;
    onchain_balance?: number | string | null;
  } | null;
  if (!row || row.user_id !== input.userId || row.is_archived) throw new Error("Wallet not found");
  if (row.wallet_role !== "gasfree" || row.wallet_type !== "gasfree") {
    throw new Error("Select the GasFree wallet before using GasFree Send.");
  }
  await assertGasFreeProductTransferPolicy(input.userId);

  const network = row.network as ChainNetwork;
  const nileTestAuthorized =
    network === "trc20-nile" ? await hasNileTestWalletAccess(input.userId) : false;
  const readiness = await getGasFreeTransferReadiness({
    network,
    asset: GASFREE_SUPPORTED_ASSET,
    amount: input.amount,
    allowTestnet: nileTestAuthorized,
  });
  if (network === "trc20-nile" && !nileTestAuthorized) {
    return {
      ok: false,
      status: "DISABLED",
      message: "Nile GasFree testing is not enabled for this account.",
      readiness,
    };
  }
  if (!isGasFreeTransferExecutable(readiness.status)) {
    return { ok: false, status: readiness.status, message: readiness.reason, readiness };
  }

  await verifyTransactionPasswordOrThrow(input.userId, input.transactionPassword);

  const { data: generalWallet, error: generalError } = row.parent_wallet_id
    ? await supabaseAdmin
        .from("user_wallets" as never)
        .select("id, user_id, address, is_archived")
        .eq("id", row.parent_wallet_id as never)
        .maybeSingle()
    : { data: null, error: null };
  if (generalError) throw new Error(generalError.message);
  const general = generalWallet as {
    id?: string | null;
    user_id?: string | null;
    address?: string | null;
    is_archived?: boolean | null;
  } | null;
  if (!general?.id || !general.address || general.user_id !== input.userId || general.is_archived) {
    throw new Error("Linked General wallet is unavailable for GasFree authorization.");
  }
  if (deriveGasFreeAddressFromGeneralAddress(general.address, network) !== row.address) {
    throw new Error("GasFree wallet does not match the linked General wallet.");
  }

  const quote = await getTransferQuote({
    network,
    generalAddress: general.address,
    amount: input.amount,
  });
  if (quote.allowSubmit !== true) throw new Error("GasFree account has a pending transfer.");
  const providerFee = quote.maxFee / 10 ** quote.decimals;
  const platformFee = providerFee;
  const collectiblePlatformFee = 0;
  const totalDebit = input.amount + platformFee;
  if (Number(row.onchain_balance ?? 0) < totalDebit) {
    throw new Error("Insufficient GasFree USDT balance");
  }

  const deadline = new Date(quote.deadlineSeconds * 1000);
  validateGasFreeReplay({
    idempotencyKey: input.idempotencyKey,
    deadlineMs: deadline.getTime(),
    nowMs: Date.now(),
  });

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("gasfree_transfer_requests" as never)
    .select("*")
    .eq("user_id", input.userId as never)
    .eq("idempotency_key", input.idempotencyKey as never)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return { ok: true, request: existing, idempotent: true, readiness };

  const requestId = randomUUID();
  const prepared = prepareTransfer({
    network,
    token: quote.token.tokenAddress,
    serviceProvider: quote.provider.address,
    generalAddress: general.address,
    receiver: input.recipient.trim(),
    value: quote.value,
    maxFee: String(quote.maxFee),
    deadline: String(quote.deadlineSeconds),
    nonce: quote.nonce,
  });

  if (prepared.message.user !== general.address) {
    throw new Error("GasFree PermitTransfer user must be the General wallet address.");
  }
  const privateKeyHex = await loadGeneralSecret({
    userId: input.userId,
    walletId: general.id,
    transactionPassword: input.transactionPassword,
    expectedAddress: general.address,
  });
  const sig = signGasFreePermitTypedData({
    domain: prepared.typedData.domain,
    types: prepared.typedData.types,
    message: prepared.typedData.message,
    privateKeyHex,
  });

  const { data: request, error: insertError } = await supabaseAdmin
    .from("gasfree_transfer_requests" as never)
    .insert({
      id: requestId,
      user_id: input.userId,
      wallet_id: row.id,
      general_wallet_id: general.id,
      general_address: general.address,
      gasfree_address: row.address,
      network,
      asset: GASFREE_SUPPORTED_ASSET,
      amount: input.amount,
      recipient: input.recipient.trim(),
      provider: quote.provider.name || GASFREE_PROVIDER_NAME,
      provider_nonce: quote.nonce,
      idempotency_key: input.idempotencyKey,
      deadline_at: deadline.toISOString(),
      status: "AUTHORIZED",
      platform_fee: platformFee,
      provider_fee: providerFee,
      total_debit: totalDebit,
      metadata: {
        protocol: "GasFree TIP-712 PermitTransfer",
        chain_id: gasfreeChainIdForNetwork(network),
        provider_address: quote.provider.address,
        token_address: quote.token.tokenAddress,
        customer_fee_usdt: platformFee,
        wtron_revenue_usdt: collectiblePlatformFee,
        permit_hash: prepared.ledgerHash.permitTransferMessageHash,
      },
    } as never)
    .select("*")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      const { data: afterConflict } = await supabaseAdmin
        .from("gasfree_transfer_requests" as never)
        .select("*")
        .eq("user_id", input.userId as never)
        .eq("idempotency_key", input.idempotencyKey as never)
        .maybeSingle();
      return { ok: true, request: afterConflict, idempotent: true, readiness };
    }
    throw new Error(insertError.message);
  }

  try {
    const submitted = await submitPermitTransfer(network, {
      requestId,
      ...prepared.message,
      sig,
    });
    if (submitted.state === "SUCCEED") {
      await recordGasFreePlatformFeeLiability({
        requestId,
        userId: input.userId,
        network,
        collectibleFee: collectiblePlatformFee,
      });
    }
    await supabaseAdmin
      .from("gasfree_transfer_requests" as never)
      .update({
        provider_request_id: submitted.id,
        txid: providerTxidForPersistence(submitted),
        status: mapProviderState(submitted.state),
        submitted_at: new Date().toISOString(),
        failure_code: null,
        failure_reason: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", requestId as never);
    return {
      ok: true,
      request: { ...(request as object), provider_request_id: submitted.id },
      idempotent: false,
      readiness,
    };
  } catch (error) {
    await supabaseAdmin
      .from("gasfree_transfer_requests" as never)
      .update({
        status: "FAILED",
        failure_code: "PROVIDER_SUBMIT_FAILED",
        failure_reason: safeErrorMessage(error),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", requestId as never);
    throw new Error(safeErrorMessage(error));
  }
}
