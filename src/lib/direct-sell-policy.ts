export type DirectSellActorType = "trader" | "vendor";
export type DirectSellPayoutSource = "payment_methods" | "vendor_payment_accounts";

export interface VendorDirectSellAccountLike {
  id: string;
  vendor_id: string;
  status?: string | null;
  enabled?: boolean | null;
  frozen?: boolean | null;
  archived_at?: string | null;
  min_inr?: number | string | null;
  max_inr?: number | string | null;
  daily_limit_inr?: number | string | null;
}

export function assertVendorDirectSellAccount(input: {
  account: VendorDirectSellAccountLike | null | undefined;
  vendorId: string;
  expectedInr: number;
  usedTodayInr: number;
}) {
  const account = input.account;
  if (!account || account.vendor_id !== input.vendorId) {
    throw new Error("Select one of your own active vendor payout accounts");
  }
  if (account.status !== "active" || account.enabled !== true || account.frozen === true) {
    throw new Error("Select an active, unfrozen vendor payout account");
  }
  if (account.archived_at) {
    throw new Error("Archived vendor payout accounts cannot be used");
  }
  const min = Number(account.min_inr ?? 0);
  const max = Number(account.max_inr ?? 0);
  const daily = Number(account.daily_limit_inr ?? 0);
  if (Number.isFinite(min) && min > 0 && input.expectedInr < min) {
    throw new Error("Direct sell INR amount is below this account minimum");
  }
  if (Number.isFinite(max) && max > 0 && input.expectedInr > max) {
    throw new Error("Direct sell INR amount exceeds this account maximum");
  }
  if (Number.isFinite(daily) && daily > 0 && input.usedTodayInr + input.expectedInr > daily) {
    throw new Error("Direct sell INR amount exceeds this account daily limit");
  }
}

export function directSellPayoutMetadata(input: {
  actorType: DirectSellActorType;
  payoutSource: DirectSellPayoutSource;
  payoutAccountId: string;
  vendorId?: string | null;
}) {
  return {
    actor_type: input.actorType,
    payout_account_source: input.payoutSource,
    payout_account_id: input.payoutAccountId,
    vendor_id: input.vendorId ?? null,
  };
}
