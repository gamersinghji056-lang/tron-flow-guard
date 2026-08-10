-- 1. Roles ------------------------------------------------------------------
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Never make the first registered user an admin again.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));

  -- Role is ALWAYS trader here. Elevated roles are granted explicitly by the
  -- server-side administrator provisioning path only.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'trader'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id)
  VALUES (NEW.id, 'user', 'auth.signup', 'user', NEW.id::text);
  RETURN NEW;
END; $function$;

-- admin OR super_admin counts as staff. role::text avoids referencing the new
-- enum label in this same transaction.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid() AND role::text IN ('admin','super_admin')
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid() AND role::text = 'super_admin'
  )
$function$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- 2. Configurable admin permissions -----------------------------------------
CREATE TABLE public.admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);
GRANT SELECT ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_perms_select ON public.admin_permissions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id AND role::text = 'super_admin'
  ) OR EXISTS (
    SELECT 1 FROM public.admin_permissions
     WHERE user_id = _user_id AND permission = _permission
  )
$function$;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

-- 3. API keys ---------------------------------------------------------------
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_id text NOT NULL UNIQUE,
  secret_hash text NOT NULL,
  permissions text[] NOT NULL DEFAULT ARRAY['deposits:read','deposits:write','wallets:read'],
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  request_count bigint NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Column-level grants: the hashed secret is never selectable from the browser.
GRANT SELECT (id, name, key_id, permissions, status, created_by, last_used_at,
              request_count, revoked_at, created_at, updated_at)
  ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_keys_admin_select ON public.api_keys
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE TRIGGER api_keys_touch BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  key_id text,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  duration_ms integer,
  ip text,
  error text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_request_logs_created_idx ON public.api_request_logs (created_at DESC);
GRANT SELECT ON public.api_request_logs TO authenticated;
GRANT ALL ON public.api_request_logs TO service_role;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_logs_admin_select ON public.api_request_logs
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE public.api_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  endpoint text NOT NULL,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_code integer NOT NULL DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (api_key_id, idempotency_key)
);
GRANT ALL ON public.api_idempotency TO service_role;
ALTER TABLE public.api_idempotency ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.api_nonces (
  nonce text PRIMARY KEY,
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.api_nonces TO service_role;
ALTER TABLE public.api_nonces ENABLE ROW LEVEL SECURITY;

-- 4. Webhooks ---------------------------------------------------------------
CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  description text,
  secret text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY['deposit.created','deposit.detected','deposit.confirming','deposit.confirmed','deposit.failed','deposit.expired'],
  status text NOT NULL DEFAULT 'active',
  failure_count integer NOT NULL DEFAULT 0,
  last_delivery_at timestamptz,
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- `secret` deliberately excluded: only the backend can read the signing secret.
GRANT SELECT (id, url, description, events, status, failure_count,
              last_delivery_at, last_error, created_by, created_at, updated_at)
  ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhooks_admin_select ON public.webhook_endpoints
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE TRIGGER webhook_endpoints_touch BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event text NOT NULL,
  event_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  response_status integer,
  last_error text,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint_id, event_key)
);
CREATE INDEX webhook_deliveries_pending_idx
  ON public.webhook_deliveries (status, next_retry_at);
GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_admin_select ON public.webhook_deliveries
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE TRIGGER webhook_deliveries_touch BEFORE UPDATE ON public.webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Service health ---------------------------------------------------------
CREATE TABLE public.service_health (
  service text PRIMARY KEY,
  status text NOT NULL DEFAULT 'unknown',
  detail text,
  last_ok_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  latest_block bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_health TO authenticated;
GRANT ALL ON public.service_health TO service_role;
ALTER TABLE public.service_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_health_admin_select ON public.service_health
  FOR SELECT TO authenticated USING (public.is_admin());

-- 6. Wallet + deposit-limit columns ----------------------------------------
ALTER TABLE public.user_wallets
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS min_deposit numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_deposit numeric NOT NULL DEFAULT 1000000,
  ADD COLUMN IF NOT EXISTS expiry_minutes integer NOT NULL DEFAULT 120;

-- Traders must never see deposit addresses that are not assigned to them.
DROP POLICY IF EXISTS wallets_select_scoped ON public.wallets;
CREATE POLICY wallets_select_scoped ON public.wallets
  FOR SELECT TO authenticated
  USING (public.is_admin() OR (assigned_user_id = auth.uid() AND is_active));

-- 7. Settings --------------------------------------------------------------
INSERT INTO public.system_settings (key, value, description) VALUES
  ('email_verification_required', 'false'::jsonb, 'When true, new accounts must confirm their email before signing in'),
  ('deposit_min_usdt', '1'::jsonb, 'Global minimum deposit amount in USDT'),
  ('deposit_max_usdt', '1000000'::jsonb, 'Global maximum deposit amount in USDT'),
  ('deposit_expiry_minutes', '120'::jsonb, 'Minutes before an unpaid deposit order expires'),
  ('api_rate_limit_per_minute', '120'::jsonb, 'Maximum API requests per key per minute')
ON CONFLICT (key) DO NOTHING;