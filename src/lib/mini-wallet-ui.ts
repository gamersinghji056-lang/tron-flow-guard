export type MiniWalletAssetFilter = "ALL" | "USDT" | "TRX";
export type MiniWalletDirectionFilter = "ALL" | "in" | "out";

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
  if (screen === "wallet-receive" || screen === "wallet-backup" || screen === "wallet-more")
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
