-- One-time Telegram bot to Mini App handoff tokens.
-- Tokens are opaque, short lived, stored only as hashes, and consumed by service-role code.

CREATE TABLE public.telegram_app_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_account_id uuid NOT NULL REFERENCES public.telegram_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  token_hash text NOT NULL UNIQUE,
  nonce text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX telegram_app_handoffs_lookup_idx
  ON public.telegram_app_handoffs(telegram_user_id, status, expires_at DESC);
CREATE INDEX telegram_app_handoffs_user_idx
  ON public.telegram_app_handoffs(user_id, created_at DESC);

GRANT ALL ON public.telegram_app_handoffs TO service_role;
ALTER TABLE public.telegram_app_handoffs ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER telegram_app_handoffs_touch BEFORE UPDATE ON public.telegram_app_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.expire_telegram_app_handoffs()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.telegram_app_handoffs
     SET status = 'expired'
   WHERE status = 'pending'
     AND expires_at < now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END; $$;

REVOKE ALL ON FUNCTION public.expire_telegram_app_handoffs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_telegram_app_handoffs() TO service_role;
