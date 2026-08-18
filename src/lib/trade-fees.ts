export interface P2pFeePolicy {
  sellerFixedUsdt: number;
  sellerPercent: number;
  buyerPercent: number;
  minFeeUsdt: number;
  maxFeeUsdt: number;
}

export function calculateP2pSellerFee(amountUsdt: number, policy: P2pFeePolicy): number {
  const raw = policy.sellerFixedUsdt + (amountUsdt * policy.sellerPercent) / 100;
  const withMin = policy.minFeeUsdt > 0 ? Math.max(raw, policy.minFeeUsdt) : raw;
  const withMax = policy.maxFeeUsdt > 0 ? Math.min(withMin, policy.maxFeeUsdt) : withMin;
  return roundUsdt(withMax);
}

export function calculatePercentFee(amount: number, percent: number): number {
  return roundUsdt((amount * percent) / 100);
}

export function isP2pAutoReleaseEligible(input: {
  status: string;
  deadline: Date | null;
  now: Date;
  hasUtr: boolean;
  hasPaidAmount: boolean;
  hasProof: boolean;
  disputed: boolean;
  escrowLocked: boolean;
  escrowSettled: boolean;
}): boolean {
  return (
    ["payment_submitted", "payment_sent"].includes(input.status) &&
    input.deadline !== null &&
    input.deadline.getTime() <= input.now.getTime() &&
    input.hasUtr &&
    input.hasPaidAmount &&
    input.hasProof &&
    !input.disputed &&
    input.escrowLocked &&
    !input.escrowSettled
  );
}

export function roundUsdt(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
