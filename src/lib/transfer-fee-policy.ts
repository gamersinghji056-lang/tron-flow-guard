import type { SendAsset } from "@/lib/signer-policy";

export const DEFAULT_USDT_TOTAL_TRANSFER_FEE = 1.5;
export const DEFAULT_TRX_MIN_TRANSFER_FEE = 5;
export const DEFAULT_TRX_MAX_TRANSFER_FEE = 8;
export const DEFAULT_TRX_WTRON_MARGIN = 4;
export const DEFAULT_ENERGY_SAFETY_BUFFER_PERCENT = 12;

export type TransferFeeBlockCode = "ENERGY_COST_TOO_HIGH" | "TRX_NETWORK_COST_TOO_HIGH";

export interface UsdtFeeQuote {
  asset: "USDT";
  customerFeeUsdt: number;
  providerCostUsdt: number;
  wtronRevenueUsdt: number;
  blocked: boolean;
  blockCode: TransferFeeBlockCode | null;
}

export interface TrxFeeQuote {
  asset: "TRX";
  customerFeeTrx: number;
  networkCostTrx: number;
  wtronRevenueTrx: number;
  blocked: boolean;
  blockCode: TransferFeeBlockCode | null;
}

export function calculateUsdtTransferFee(input: {
  customerFeeUsdt?: number | null;
  providerCostUsdt?: number | null;
}): UsdtFeeQuote {
  const customerFeeUsdt = Number(input.customerFeeUsdt ?? DEFAULT_USDT_TOTAL_TRANSFER_FEE);
  const providerCostUsdt = Number(input.providerCostUsdt ?? 0);
  const blocked = providerCostUsdt >= customerFeeUsdt;
  return {
    asset: "USDT",
    customerFeeUsdt,
    providerCostUsdt,
    wtronRevenueUsdt: blocked ? 0 : Math.max(customerFeeUsdt - providerCostUsdt, 0),
    blocked,
    blockCode: blocked ? "ENERGY_COST_TOO_HIGH" : null,
  };
}

export function calculateTrxTransferFee(input: {
  networkCostTrx?: number | null;
  marginTrx?: number | null;
  minFeeTrx?: number | null;
  maxFeeTrx?: number | null;
}): TrxFeeQuote {
  const networkCostTrx = Number(input.networkCostTrx ?? 0);
  const marginTrx = Number(input.marginTrx ?? DEFAULT_TRX_WTRON_MARGIN);
  const minFeeTrx = Number(input.minFeeTrx ?? DEFAULT_TRX_MIN_TRANSFER_FEE);
  const maxFeeTrx = Number(input.maxFeeTrx ?? DEFAULT_TRX_MAX_TRANSFER_FEE);
  const unclamped = networkCostTrx + marginTrx;
  const customerFeeTrx = Math.min(Math.max(unclamped, minFeeTrx), maxFeeTrx);
  const blocked = networkCostTrx > maxFeeTrx;
  return {
    asset: "TRX",
    customerFeeTrx,
    networkCostTrx,
    wtronRevenueTrx: blocked ? 0 : Math.max(customerFeeTrx - networkCostTrx, 0),
    blocked,
    blockCode: blocked ? "TRX_NETWORK_COST_TOO_HIGH" : null,
  };
}

export function transferFeeForAsset(input: {
  asset: SendAsset;
  usdtCustomerFee: number;
  energyProviderCostUsdt?: number | null;
  trxNetworkCost?: number | null;
  trxMargin: number;
  trxMinFee: number;
  trxMaxFee: number;
}) {
  return input.asset === "USDT"
    ? calculateUsdtTransferFee({
        customerFeeUsdt: input.usdtCustomerFee,
        providerCostUsdt: input.energyProviderCostUsdt ?? null,
      })
    : calculateTrxTransferFee({
        networkCostTrx: input.trxNetworkCost ?? null,
        marginTrx: input.trxMargin,
        minFeeTrx: input.trxMinFee,
        maxFeeTrx: input.trxMaxFee,
      });
}
