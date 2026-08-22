export type VendorAccountStatus = "active" | "disabled" | "frozen" | "archived";
export type VendorListingStatus = "active" | "paused" | "closed";

export function validateVendorAccountLimits(input: {
  minInr: number;
  maxInr: number;
  dailyLimitInr: number;
}) {
  if (input.minInr <= 0) throw new Error("Minimum INR must be greater than zero");
  if (input.maxInr < input.minInr) throw new Error("Maximum INR must be at least the minimum");
  if (input.dailyLimitInr < input.maxInr) {
    throw new Error("Daily limit must be at least the maximum transaction amount");
  }
}

export function validatePaymentIdentity(input: {
  rail: string;
  accountRef: string;
  ifsc?: string | null | undefined;
}) {
  if (input.rail === "upi") {
    if (!/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(input.accountRef)) {
      throw new Error("Enter a valid UPI ID");
    }
    return;
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(input.ifsc ?? "").toUpperCase())) {
    throw new Error("Enter a valid IFSC");
  }
}

export function nextAccountStatus(input: {
  enabled: boolean;
  frozen: boolean;
  archived?: boolean;
}): VendorAccountStatus {
  if (input.archived) return "archived";
  if (input.frozen) return "frozen";
  return input.enabled ? "active" : "disabled";
}

export function ensureReservedLiquidityPreserved(input: {
  requestedTotal: number;
  reserved: number;
}) {
  if (input.requestedTotal < input.reserved) {
    throw new Error("Reserved liquidity cannot be modified");
  }
}

export function canResumeListing(input: {
  availableUsdt: number;
  accountStatus: string;
  accountEnabled: boolean;
  accountFrozen: boolean;
  accountArchived: boolean;
}) {
  return (
    input.availableUsdt > 0 &&
    input.accountStatus === "active" &&
    input.accountEnabled &&
    !input.accountFrozen &&
    !input.accountArchived
  );
}

export function reservationBlockedByAccount(input: {
  status: string;
  enabled: boolean;
  frozen: boolean;
  archived: boolean;
}) {
  return input.status !== "active" || !input.enabled || input.frozen || input.archived;
}
