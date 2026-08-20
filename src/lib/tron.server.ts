/**
 * TronGrid REST client (server-only).
 *
 * Isolated from the frontend: only the listener service and server functions
 * talk to the chain. Every call is defensive — the chain node can be slow,
 * rate-limited or temporarily unavailable.
 */
import { networkConfig, type ChainNetwork } from "./chain";

const REQUEST_TIMEOUT_MS = 12_000;

export class ChainError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ChainError";
    if (cause !== undefined) this.cause = cause;
  }
}

async function chainFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const apiKey = process.env["TRONGRID_API_KEY"];
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (apiKey) headers.set("TRON-PRO-API-KEY", apiKey);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers,
    });
    if (!response.ok) {
      throw new ChainError(`Blockchain node responded with ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ChainError) throw error;
    throw new ChainError("Blockchain node unreachable or timed out", error);
  } finally {
    clearTimeout(timer);
  }
}

/** Retry wrapper with linear backoff — the listener must survive flaky nodes. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 400));
    }
  }
  throw lastError instanceof Error ? lastError : new ChainError("Blockchain call failed");
}

export interface Trc20Transfer {
  txid: string;
  from: string;
  to: string;
  /** Human amount, already scaled by token decimals. Display only. */
  amount: number;
  /** Exact on-chain base units. All money comparisons MUST use this. */
  baseUnits: bigint;
  decimals: number;
  rawValue: string;
  tokenContract: string;
  tokenSymbol: string;
  blockTimestamp: number;
  raw: unknown;
}

interface Trc20ApiRow {
  transaction_id?: string;
  from?: string;
  to?: string;
  value?: string;
  type?: string;
  block_timestamp?: number;
  token_info?: { address?: string; decimals?: number; symbol?: string };
}

interface TrxApiRow {
  txID?: string;
  block_timestamp?: number;
  raw_data?: {
    contract?: Array<{
      type?: string;
      parameter?: {
        value?: {
          amount?: number;
          owner_address?: string;
          to_address?: string;
        };
      };
    }>;
  };
}

export interface TrxTransfer {
  txid: string;
  from: string;
  to: string;
  amount: number;
  sun: number;
  blockTimestamp: number;
  raw: unknown;
}

/** Latest block height on the given network. */
export async function getLatestBlock(network: ChainNetwork): Promise<number> {
  const { apiBase } = networkConfig(network);
  const data = await chainFetch<{ block_header?: { raw_data?: { number?: number } } }>(
    `${apiBase}/wallet/getnowblock`,
    { method: "POST", body: "{}" },
  );
  const height = data.block_header?.raw_data?.number;
  if (!height) throw new ChainError("Could not read the latest block height");
  return height;
}

/**
 * Incoming TRC20 USDT transfers for a wallet, newest first.
 *
 * Queries the address' own transfer history rather than a block stream, which
 * is what makes missed-transaction recovery possible: a transfer that arrived
 * while the listener was down is still returned on the next poll. Pass
 * `minTimestamp` to widen the sweep during reconciliation.
 */
export async function getIncomingUsdtTransfers(
  network: ChainNetwork,
  address: string,
  options: { limit?: number; minTimestamp?: number } = {},
): Promise<Trc20Transfer[]> {
  const config = networkConfig(network);
  const limit = Math.min(options.limit ?? 50, 200);
  let url =
    `${config.apiBase}/v1/accounts/${address}/transactions/trc20` +
    `?only_to=true&limit=${limit}&order_by=block_timestamp,desc` +
    `&contract_address=${config.usdtContract}`;
  if (options.minTimestamp) url += `&min_timestamp=${options.minTimestamp}`;

  const payload = await chainFetch<{ data?: Trc20ApiRow[]; success?: boolean }>(url);
  const rows = Array.isArray(payload.data) ? payload.data : [];

  return rows
    .filter((row) => row.transaction_id && row.to && row.value && row.type !== "Approval")
    .map((row) => {
      const decimals = row.token_info?.decimals ?? config.tokenDecimals;
      const rawValue = row.value ?? "0";
      let baseUnits = 0n;
      try {
        baseUnits = BigInt(rawValue);
      } catch {
        baseUnits = 0n;
      }
      return {
        txid: row.transaction_id as string,
        from: row.from ?? "",
        to: row.to as string,
        amount: Number(baseUnits) / 10 ** decimals,
        baseUnits,
        decimals,
        rawValue,
        tokenContract: row.token_info?.address ?? "",
        tokenSymbol: row.token_info?.symbol ?? config.tokenSymbol,
        blockTimestamp: row.block_timestamp ?? Date.now(),
        raw: row,
      } satisfies Trc20Transfer;
    });
}

/** Outgoing TRC20 USDT transfers for a personal wallet, newest first. */
export async function getOutgoingUsdtTransfers(
  network: ChainNetwork,
  address: string,
  options: { limit?: number; minTimestamp?: number } = {},
): Promise<Trc20Transfer[]> {
  const config = networkConfig(network);
  const limit = Math.min(options.limit ?? 50, 200);
  let url =
    `${config.apiBase}/v1/accounts/${address}/transactions/trc20` +
    `?only_from=true&limit=${limit}&order_by=block_timestamp,desc` +
    `&contract_address=${config.usdtContract}`;
  if (options.minTimestamp) url += `&min_timestamp=${options.minTimestamp}`;

  const payload = await chainFetch<{ data?: Trc20ApiRow[]; success?: boolean }>(url);
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows
    .filter((row) => row.transaction_id && row.from && row.value && row.type !== "Approval")
    .map((row) => {
      const decimals = row.token_info?.decimals ?? config.tokenDecimals;
      const rawValue = row.value ?? "0";
      let baseUnits = 0n;
      try {
        baseUnits = BigInt(rawValue);
      } catch {
        baseUnits = 0n;
      }
      return {
        txid: row.transaction_id as string,
        from: row.from as string,
        to: row.to ?? "",
        amount: Number(baseUnits) / 10 ** decimals,
        baseUnits,
        decimals,
        rawValue,
        tokenContract: row.token_info?.address ?? "",
        tokenSymbol: row.token_info?.symbol ?? config.tokenSymbol,
        blockTimestamp: row.block_timestamp ?? Date.now(),
        raw: row,
      } satisfies Trc20Transfer;
    });
}

/** Native TRX balance in TRX, read from the chain account state. */
export async function getNativeTrxBalance(
  network: ChainNetwork,
  address: string,
): Promise<number | null> {
  const { apiBase } = networkConfig(network);
  try {
    const data = await chainFetch<{ data?: Array<{ balance?: number }> }>(
      `${apiBase}/v1/accounts/${address}`,
    );
    const balance = data.data?.[0]?.balance;
    if (!Number.isFinite(balance)) return 0;
    return Number(balance) / 1_000_000;
  } catch {
    return null;
  }
}

function normalizeTrxTransfer(row: TrxApiRow): TrxTransfer | null {
  const contract = row.raw_data?.contract?.find((item) => item.type === "TransferContract");
  const value = contract?.parameter?.value;
  if (!row.txID || !value || !Number.isFinite(value.amount)) return null;
  return {
    txid: row.txID,
    from: value.owner_address ?? "",
    to: value.to_address ?? "",
    amount: Number(value.amount) / 1_000_000,
    sun: Number(value.amount),
    blockTimestamp: row.block_timestamp ?? Date.now(),
    raw: row,
  };
}

export async function getNativeTrxTransfers(
  network: ChainNetwork,
  address: string,
  direction: "in" | "out",
  options: { limit?: number; minTimestamp?: number } = {},
): Promise<TrxTransfer[]> {
  const config = networkConfig(network);
  const limit = Math.min(options.limit ?? 50, 200);
  const filter = direction === "in" ? "only_to=true" : "only_from=true";
  let url =
    `${config.apiBase}/v1/accounts/${address}/transactions?${filter}` +
    `&only_confirmed=true&limit=${limit}&order_by=block_timestamp,desc`;
  if (options.minTimestamp) url += `&min_timestamp=${options.minTimestamp}`;

  const payload = await chainFetch<{ data?: TrxApiRow[] }>(url);
  return (payload.data ?? [])
    .map(normalizeTrxTransfer)
    .filter((transfer): transfer is TrxTransfer => Boolean(transfer));
}

/** True when the address exists as an activated account on this chain. */
export async function isAddressActivated(network: ChainNetwork, address: string): Promise<boolean> {
  const { apiBase } = networkConfig(network);
  try {
    const data = await chainFetch<{ data?: unknown[] }>(`${apiBase}/v1/accounts/${address}`);
    return Array.isArray(data.data) && data.data.length > 0;
  } catch {
    return false;
  }
}

export interface OnChainTransactionInfo {
  blockNumber: number | null;
  success: boolean;
  status: string;
}

/** Receipt-level status and block height for a specific transaction id. */
export async function getTransactionInfo(
  network: ChainNetwork,
  txid: string,
): Promise<OnChainTransactionInfo> {
  const { apiBase } = networkConfig(network);
  const data = await chainFetch<{
    blockNumber?: number;
    receipt?: { result?: string };
    result?: string;
  }>(`${apiBase}/wallet/gettransactioninfobyid`, {
    method: "POST",
    body: JSON.stringify({ value: txid }),
  });

  const receiptResult = data.receipt?.result;
  // TRC20 transfers report SUCCESS in the receipt; a missing result on a mined
  // block means the transfer did not revert either.
  const status = receiptResult ?? (data.result === "FAILED" ? "FAILED" : "SUCCESS");
  return {
    blockNumber: data.blockNumber ?? null,
    success: status === "SUCCESS",
    status,
  };
}
