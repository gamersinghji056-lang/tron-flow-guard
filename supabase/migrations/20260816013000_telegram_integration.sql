-- Telegram bot and Mini App integration.
-- This is an access-channel layer only. It reuses existing users, balances,
-- deposits, withdrawals, P2P, direct-sell, ledger, and blockchain listener data.

CREATE TYPE public.telegram_account_status AS ENUM ('active', 'disabled', 'unlinked');
CREATE TYPE public.telegram_queue_status AS ENUM ('pending', 'sending', 'sent', 'failed', 'cancelled');

CREATE TABLE public.telegram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  chat_id bigint NOT NULL,
  username text,
  first_name text,
  last_name text,
  language_code text,
  status public.telegram_account_status NOT NULL DEFAULT 'active',
  notifications_enabled boolean NOT NULL DEFAULT true,
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(telegram_user_id)
);

CREATE INDEX telegram_accounts_user_idx ON public.telegram_accounts(user_id);
CREATE INDEX telegram_accounts_status_idx ON public.telegram_accounts(status, last_seen_at DESC);

GRANT SELECT ON public.telegram_accounts TO authenticated;
GRANT ALL ON public.telegram_accounts TO service_role;
ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY telegram_accounts_select_own_or_admin ON public.telegram_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE TRIGGER telegram_accounts_touch BEFORE UPDATE ON public.telegram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.telegram_bot_health (
  service text PRIMARY KEY,
  status text NOT NULL DEFAULT 'offline',
  detail text,
  bot_username text,
  mini_app_url text,
  last_update_id bigint,
  last_ok_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.telegram_bot_health TO authenticated;
GRANT ALL ON public.telegram_bot_health TO service_role;
ALTER TABLE public.telegram_bot_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY telegram_bot_health_admin_select ON public.telegram_bot_health
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE TRIGGER telegram_bot_health_touch BEFORE UPDATE ON public.telegram_bot_health
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.telegram_notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_account_id uuid NOT NULL REFERENCES public.telegram_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL,
  event text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.telegram_queue_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX telegram_queue_status_idx ON public.telegram_notification_queue(status, next_retry_at, created_at);
CREATE INDEX telegram_queue_user_idx ON public.telegram_notification_queue(user_id, created_at DESC);

GRANT SELECT ON public.telegram_notification_queue TO authenticated;
GRANT ALL ON public.telegram_notification_queue TO service_role;
ALTER TABLE public.telegram_notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY telegram_queue_select_own_or_admin ON public.telegram_notification_queue
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE TRIGGER telegram_queue_touch BEFORE UPDATE ON public.telegram_notification_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.telegram_link_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  telegram_account_id uuid REFERENCES public.telegram_accounts(id) ON DELETE SET NULL,
  telegram_user_id bigint,
  action text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX telegram_link_audit_user_idx ON public.telegram_link_audit(user_id, created_at DESC);
CREATE INDEX telegram_link_audit_telegram_idx ON public.telegram_link_audit(telegram_user_id, created_at DESC);

GRANT SELECT ON public.telegram_link_audit TO authenticated;
GRANT ALL ON public.telegram_link_audit TO service_role;
ALTER TABLE public.telegram_link_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY telegram_link_audit_select_own_or_admin ON public.telegram_link_audit
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.enqueue_telegram_notification_from_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  account public.telegram_accounts;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO account
  FROM public.telegram_accounts
  WHERE user_id = NEW.user_id
    AND status = 'active'
    AND notifications_enabled
  LIMIT 1;

  IF account.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.telegram_notification_queue
    (telegram_account_id, user_id, chat_id, event, title, body, payload)
  VALUES
    (
      account.id,
      NEW.user_id,
      account.chat_id,
      'notification.' || COALESCE(NEW.severity::text, 'info'),
      NEW.title,
      NEW.body,
      jsonb_build_object('notification_id', NEW.id, 'severity', NEW.severity, 'audience', NEW.audience)
    );

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS notifications_queue_telegram ON public.notifications;
CREATE TRIGGER notifications_queue_telegram
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_telegram_notification_from_notification();

CREATE OR REPLACE FUNCTION public.admin_set_telegram_account_status(
  _telegram_account_id uuid,
  _status public.telegram_account_status,
  _reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  account public.telegram_accounts;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: administrator access required';
  END IF;

  SELECT * INTO account FROM public.telegram_accounts WHERE id = _telegram_account_id FOR UPDATE;
  IF account.id IS NULL THEN
    RAISE EXCEPTION 'Telegram account not found';
  END IF;

  UPDATE public.telegram_accounts
     SET status = _status,
         disabled_at = CASE WHEN _status = 'disabled' THEN now() ELSE disabled_at END,
         disabled_reason = CASE WHEN _status = 'disabled' THEN _reason ELSE NULL END
   WHERE id = account.id;

  INSERT INTO public.telegram_link_audit
    (user_id, telegram_account_id, telegram_user_id, action, reason, actor_id, actor_type)
  VALUES
    (account.user_id, account.id, account.telegram_user_id, 'admin.status_changed', _reason, auth.uid(), 'admin');

  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'admin', 'telegram.status_changed', 'telegram_account', account.id::text,
    jsonb_build_object('status', _status, 'reason', _reason));

  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.enqueue_telegram_notification_from_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_telegram_account_status(uuid, public.telegram_account_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_telegram_account_status(uuid, public.telegram_account_status, text) TO authenticated, service_role;

ALTER TABLE public.telegram_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.telegram_notification_queue REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_accounts;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_notification_queue;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
