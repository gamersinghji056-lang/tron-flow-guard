import type { ChainNetwork } from "./chain.ts";
import { isValidTronBase58Address } from "./tron-address.ts";
import { createHmac, timingSafeEqual } from "node:crypto";

export type SendAsset = "USDT" | "TRX";
export type CustodyCapability = "WATCH_ONLY" | "SIGNING_ENABLED";

export function assertValidTronAddress(address: string) {
  if (!address.trim()) throw new Error("Recipient address is required");
  if (!isValidTronBase58Address(address)) throw new Error("Enter a valid TRON address");
}

export function assertSendAmount(asset: SendAsset, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
  const decimals = asset === "USDT" ? 6 : 6;
  const units = amount * 10 ** decimals;
  if (!Number.isInteger(Math.round(units)) || Math.abs(units - Math.round(units)) > 1e-6) {
    throw new Error(`${asset} supports up to ${decimals} decimal places`);
  }
}

export function assertSigningSwitches(input: {
  dbEnabled: boolean;
  envEnabled?: string | undefined;
  network: ChainNetwork;
  mainnetEnabled?: string | undefined;
}) {
  if (!input.dbEnabled || input.envEnabled !== "true") {
    throw new Error("ON_CHAIN_SEND_DISABLED");
  }
  if (input.network === "trc20-mainnet" && input.mainnetEnabled !== "true") {
    throw new Error("MAINNET_SIGNING_DISABLED");
  }
}

export function assertSufficientBalance(input: {
  asset: SendAsset;
  amount: number;
  usdtBalance: number;
  trxBalance: number;
  estimatedTrxRequired: number;
}) {
  if (input.asset === "USDT" && input.usdtBalance < input.amount) {
    throw new Error("INSUFFICIENT_USDT");
  }
  if (input.asset === "TRX" && input.trxBalance < input.amount + input.estimatedTrxRequired) {
    throw new Error("INSUFFICIENT_TRX");
  }
  if (input.asset === "USDT" && input.trxBalance < input.estimatedTrxRequired) {
    throw new Error("INSUFFICIENT_NETWORK_RESOURCES");
  }
}

export function companyWalletCanSign(capability?: string | null) {
  return capability === "SIGNING_ENABLED";
}

export function signerRequestSignature(input: {
  body: string;
  timestamp: string;
  nonce: string;
  secret: string;
}) {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.nonce}.${input.body}`)
    .digest("hex");
}

export function verifySignerServiceRequest(input: {
  body: string;
  timestamp: string;
  nonce: string;
  signature: string;
  secret: string;
  nowMs?: number;
  seenNonce?: boolean;
}) {
  const age = Math.abs((input.nowMs ?? Date.now()) - Number(input.timestamp));
  if (!Number.isFinite(age) || age > 5 * 60_000) throw new Error("SIGNER_REQUEST_EXPIRED");
  if (input.seenNonce) throw new Error("SIGNER_REPLAY_REJECTED");
  const expected = signerRequestSignature(input);
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("SIGNER_AUTH_FAILED");
  return true;
}
