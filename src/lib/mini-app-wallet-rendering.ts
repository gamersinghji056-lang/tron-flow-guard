import {
  selectActiveWallet,
  walletDisplayBalance,
  type WalletBalanceLike,
} from "./wallet-state.ts";

export interface MiniAppWalletRenderRow extends WalletBalanceLike {
  network?: "trc20-mainnet" | "trc20-nile" | string | null;
  is_archived?: boolean | null;
  wallet_role?: string | null;
  parent_wallet_id?: string | null;
  onchain_trx_balance?: number | string | null;
}

export function partitionMiniAppWallets<T extends MiniAppWalletRenderRow>(wallets: T[]) {
  const activeWallets = wallets.filter((wallet) => wallet.is_archived !== true);
  return {
    operationalWallets: activeWallets.filter((wallet) => wallet.network === "trc20-mainnet"),
    preservedWallets: activeWallets.filter((wallet) => wallet.network !== "trc20-mainnet"),
  };
}

export function visibleMiniAppMainnetWallets<T extends MiniAppWalletRenderRow>(wallets: T[]): T[] {
  return partitionMiniAppWallets(wallets).operationalWallets;
}

export function selectVisibleMiniAppWallet<T extends MiniAppWalletRenderRow>(
  wallets: T[],
  selectedWalletId?: string | null,
): T | null {
  return selectActiveWallet(visibleMiniAppMainnetWallets(wallets), selectedWalletId);
}

export function miniAppPersonalWalletTotals(wallets: MiniAppWalletRenderRow[]) {
  const seen = new Set<string>();
  const visibleWallets = visibleMiniAppMainnetWallets(wallets).filter((wallet) => {
    const key = wallet.address ? `address:${wallet.address.toLowerCase()}` : `wallet:${wallet.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    visibleCount: visibleMiniAppMainnetWallets(wallets).length,
    usdt: visibleWallets.reduce((sum, wallet) => sum + walletDisplayBalance(wallet), 0),
    trx: visibleWallets.reduce((sum, wallet) => sum + Number(wallet.onchain_trx_balance ?? 0), 0),
  };
}
