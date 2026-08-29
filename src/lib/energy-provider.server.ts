import { isTronAddress } from "@/lib/chain";

export type EnergyProviderName = "tronrental";

export interface EnergyQuote {
  provider: EnergyProviderName;
  energyAmount: number;
  duration: "1h";
  priceTrx: number;
  priceUsdt: number;
  raw: unknown;
}

export interface EnergyPurchaseResult extends EnergyQuote {
  providerOrderId: string;
  status: string;
}

export interface EnergyOrderStatus {
  provider: EnergyProviderName;
  providerOrderId: string;
  status: string;
  delegateTxid?: string | null;
  raw: unknown;
}

const TRONRENTAL_BASE_URL = "https://api.tronrental.com/v1";

function providerName() {
  return (process.env["TRON_ENERGY_PROVIDER"]?.trim() || "tronrental") as EnergyProviderName;
}

function energyBufferPercent() {
  const parsed = Number(process.env["TRON_ENERGY_BUFFER_PERCENT"] ?? 12);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 12;
}

function roundUpEnergy(energy: number) {
  const buffered = Math.ceil(energy * (1 + energyBufferPercent() / 100));
  return Math.max(buffered, 15_000);
}

function tronRentalApiKey() {
  return process.env["TRONRENTAL_API_KEY"]?.trim() || null;
}

async function tronRentalFetch<T>(endpoint: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const apiKey = tronRentalApiKey();
  if (apiKey) headers.set("X-API-Key", apiKey);
  if (init.body) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const response = await fetch(`${TRONRENTAL_BASE_URL}${endpoint}`, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as T & { detail?: unknown };
  if (!response.ok) {
    const detail =
      typeof body.detail === "string"
        ? body.detail
        : JSON.stringify(body.detail ?? `HTTP ${response.status}`);
    throw new Error(detail);
  }
  return body;
}

export function selectedEnergyProvider() {
  return providerName();
}

export async function quoteEnergy(input: {
  energyRequired: number;
  provider?: EnergyProviderName;
}): Promise<EnergyQuote> {
  if ((input.provider ?? providerName()) !== "tronrental") {
    throw new Error("Unsupported TRON energy provider");
  }
  const energyAmount = roundUpEnergy(input.energyRequired);
  const prices = await tronRentalFetch<{
    energy_trx?: { "1h"?: string | number };
    energy_fixed_fee_trx?: string | number;
    trx_usd_rate?: string | number;
  }>("/prices");
  const unitPrice = Number(prices.energy_trx?.["1h"] ?? 0);
  const fixedFee = Number(prices.energy_fixed_fee_trx ?? 0);
  const baseVolume = 65_000;
  const priceTrx = (unitPrice * energyAmount) / baseVolume + fixedFee;
  const trxUsdRate = Number(prices.trx_usd_rate ?? 0);
  return {
    provider: "tronrental",
    energyAmount,
    duration: "1h",
    priceTrx,
    priceUsdt: trxUsdRate > 0 ? priceTrx * trxUsdRate : 0,
    raw: prices,
  };
}

export async function purchaseEnergy(input: {
  receiver: string;
  energyRequired: number;
  provider?: EnergyProviderName;
}): Promise<EnergyPurchaseResult> {
  if (!isTronAddress(input.receiver)) throw new Error("Invalid energy receiver address");
  if ((input.provider ?? providerName()) !== "tronrental") {
    throw new Error("Unsupported TRON energy provider");
  }
  const apiKey = tronRentalApiKey();
  if (!apiKey) throw new Error("TRONRENTAL_API_KEY is not configured");
  const quote = await quoteEnergy({
    energyRequired: input.energyRequired,
    ...(input.provider ? { provider: input.provider } : {}),
  });
  const body = await tronRentalFetch<{
    id?: string | number;
    order_id?: string | number;
    status?: string;
    price_trx?: string | number;
  }>("/energy/buy", {
    method: "POST",
    body: JSON.stringify({
      target_address: input.receiver,
      volume: quote.energyAmount,
      duration: "1h",
    }),
  });
  const priceTrx = Number(body.price_trx ?? quote.priceTrx);
  const trxUsdRate = quote.priceTrx > 0 ? quote.priceUsdt / quote.priceTrx : 0;
  return {
    ...quote,
    providerOrderId: String(body.id ?? body.order_id ?? ""),
    status: String(body.status ?? "pending"),
    priceTrx,
    priceUsdt: trxUsdRate > 0 ? priceTrx * trxUsdRate : quote.priceUsdt,
    raw: body,
  };
}

export async function getEnergyOrderStatus(orderId: string): Promise<EnergyOrderStatus> {
  const data = await tronRentalFetch<{
    id?: string | number;
    order_id?: string | number;
    status?: string;
    delegate_txid?: string | null;
  }>(`/orders/${encodeURIComponent(orderId)}`);
  return {
    provider: "tronrental",
    providerOrderId: String(data.id ?? data.order_id ?? orderId),
    status: String(data.status ?? "unknown"),
    delegateTxid: data.delegate_txid ?? null,
    raw: data,
  };
}
