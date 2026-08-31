export type TransferPolicyKind = "normal_usdt" | "normal_trx" | "gasfree_usdt";

export type TransferPolicyBlockedBy = "global" | "product" | "user" | null;

export interface TransferPolicySettings {
  wallet_transfers_enabled?: unknown;
  normal_usdt_transfers_enabled?: unknown;
  normal_trx_transfers_enabled?: unknown;
  gasfree_usdt_transfers_enabled?: unknown;
}

export interface UserTransferControlLike {
  all_transfers_enabled?: boolean | null;
  normal_usdt_enabled?: boolean | null;
  normal_trx_enabled?: boolean | null;
  gasfree_usdt_enabled?: boolean | null;
  reason?: string | null;
}

export interface TransferPolicyEvaluation {
  kind: TransferPolicyKind;
  allowed: boolean;
  blockedBy: TransferPolicyBlockedBy;
  reason: string | null;
  globalEnabled: boolean;
  productEnabled: boolean;
  userEnabled: boolean;
}

export function transferPolicySettingKey(kind: TransferPolicyKind) {
  if (kind === "normal_usdt") return "normal_usdt_transfers_enabled";
  if (kind === "normal_trx") return "normal_trx_transfers_enabled";
  return "gasfree_usdt_transfers_enabled";
}

export function parseTransferPolicyBoolean(value: unknown, fallback: boolean) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/^"|"$/g, "").toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return fallback;
}

export function evaluateTransferPolicy(input: {
  kind: TransferPolicyKind;
  settings?: TransferPolicySettings | null;
  userControl?: UserTransferControlLike | null;
}): TransferPolicyEvaluation {
  const globalEnabled = parseTransferPolicyBoolean(input.settings?.wallet_transfers_enabled, true);
  const productEnabled = parseTransferPolicyBoolean(
    input.settings?.[transferPolicySettingKey(input.kind)],
    true,
  );
  const userKindEnabled =
    input.kind === "normal_usdt"
      ? input.userControl?.normal_usdt_enabled
      : input.kind === "normal_trx"
        ? input.userControl?.normal_trx_enabled
        : input.userControl?.gasfree_usdt_enabled;
  const userEnabled =
    input.userControl?.all_transfers_enabled !== false && userKindEnabled !== false;
  const userReason = input.userControl?.reason?.trim() || null;

  if (!globalEnabled) {
    return {
      kind: input.kind,
      allowed: false,
      blockedBy: "global",
      reason: "Transfers are temporarily unavailable.",
      globalEnabled,
      productEnabled,
      userEnabled,
    };
  }
  if (!productEnabled) {
    return {
      kind: input.kind,
      allowed: false,
      blockedBy: "product",
      reason: "This transfer type is temporarily unavailable.",
      globalEnabled,
      productEnabled,
      userEnabled,
    };
  }
  if (!userEnabled) {
    return {
      kind: input.kind,
      allowed: false,
      blockedBy: "user",
      reason: userReason || "Transfers are unavailable for this account.",
      globalEnabled,
      productEnabled,
      userEnabled,
    };
  }

  return {
    kind: input.kind,
    allowed: true,
    blockedBy: null,
    reason: null,
    globalEnabled,
    productEnabled,
    userEnabled,
  };
}
