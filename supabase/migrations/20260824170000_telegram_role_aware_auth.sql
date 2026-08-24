ALTER TABLE public.telegram_bot_auth_states
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'trader';

ALTER TABLE public.telegram_bot_auth_states
  DROP CONSTRAINT IF EXISTS telegram_bot_auth_states_account_type_check;

ALTER TABLE public.telegram_bot_auth_states
  ADD CONSTRAINT telegram_bot_auth_states_account_type_check
  CHECK (account_type IN ('trader', 'vendor'));
