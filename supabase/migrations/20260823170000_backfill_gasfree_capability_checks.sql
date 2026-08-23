ALTER TABLE public.user_wallets
  ADD COLUMN IF NOT EXISTS gasfree_capability_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS gasfree_capability_error text,
  ADD COLUMN IF NOT EXISTS gasfree_capability_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.user_wallets
  DROP CONSTRAINT IF EXISTS user_wallets_gas_sponsorship_status_check,
  ADD CONSTRAINT user_wallets_gas_sponsorship_status_check
  CHECK (gas_sponsorship_status IN ('available', 'limited', 'enabled', 'unavailable', 'check_failed', 'unknown'));
