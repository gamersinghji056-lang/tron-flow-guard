/**
 * Outgoing TRC20 USDT transfers (server-only).
 *
 * Builds, signs and broadcasts a real `transfer(address,uint256)` call through
 * TronGrid using the key derived by `wallet-keys.server`. Broadcasting is gated
 * behind the `onchain_broadcast_enabled` system setting so the demo can run
 * entirely on the internal ledger until the operator funds the hot wallets.
 */
import { networkConfig, parseTokenBalanceHex, type ChainNetwork } from "@/lib/chain";
import { deriveWallet, signTxHash } from "@/lib/wallet-keys.server";

function base58Decode(value: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = 0n;
  for (const char of value) {
    const idx = ALPHABET.indexOf(char);
    if (idx < 0) throw new Error(`Invalid TRON address character: ${char}`);
    num = num * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num % 256n));
    num /= 256n;
  }
  for (const char of value) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes.slice(0, bytes.length - 4)); // strip checksum
}

function toHexAddress(base58: string): string {
  return Array.from(base58Decode(base58), (b) => b.toString(16).padStart(2, "0")).join("");
}

function pad32(hex: string): string {
  return hex.replace(/^0x/, "").padStart(64, "0");
}

export interface BroadcastResult {
  ok: boolean;
  txid?: string;
  error?: string;
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
  const parameter = pad32(toHexAddress(params.toAddress).slice(2)) + pad32(units.toString(16));

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env["TRONGRID_API_KEY"];
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

  try {
    const buildRes = await fetch(`${config.apiBase}/wallet/triggersmartcontract`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        owner_address: key.hexAddress,
        contract_address: toHexAddress(config.usdtContract),
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
    const broadcastRes = await fetch(`${config.apiBase}/wallet/broadcasttransaction`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...built.transaction, signature: [signature] }),
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
    return { ok: true, txid: broadcast.txid ?? built.transaction.txID };
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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env["TRONGRID_API_KEY"];
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

  try {
    const res = await fetch(`${config.apiBase}/wallet/triggerconstantcontract`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        owner_address: toHexAddress(address),
        contract_address: toHexAddress(config.usdtContract),
        function_selector: "balanceOf(address)",
        parameter: pad32(toHexAddress(address).slice(2)),
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
    return null;
  }
}
