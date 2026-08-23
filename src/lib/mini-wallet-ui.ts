export type MiniWalletAssetFilter = "ALL" | "USDT" | "TRX";
export type MiniWalletDirectionFilter = "ALL" | "in" | "out";
export type MiniThemePreference = "system" | "light" | "dark";

export interface MiniWalletTransactionLike {
  id: string;
  wallet_id?: string | null;
  currency?: string | null;
  direction?: string | null;
  created_at?: string | null;
}

export function walletHistoryNavigationTarget() {
  return "wallet-history";
}

export function miniWalletBackScreen(screen: string, transactionBackScreen = "wallet-history") {
  if (screen === "wallet-transaction-detail") return transactionBackScreen;
  if (screen === "wallet-history" || screen === "wallet-asset-detail") return "wallet-detail";
  if (screen === "wallet-detail" || screen === "wallet-create" || screen === "wallet-import")
    return "wallet";
  if (
    screen === "wallet-receive" ||
    screen === "wallet-backup" ||
    screen === "wallet-more" ||
    screen === "wallet-gasfree"
  )
    return "wallet-detail";
  return screen.startsWith("wallet") ? "wallet" : screen;
}

export function walletBottomTab(screen: string) {
  return screen.startsWith("wallet") ? "wallet" : screen;
}

export function filterMiniWalletTransactions(
  rows: MiniWalletTransactionLike[],
  walletId: string,
  asset: MiniWalletAssetFilter,
  direction: MiniWalletDirectionFilter,
) {
  return rows.filter((row) => {
    const currency = String(row.currency ?? "").toUpperCase();
    return (
      row.wallet_id === walletId &&
      (asset === "ALL" || currency === asset) &&
      (direction === "ALL" || row.direction === direction)
    );
  });
}

export function newestFirstMiniWalletTransactions<T extends MiniWalletTransactionLike>(rows: T[]) {
  return [...rows].sort(
    (a, b) => Date.parse(b.created_at ?? "0") - Date.parse(a.created_at ?? "0"),
  );
}

export function canAccessKnownWalletHistory(totalRows: number, pageSize: number) {
  return Math.ceil(totalRows / pageSize) * pageSize >= totalRows;
}

export function miniWalletHistoryMerge<T extends MiniWalletTransactionLike>(
  current: T[],
  next: T[],
) {
  const seen = new Set<string>();
  return [...current, ...next].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export function importedMnemonicWalletType() {
  return "standard" as const;
}

export function preserveWalletTypeForExplicitCreation(walletType: "standard" | "gasfree") {
  return walletType;
}

export function gasfreeCapabilityStatus(status?: string | null) {
  return status === "available" || status === "limited" || status === "enabled"
    ? status
    : "unavailable";
}

export function walletTypeAndGasfreeCapabilityAreIndependent(
  walletType: "standard" | "gasfree",
  gasfreeStatus?: string | null,
) {
  gasfreeCapabilityStatus(gasfreeStatus);
  return walletType === "standard";
}

export function gasfreeUnavailableClaim(status?: string | null) {
  return gasfreeCapabilityStatus(status) === "unavailable"
    ? "GasFree transfers are currently unavailable for this wallet."
    : "GasFree capability available.";
}

export function walletAssetBalances(usdt: number, trx: number) {
  return { USDT: usdt, TRX: trx };
}

export function walletGasfreePresentation(
  walletType: "standard" | "gasfree",
  gasfreeStatus?: string | null,
) {
  return {
    walletType,
    gasfreeCapability: gasfreeCapabilityStatus(gasfreeStatus),
    duplicateWalletRequired: false,
    claimsSponsorship: gasfreeCapabilityStatus(gasfreeStatus) !== "unavailable",
  };
}

export function walletResourceTotals(resources: {
  freeBandwidthLimit?: number | null;
  freeBandwidthUsed?: number | null;
  bandwidthLimit?: number | null;
  bandwidthUsed?: number | null;
  energyLimit?: number | null;
  energyUsed?: number | null;
}) {
  return {
    bandwidthLimit:
      Number(resources.freeBandwidthLimit ?? 0) + Number(resources.bandwidthLimit ?? 0),
    bandwidthUsed: Number(resources.freeBandwidthUsed ?? 0) + Number(resources.bandwidthUsed ?? 0),
    energyLimit: Number(resources.energyLimit ?? 0),
    energyUsed: Number(resources.energyUsed ?? 0),
  };
}

export function resolveMiniTheme(
  preference: MiniThemePreference,
  systemDark: boolean,
): "light" | "dark" {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

export function maskBankAccount(account?: string | null) {
  const digits = String(account ?? "").replace(/\D/g, "");
  return digits ? `••••${digits.slice(-4)}` : "••••";
}

export interface MiniPaymentMethodLike {
  kind?: string | null;
  label?: string | null;
  upi_id?: string | null;
  holder_name?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc?: string | null;
  supported_rails?: string[] | null;
}

export function paymentMethodDisplay(method: MiniPaymentMethodLike) {
  const kind = String(method.kind ?? "").toLowerCase();
  if (kind === "bank") {
    const rail = (method.supported_rails ?? []).join(", ").toUpperCase();
    return {
      title: method.label || method.bank_name || "Bank account",
      lines: [
        method.bank_name || "Bank",
        method.holder_name || "Account holder",
        `Account ${maskBankAccount(method.account_number)}`,
        method.ifsc ? `IFSC ${method.ifsc}` : "IFSC not set",
        rail || "BANK",
      ],
    };
  }
  return {
    title: method.label || method.upi_id || "UPI",
    lines: [
      method.upi_id ? `UPI • ${method.upi_id}` : "UPI",
      method.holder_name || "Account holder",
    ],
  };
}

export function walletImportOutcome(
  owner: "same-user" | "other-user" | "none",
  derivedMatches: boolean,
) {
  if (owner === "same-user" && derivedMatches) {
    return {
      action: "open-existing",
      message: "Wallet already exists. Existing wallet opened.",
      insert: false,
    } as const;
  }
  if (owner === "other-user") {
    return {
      action: "deny-cross-user",
      message:
        "This wallet is already linked to another WTRON account. Contact support to recover access.",
      insert: false,
    } as const;
  }
  return { action: "insert", message: "Wallet imported", insert: true } as const;
}
