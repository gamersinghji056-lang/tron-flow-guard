ALTER TABLE public.user_wallets
  ADD COLUMN IF NOT EXISTS wallet_role text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS parent_wallet_id uuid REFERENCES public.user_wallets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wallet_group_id uuid;

ALTER TABLE public.user_wallets
  DROP CONSTRAINT IF EXISTS user_wallets_wallet_role_check,
  ADD CONSTRAINT user_wallets_wallet_role_check
  CHECK (wallet_role IN ('general', 'gasfree'));

UPDATE public.user_wallets
SET wallet_group_id = id
WHERE wallet_group_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_wallets_one_gasfree_child_per_parent_idx
  ON public.user_wallets(parent_wallet_id)
  WHERE is_archived = false AND wallet_role = 'gasfree';

CREATE INDEX IF NOT EXISTS user_wallets_wallet_group_idx
  ON public.user_wallets(user_id, wallet_group_id, wallet_role)
  WHERE is_archived = false;
