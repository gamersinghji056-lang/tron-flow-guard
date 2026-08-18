export interface WalletBalanceLike {
  id: string;
  user_id?: string | null;
  address?: string | null;
  balance?: number | string | null;
  onchain_balance?: number | string | null;
  custody?: string | null;
  is_default?: boolean | null;
}

export interface WalletTransactionLike {
  wallet_id: string;
}

export function walletDisplayBalance(wallet: WalletBalanceLike | null | undefined): number {
  if (!wallet) return 0;
  const value = wallet.custody === "non_custodial" ? wallet.onchain_balance : wallet.balance;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function selectActiveWallet<T extends WalletBalanceLike>(
  wallets: T[],
  selectedWalletId?: string | null,
): T | null {
  return (
    wallets.find((wallet) => wallet.id === selectedWalletId) ??
    wallets.find((wallet) => wallet.is_default) ??
    wallets[0] ??
    null
  );
}

export function filterWalletHistory<T extends WalletTransactionLike>(
  rows: T[],
  walletId: string,
): T[] {
  return rows.filter((row) => row.wallet_id === walletId);
}

export function userOwnsWallet(wallet: WalletBalanceLike | null | undefined, userId: string) {
  return Boolean(wallet && wallet.user_id === userId);
}

export function canAccessWalletSecret(
  wallet: WalletBalanceLike | null | undefined,
  userId: string,
) {
  return userOwnsWallet(wallet, userId);
}

export function addressesAreSeparated(
  personalAddress?: string | null,
  platformAddress?: string | null,
) {
  return Boolean(personalAddress && platformAddress && personalAddress !== platformAddress);
}

export function gasSponsorshipUsable(status?: string | null) {
  return status === "available" || status === "limited";
}

export function onChainSendEnabled(wallet: WalletBalanceLike | null | undefined) {
  return Boolean(wallet && wallet.custody !== "non_custodial");
}
