export type WtronAccountType = "trader" | "vendor";
export type VendorApprovalStatus =
  "none" | "pending" | "approved" | "rejected" | "suspended" | "disabled";

export interface TelegramRoleState {
  linked: boolean;
  authorized: boolean;
  accountType?: WtronAccountType | "both" | null | undefined;
  vendorStatus?: VendorApprovalStatus | null | undefined;
}

export function telegramStartMenuLabels(state: TelegramRoleState): string[] {
  if (state.authorized && state.linked) return ["OPEN MINI APP"];
  if (!state.linked) {
    return [
      "REGISTER TRADER",
      "REGISTER VENDOR",
      "OPEN MINI APP",
      "HELP",
      "ABOUT WTRON",
      "HOW TO USE WTRON",
    ];
  }
  if (state.accountType === "vendor") {
    if (state.vendorStatus === "pending") {
      return ["APPLICATION PENDING", "OPEN MINI APP", "HELP", "ABOUT WTRON", "HOW TO USE WTRON"];
    }
    return ["LOGIN VENDOR", "OPEN MINI APP", "HELP", "ABOUT WTRON", "HOW TO USE WTRON"];
  }
  if (state.accountType === "both") {
    return [
      "LOGIN TRADER",
      "LOGIN VENDOR",
      "OPEN MINI APP",
      "HELP",
      "ABOUT WTRON",
      "HOW TO USE WTRON",
    ];
  }
  return ["LOGIN TRADER", "OPEN MINI APP", "HELP", "ABOUT WTRON", "HOW TO USE WTRON"];
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
