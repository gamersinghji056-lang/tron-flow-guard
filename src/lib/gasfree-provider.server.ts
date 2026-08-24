import { createHmac, randomUUID } from "node:crypto";
import * as GasFreeSdk from "@gasfree/gasfree-sdk";
import { TronWeb } from "tronweb";
import type { ChainNetwork } from "@/lib/chain";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isTronAddress } from "@/lib/chain";
import {
  deriveGasFreeAddressFromGeneralAddress,
  gasfreeChainIdForNetwork,
} from "@/lib/gasfree-address";
import {
  GASFREE_ENV_NAMES,
  GASFREE_PROVIDER_NAME,
  GASFREE_SUPPORTED_ASSET,
  gasFreeServiceReadiness,
  isGasFreeTransferExecutable,
  validateGasFreeReplay,
  type GasFreeServiceStatus,
} from "@/lib/gasfree-transfer-policy";
import { safeErrorMessage, writeServiceHeartbeat } from "@/lib/system-health.server";

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
  defaultDeadlineSeconds?: number | null;
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

function networkBaseUrl(network: ChainNetwork, override?: string | null) {
  if (override) return override.replace(/\/+$/, "");
  return network === "trc20-mainnet"
    ? "https://open.gasfree.io/tron"
    : "https://open-test.gasfree.io/nile";
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
  const providerBaseUrl = networkBaseUrl(network, process.env["GASFREE_PROVIDER_BASE_URL"]);
  const serviceProviderAddress = process.env["GASFREE_SERVICE_PROVIDER_ADDRESS"]?.trim() || null;
  const apiKey = process.env["GASFREE_API_KEY"]?.trim() || null;
  const apiSecret = process.env["GASFREE_API_SECRET"]?.trim() || null;
  return {
    providerBaseUrl,
    serviceProviderAddress,
    apiKey,
    apiSecret,
    apiKeyConfigured: Boolean(apiKey),
    apiSecretConfigured: Boolean(apiSecret),
    timeoutMs: parseNumber(process.env["GASFREE_REQUEST_TIMEOUT_MS"] ?? null, 8_000),
  };
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
  return (data?.tokens ?? []).filter((row) => row.supported !== false).map(validateToken);
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
}): Promise<GasFreeTransferReadiness> {
  const settings = await readSettings();
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
  });
  const base = {
    provider: settings.provider || GASFREE_PROVIDER_NAME,
    status: staticReadiness.status,
    reason: staticReadiness.reason,
    network: input.network,
    asset: (input.asset ?? GASFREE_SUPPORTED_ASSET).toUpperCase(),
    configured: staticReadiness.status !== "NOT_CONFIGURED",
    envNames: GASFREE_ENV_NAMES,
    serviceProviderConfigured: Boolean(providerConfig.serviceProviderAddress),
    apiKeyConfigured: providerConfig.apiKeyConfigured,
    apiSecretConfigured: providerConfig.apiSecretConfigured,
    apiCredentialsRequired: true,
    chainId: gasfreeChainIdForNetwork(input.network),
  };
  if (!isGasFreeTransferExecutable(staticReadiness.status)) return base;
  try {
    const [provider, tokens] = await Promise.all([
      getProviderConfig(input.network),
      getSupportedTokens(input.network),
    ]);
    const token = tokens.find(
      (row) => String(row.symbol).toUpperCase() === GASFREE_SUPPORTED_ASSET,
    );
    if (!token) {
      return { ...base, status: "TEMPORARILY_UNAVAILABLE", reason: "GasFree USDT is unsupported." };
    }
    return {
      ...base,
      provider: provider.name || GASFREE_PROVIDER_NAME,
      providerAddress: provider.address,
      status: "AVAILABLE",
      reason: "GasFree provider is available for TRON USDT.",
      tokenAddress: token.tokenAddress,
      transferFee: parseNumber(token.transferFee, 0),
      activateFee: parseNumber(token.activateFee, 0),
      defaultDeadlineSeconds: parseNumber(provider.config?.defaultDeadlineDuration, 180),
    };
  } catch (error) {
    return {
      ...base,
      status: "PROVIDER_ERROR",
      reason: safeErrorMessage(error),
    };
  }
}

export async function checkGasFreeProviderHealth(network: ChainNetwork = "trc20-mainnet") {
  const readiness = await getGasFreeTransferReadiness({ network, asset: GASFREE_SUPPORTED_ASSET });
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
      metadata: { network, error: message, env_names: GASFREE_ENV_NAMES },
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

function mapProviderState(state?: string | null) {
  if (state === "SUCCEED") return "CONFIRMED";
  if (state === "CONFIRMING") return "CONFIRMING";
  if (state === "INPROGRESS") return "BROADCAST";
  if (state === "FAILED") return "FAILED";
  return "SUBMITTED_TO_PROVIDER";
}

export async function reconcileGasFreeTransferRequest(requestId: string) {
  const { data: request, error } = await supabaseAdmin
    .from("gasfree_transfer_requests" as never)
    .select("id, network, provider_request_id")
    .eq("id", requestId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = request as {
    id: string;
    network?: ChainNetwork | null;
    provider_request_id?: string | null;
  } | null;
  if (!row?.provider_request_id || !row.network) throw new Error("GasFree trace ID is unavailable");
  const status = await getTransferStatus(row.network, row.provider_request_id);
  const txid = status.txnHash ?? null;
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
  const { readTransferFee } = await import("@/lib/wallets.server");

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

  const network = row.network as ChainNetwork;
  const readiness = await getGasFreeTransferReadiness({
    network,
    asset: GASFREE_SUPPORTED_ASSET,
    amount: input.amount,
  });
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
  if (!quote.allowSubmit) throw new Error("GasFree account has a pending transfer.");
  const platformFee = await readTransferFee();
  const totalDebit = input.amount + platformFee + quote.maxFee / 10 ** quote.decimals;
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
  const tronTypedDataSigner = TronWeb as unknown as {
    Trx: {
      _signTypedData: (
        domain: unknown,
        types: unknown,
        message: unknown,
        privateKey: string,
      ) => string;
    };
  };
  const sig = tronTypedDataSigner.Trx._signTypedData(
    prepared.typedData.domain,
    prepared.typedData.types,
    prepared.typedData.message,
    privateKeyHex,
  ).replace(/^0x/, "");

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
      provider_fee: quote.maxFee / 10 ** quote.decimals,
      total_debit: totalDebit,
      metadata: {
        protocol: "GasFree TIP-712 PermitTransfer",
        chain_id: gasfreeChainIdForNetwork(network),
        provider_address: quote.provider.address,
        token_address: quote.token.tokenAddress,
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
    await supabaseAdmin
      .from("gasfree_transfer_requests" as never)
      .update({
        provider_request_id: submitted.id,
        txid: submitted.txnHash ?? null,
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
