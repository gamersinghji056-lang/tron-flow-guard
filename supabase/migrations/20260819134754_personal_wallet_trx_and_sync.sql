-- Keep native TRX separate from USDT and from the platform balance.
ALTER TABLE public.user_wallets
  ADD COLUMN IF NOT EXISTS onchain_trx_balance numeric(30,6),
  ADD COLUMN IF NOT EXISTS onchain_trx_checked_at timestamptz;

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USDT'
  CHECK (currency IN ('USDT','TRX'));

COMMENT ON COLUMN public.user_wallets.onchain_trx_balance IS
  'Authoritative native TRX balance snapshot read from the configured TRON network.';

COMMENT ON COLUMN public.user_wallets.onchain_trx_checked_at IS
  'Timestamp of the latest successful native TRX balance read.';

COMMENT ON COLUMN public.wallet_transactions.currency IS
  'Display currency for wallet activity. Personal wallet on-chain sync records USDT TRC20 and native TRX separately.';
