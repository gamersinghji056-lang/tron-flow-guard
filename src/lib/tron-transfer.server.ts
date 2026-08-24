/**
 * Outgoing TRC20 USDT transfers (server-only).
 *
 * Builds, signs and broadcasts a real `transfer(address,uint256)` call through
 * TronGrid using the key derived by `wallet-keys.server`. Broadcasting is gated
 * behind the `onchain_broadcast_enabled` system setting so the demo can run
 * entirely on the internal ledger until the operator funds the hot wallets.
 */
import { networkConfig, parseTokenBalanceHex, type ChainNetwork } from "@/lib/chain";
import { tronAddressToHex } from "@/lib/tron-address";
import { deriveWallet, signTxHash } from "@/lib/wallet-keys.server";

const READ_TIMEOUT_MS = 30_000;

function pad32(hex: string): string {
  return hex.replace(/^0x/, "").padStart(64, "0");
}

export interface BroadcastResult {
  ok: boolean;
  txid?: string;
  error?: string;
}

function headers() {
  const out: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env["TRONGRID_API_KEY"];
  if (apiKey) out["TRON-PRO-API-KEY"] = apiKey;
  return out;
}

export async function broadcastSignedTrxTransfer(params: {
  network: ChainNetwork;
  privateKeyHex: string;
  ownerAddress: string;
  toAddress: string;
  amount: number;
}): Promise<BroadcastResult> {
  const config = networkConfig(params.network);
  const sun = Math.round(params.amount * 1_000_000);
  if (!Number.isSafeInteger(sun) || sun <= 0) return { ok: false, error: "Invalid TRX amount" };

  try {
    const buildRes = await fetch(`${config.apiBase}/wallet/createtransaction`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        owner_address: tronAddressToHex(params.ownerAddress),
        to_address: tronAddressToHex(params.toAddress),
        amount: sun,
      }),
    });
    const built = (await buildRes.json()) as { txID?: string; Error?: string };
    if (!built.txID) return { ok: false, error: built.Error ?? "Failed to build TRX transfer" };
    const signature = signTxHash(built.txID, params.privateKeyHex);
    return broadcastSignedTransaction(config.apiBase, { ...built, signature: [signature] });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Broadcast failed" };
  }
}

export async function broadcastSignedTrc20Transfer(params: {
  network: ChainNetwork;
  privateKeyHex: string;
  ownerAddress: string;
  toAddress: string;
  amount: number;
}): Promise<BroadcastResult> {
  const config = networkConfig(params.network);
  const units = BigInt(Math.round(params.amount * 10 ** config.tokenDecimals));
  if (units <= 0n) return { ok: false, error: "Invalid USDT amount" };
  const parameter = pad32(tronAddressToHex(params.toAddress).slice(2)) + pad32(units.toString(16));

  try {
    const buildRes = await fetch(`${config.apiBase}/wallet/triggersmartcontract`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        owner_address: tronAddressToHex(params.ownerAddress),
        contract_address: tronAddressToHex(config.usdtContract),
        function_selector: "transfer(address,uint256)",
        parameter,
        fee_limit: 40_000_000,
        call_value: 0,
      }),
    });
    const built = (await buildRes.json()) as {
      result?: { result?: boolean; message?: string };
      transaction?: { txID: string };
    };
    if (!built.transaction?.txID) {
      const message = built.result?.message
        ? Buffer.from(built.result.message, "hex").toString("utf8")
        : "Failed to build transaction";
      return { ok: false, error: message };
    }
    const signature = signTxHash(built.transaction.txID, params.privateKeyHex);
    return broadcastSignedTransaction(config.apiBase, {
      ...built.transaction,
      signature: [signature],
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Broadcast failed" };
  }
}

async function broadcastSignedTransaction(
  apiBase: string,
  transaction: Record<string, unknown> & { txID?: string },
): Promise<BroadcastResult> {
  const broadcastRes = await fetch(`${apiBase}/wallet/broadcasttransaction`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(transaction),
  });
  const broadcast = (await broadcastRes.json()) as {
    result?: boolean;
    code?: string;
    message?: string;
    txid?: string;
  };
  if (!broadcast.result) {
    const message = broadcast.message
      ? Buffer.from(broadcast.message, "hex").toString("utf8")
      : (broadcast.code ?? "Broadcast rejected");
    return { ok: false, error: message };
  }
  const txid = broadcast.txid ?? transaction.txID;
  return txid ? { ok: true, txid } : { ok: false, error: "Broadcast accepted without TXID" };
}

export async function broadcastTrc20Transfer(params: {
  network: ChainNetwork;
  ownerUserId: string;
  derivationIndex: number;
  ownerAddress: string;
  toAddress: string;
  amount: number;
}): Promise<BroadcastResult> {
  const config = networkConfig(params.network);
  const key = deriveWallet(params.ownerUserId, params.derivationIndex);
  if (key.address !== params.ownerAddress) {
    return { ok: false, error: "Derived key does not match the wallet address" };
  }

  const units = BigInt(Math.round(params.amount * 10 ** config.tokenDecimals));
  const parameter = pad32(tronAddressToHex(params.toAddress).slice(2)) + pad32(units.toString(16));

  try {
    const buildRes = await fetch(`${config.apiBase}/wallet/triggersmartcontract`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        owner_address: key.hexAddress,
        contract_address: tronAddressToHex(config.usdtContract),
        function_selector: "transfer(address,uint256)",
        parameter,
        fee_limit: 40_000_000,
        call_value: 0,
      }),
    });
    const built = (await buildRes.json()) as {
      result?: { result?: boolean; message?: string };
      transaction?: { txID: string };
    };
    if (!built.transaction?.txID) {
      const message = built.result?.message
        ? Buffer.from(built.result.message, "hex").toString("utf8")
        : "Failed to build transaction";
      return { ok: false, error: message };
    }

    const signature = signTxHash(built.transaction.txID, key.privateKeyHex);
    return broadcastSignedTransaction(config.apiBase, {
      ...built.transaction,
      signature: [signature],
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Broadcast failed" };
  }
}

/** Reads the on-chain TRC20 balance of an address. */
export async function readTrc20Balance(
  network: ChainNetwork,
  address: string,
): Promise<number | null> {
  const config = networkConfig(network);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
    try {
      const res = await fetch(`${config.apiBase}/wallet/triggerconstantcontract`, {
        method: "POST",
        headers: headers(),
        signal: controller.signal,
        body: JSON.stringify({
          owner_address: tronAddressToHex(address),
          contract_address: tronAddressToHex(config.usdtContract),
          function_selector: "balanceOf(address)",
          parameter: pad32(tronAddressToHex(address).slice(2)),
        }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        result?: { result?: boolean };
        constant_result?: string[];
      };
      if (body.result?.result === false) return null;
      return parseTokenBalanceHex(body.constant_result?.[0], config.tokenDecimals);
    } catch {
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 350));
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
