-- User-side wallet, payment-method, analytics/referral foundations.
-- Preserves company deposit wallets in public.wallets and existing listener tables.

ALTER TABLE public.user_wallets
  ADD COLUMN IF NOT EXISTS wallet_type text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS backup_status text NOT NULL DEFAULT 'not_backed_up',
  ADD COLUMN IF NOT EXISTS derivation_path text,
  ADD COLUMN IF NOT EXISTS gas_sponsorship_status text NOT NULL DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS selected_at timestamptz;

ALTER TABLE public.user_wallets
  DROP CONSTRAINT IF EXISTS user_wallets_wallet_type_check,
  ADD CONSTRAINT user_wallets_wallet_type_check CHECK (wallet_type IN ('standard', 'gasfree'));

ALTER TABLE public.user_wallets
  DROP CONSTRAINT IF EXISTS user_wallets_backup_status_check,
  ADD CONSTRAINT user_wallets_backup_status_check CHECK (backup_status IN ('not_backed_up', 'backed_up', 'imported'));

ALTER TABLE public.user_wallets
  DROP CONSTRAINT IF EXISTS user_wallets_gas_sponsorship_status_check,
  ADD CONSTRAINT user_wallets_gas_sponsorship_status_check CHECK (gas_sponsorship_status IN ('available', 'limited', 'unavailable'));

CREATE INDEX IF NOT EXISTS user_wallets_user_selected_idx
  ON public.user_wallets (user_id, selected_at DESC NULLS LAST, is_default DESC, created_at ASC)
  WHERE NOT is_archived;

CREATE TABLE IF NOT EXISTS public.personal_wallet_secrets (
  wallet_id uuid PRIMARY KEY REFERENCES public.user_wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_mnemonic text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  kdf_salt text NOT NULL,
  derivation_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.personal_wallet_secrets TO service_role;
ALTER TABLE public.personal_wallet_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personal_wallet_secrets_admin_metadata ON public.personal_wallet_secrets;
CREATE POLICY personal_wallet_secrets_admin_metadata ON public.personal_wallet_secrets
  FOR SELECT TO authenticated USING (false);
CREATE TRIGGER personal_wallet_secrets_touch BEFORE UPDATE ON public.personal_wallet_secrets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.transaction_passwords (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  salt text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.transaction_passwords TO service_role;
ALTER TABLE public.transaction_passwords ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER transaction_passwords_touch BEFORE UPDATE ON public.transaction_passwords
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS ifsc text,
  ADD COLUMN IF NOT EXISTS supported_rails text[] NOT NULL DEFAULT ARRAY['UPI'],
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.payment_methods ALTER COLUMN upi_id DROP NOT NULL;

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_kind_check,
  ADD CONSTRAINT payment_methods_kind_check CHECK (kind IN ('upi', 'bank'));

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_status_check,
  ADD CONSTRAINT payment_methods_status_check CHECK (status IN ('active', 'disabled', 'pending_verification'));

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_kind_fields_check,
  ADD CONSTRAINT payment_methods_kind_fields_check CHECK (
    (kind = 'upi' AND upi_id IS NOT NULL AND length(trim(upi_id)) >= 3)
    OR
    (kind = 'bank' AND account_number IS NOT NULL AND ifsc IS NOT NULL AND bank_name IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_user_upi_unique
  ON public.payment_methods (user_id, lower(upi_id))
  WHERE kind = 'upi' AND upi_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_methods_user_kind_idx
  ON public.payment_methods (user_id, kind, is_default DESC, created_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_single_default_payment_method()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.payment_methods
       SET is_default = false
     WHERE id <> NEW.id AND user_id = NEW.user_id AND kind = NEW.kind AND is_default;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS payment_methods_single_default ON public.payment_methods;
CREATE TRIGGER payment_methods_single_default AFTER INSERT OR UPDATE OF is_default, kind
  ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_payment_method();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS referral_code text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_ci
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL AND username <> '';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique_ci
  ON public.profiles (lower(referral_code))
  WHERE referral_code IS NOT NULL AND referral_code <> '';

CREATE TABLE IF NOT EXISTS public.referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  source text NOT NULL DEFAULT 'telegram',
  status text NOT NULL DEFAULT 'pending',
  qualified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referred_user_id)
);

ALTER TABLE public.referral_attributions
  DROP CONSTRAINT IF EXISTS referral_attributions_status_check,
  ADD CONSTRAINT referral_attributions_status_check CHECK (status IN ('pending', 'qualified', 'rejected', 'rewarded'));

GRANT SELECT ON public.referral_attributions TO authenticated;
GRANT ALL ON public.referral_attributions TO service_role;
ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_attributions_own ON public.referral_attributions;
CREATE POLICY referral_attributions_own ON public.referral_attributions
  FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid() OR referred_user_id = auth.uid() OR public.is_admin());
CREATE TRIGGER referral_attributions_touch BEFORE UPDATE ON public.referral_attributions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_id uuid NOT NULL REFERENCES public.referral_attributions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USDT',
  status text NOT NULL DEFAULT 'pending',
  ledger_entry_id uuid REFERENCES public.ledger_entries(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  UNIQUE (idempotency_key)
);

ALTER TABLE public.referral_rewards
  DROP CONSTRAINT IF EXISTS referral_rewards_status_check,
  ADD CONSTRAINT referral_rewards_status_check CHECK (status IN ('pending', 'paid', 'cancelled'));

GRANT SELECT ON public.referral_rewards TO authenticated;
GRANT ALL ON public.referral_rewards TO service_role;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_rewards_own ON public.referral_rewards;
CREATE POLICY referral_rewards_own ON public.referral_rewards
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

INSERT INTO public.system_settings (key, value, description) VALUES
  ('gasfree_sponsorship_status', '"unavailable"'::jsonb, 'Gas sponsorship capability for GasFree wallet mode'),
  ('referral_campaign_enabled', 'false'::jsonb, 'Enable referral reward qualification and payout'),
  ('referral_reward_type', '"fixed"'::jsonb, 'Referral reward type: fixed or percentage'),
  ('referral_reward_amount', '0'::jsonb, 'Referral reward amount for fixed campaigns'),
  ('referral_qualification_condition', '"manual_review"'::jsonb, 'Condition required before referral payout')
ON CONFLICT (key) DO NOTHING;
