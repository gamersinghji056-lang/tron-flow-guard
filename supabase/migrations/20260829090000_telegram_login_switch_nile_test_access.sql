-- Separate permanent Telegram registration ownership from switchable login sessions.
-- Also gates Nile test-wallet creation per WTRON user.

CREATE TABLE IF NOT EXISTS public.telegram_registration_owners (
  telegram_user_id bigint PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type text NOT NULL DEFAULT 'trader' CHECK (account_type IN ('trader','vendor')),
  username text,
  first_name text,
  last_name text,
  registered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.telegram_registration_owners
  (telegram_user_id, user_id, username, first_name, last_name, registered_at)
SELECT telegram_user_id, user_id, username, first_name, last_name, linked_at
FROM public.telegram_accounts
ON CONFLICT (telegram_user_id) DO NOTHING;

GRANT SELECT ON public.telegram_registration_owners TO authenticated;
GRANT ALL ON public.telegram_registration_owners TO service_role;
ALTER TABLE public.telegram_registration_owners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_registration_owners_select_own_or_admin
  ON public.telegram_registration_owners;
CREATE POLICY telegram_registration_owners_select_own_or_admin
  ON public.telegram_registration_owners
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP TRIGGER IF EXISTS telegram_registration_owners_touch
  ON public.telegram_registration_owners;
CREATE TRIGGER telegram_registration_owners_touch
  BEFORE UPDATE ON public.telegram_registration_owners
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.nile_test_wallet_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  enabled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.nile_test_wallet_users TO authenticated;
GRANT ALL ON public.nile_test_wallet_users TO service_role;
ALTER TABLE public.nile_test_wallet_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nile_test_wallet_users_select_own_or_admin
  ON public.nile_test_wallet_users;
CREATE POLICY nile_test_wallet_users_select_own_or_admin
  ON public.nile_test_wallet_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP TRIGGER IF EXISTS nile_test_wallet_users_touch
  ON public.nile_test_wallet_users;
CREATE TRIGGER nile_test_wallet_users_touch
  BEFORE UPDATE ON public.nile_test_wallet_users
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
