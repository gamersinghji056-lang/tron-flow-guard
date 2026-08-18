-- Telegram bot chat authentication state and Mini App session bridge.
-- This preserves telegram_accounts as the single Telegram-to-platform link.

CREATE TYPE public.telegram_bot_auth_flow AS ENUM ('login', 'register');
CREATE TYPE public.telegram_bot_auth_step AS ENUM ('email', 'password', 'confirm_password');

CREATE TABLE public.telegram_bot_auth_states (
  telegram_user_id bigint PRIMARY KEY,
  chat_id bigint NOT NULL,
  flow public.telegram_bot_auth_flow NOT NULL,
  step public.telegram_bot_auth_step NOT NULL,
  email text,
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX telegram_bot_auth_states_expiry_idx
  ON public.telegram_bot_auth_states(expires_at);
CREATE INDEX telegram_bot_auth_states_lock_idx
  ON public.telegram_bot_auth_states(locked_until);

GRANT ALL ON public.telegram_bot_auth_states TO service_role;
ALTER TABLE public.telegram_bot_auth_states ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER telegram_bot_auth_states_touch BEFORE UPDATE ON public.telegram_bot_auth_states
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.telegram_app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_account_id uuid NOT NULL REFERENCES public.telegram_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  session_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX telegram_app_sessions_lookup_idx
  ON public.telegram_app_sessions(telegram_user_id, status, expires_at DESC);
CREATE INDEX telegram_app_sessions_user_idx
  ON public.telegram_app_sessions(user_id, created_at DESC);

GRANT SELECT ON public.telegram_app_sessions TO authenticated;
GRANT ALL ON public.telegram_app_sessions TO service_role;
ALTER TABLE public.telegram_app_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY telegram_app_sessions_select_own_or_admin ON public.telegram_app_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE TRIGGER telegram_app_sessions_touch BEFORE UPDATE ON public.telegram_app_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.expire_telegram_auth_state()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  affected integer;
BEGIN
  DELETE FROM public.telegram_bot_auth_states
   WHERE expires_at < now()
      OR (locked_until IS NOT NULL AND locked_until < now() - interval '1 day');
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END; $$;

CREATE OR REPLACE FUNCTION public.expire_telegram_app_sessions()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.telegram_app_sessions
     SET status = 'expired'
   WHERE status = 'active'
     AND expires_at < now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END; $$;

REVOKE ALL ON FUNCTION public.expire_telegram_auth_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_telegram_app_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_telegram_auth_state() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_telegram_app_sessions() TO service_role;
