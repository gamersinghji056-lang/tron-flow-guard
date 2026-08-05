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
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ChainError";
  }
}

async function chainFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
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
  /** Human amount, already scaled by token decimals. */
  amount: number;
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

/** Incoming TRC20 USDT transfers for a wallet, newest first. */
export async function getIncomingUsdtTransfers(
  network: ChainNetwork,
  address: string,
  limit = 50,
): Promise<Trc20Transfer[]> {
  const config = networkConfig(network);
  const url =
    `${config.apiBase}/v1/accounts/${address}/transactions/trc20` +
    `?only_to=true&limit=${limit}&order_by=block_timestamp,desc` +
    `&contract_address=${config.usdtContract}`;

  const payload = await chainFetch<{ data?: Trc20ApiRow[]; success?: boolean }>(url);
  const rows = Array.isArray(payload.data) ? payload.data : [];

  return rows
    .filter((row) => row.transaction_id && row.to && row.value && row.type !== "Approval")
    .map((row) => {
      const decimals = row.token_info?.decimals ?? config.tokenDecimals;
      const rawValue = row.value ?? "0";
      return {
        txid: row.transaction_id as string,
        from: row.from ?? "",
        to: row.to as string,
        amount: Number(rawValue) / 10 ** decimals,
        rawValue,
        tokenContract: row.token_info?.address ?? "",
        tokenSymbol: row.token_info?.symbol ?? config.tokenSymbol,
        blockTimestamp: row.block_timestamp ?? Date.now(),
        raw: row,
      } satisfies Trc20Transfer;
    });
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
