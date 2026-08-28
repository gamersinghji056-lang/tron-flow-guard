export type WtronAccountType = "trader" | "vendor";
export type VendorApprovalStatus =
  "none" | "pending" | "approved" | "rejected" | "suspended" | "disabled";

export interface TelegramRoleState {
  linked: boolean;
  authorized?: boolean;
  authenticated?: boolean;
  accountType?: WtronAccountType | "both" | null | undefined;
  vendorStatus?: VendorApprovalStatus | null | undefined;
}

export type TelegramResolvedState =
  | "UNKNOWN"
  | "REGISTERED_TRADER_LOGGED_OUT"
  | "REGISTERED_VENDOR_LOGGED_OUT"
  | "PENDING_VENDOR"
  | "AUTHENTICATED_TRADER"
  | "AUTHENTICATED_VENDOR";

function isAuthenticated(state: TelegramRoleState) {
  return Boolean(state.authenticated ?? state.authorized);
}

export function resolveTelegramStateKind(state: TelegramRoleState): TelegramResolvedState {
  if (!state.linked) return "UNKNOWN";
  if (state.accountType === "vendor" && state.vendorStatus === "pending") return "PENDING_VENDOR";
  if (state.accountType === "vendor" && isAuthenticated(state)) return "AUTHENTICATED_VENDOR";
  if (isAuthenticated(state)) return "AUTHENTICATED_TRADER";
  if (state.accountType === "vendor") return "REGISTERED_VENDOR_LOGGED_OUT";
  return "REGISTERED_TRADER_LOGGED_OUT";
}

export function telegramStartMenuLabels(state: TelegramRoleState): string[] {
  switch (resolveTelegramStateKind(state)) {
    case "UNKNOWN":
      return ["REGISTER TRADER", "REGISTER VENDOR", "OPEN MINI APP", "HELP", "ABOUT", "HOW TO USE"];
    case "PENDING_VENDOR":
      return ["APPLICATION PENDING", "OPEN MINI APP", "HELP", "ABOUT", "HOW TO USE"];
    case "REGISTERED_VENDOR_LOGGED_OUT":
      return ["LOGIN VENDOR", "OPEN MINI APP", "HELP", "ABOUT", "HOW TO USE"];
    case "AUTHENTICATED_VENDOR":
    case "AUTHENTICATED_TRADER":
      return ["OPEN MINI APP"];
    case "REGISTERED_TRADER_LOGGED_OUT":
    default:
      if (state.accountType === "both") {
        return ["LOGIN TRADER", "LOGIN VENDOR", "OPEN MINI APP", "HELP", "ABOUT", "HOW TO USE"];
      }
      return ["LOGIN TRADER", "OPEN MINI APP", "HELP", "ABOUT", "HOW TO USE"];
  }
}

export function miniAppEntryState(input: {
  linked: boolean;
  accountType?: WtronAccountType | "admin" | null | undefined;
  vendorStatus?: VendorApprovalStatus | null | undefined;
}) {
  if (!input.linked) return "role_chooser" as const;
  if (input.accountType === "admin") return "blocked_admin" as const;
  if (input.accountType === "vendor" && input.vendorStatus !== "approved") {
    return "vendor_pending" as const;
  }
  if (input.accountType === "vendor") return "vendor_app" as const;
  return "trader_app" as const;
}

export function telegramLinkDecision(input: {
  existingTelegramUserId?: number | null;
  existingTelegramLinkedUserId?: string | null;
  existingPlatformTelegramUserId?: number | null;
  targetUserId: string;
  telegramUserId: number;
}) {
  if (
    input.existingTelegramLinkedUserId &&
    input.existingTelegramLinkedUserId !== input.targetUserId
  ) {
    return "telegram_linked_to_different_account" as const;
  }
  if (
    input.existingPlatformTelegramUserId &&
    input.existingPlatformTelegramUserId !== input.telegramUserId
  ) {
    return "platform_linked_to_different_telegram" as const;
  }
  if (
    input.existingTelegramLinkedUserId === input.targetUserId ||
    input.existingPlatformTelegramUserId === input.telegramUserId ||
    input.existingTelegramUserId === input.telegramUserId
  ) {
    return "idempotent_same_account" as const;
  }
  return "new_link" as const;
}

export function telegramRegistrationDecision(input: {
  existingOwnerUserId?: string | null;
  targetUserId: string;
}) {
  if (!input.existingOwnerUserId) return "allow" as const;
  if (input.existingOwnerUserId === input.targetUserId) return "idempotent_owner" as const;
  return "telegram_registration_taken" as const;
}

export function telegramLoginSessionUser(input: {
  permanentOwnerUserId: string;
  handoffUserId?: string | null;
  activeSessionUserId?: string | null;
}) {
  return input.handoffUserId ?? input.activeSessionUserId ?? input.permanentOwnerUserId;
}
