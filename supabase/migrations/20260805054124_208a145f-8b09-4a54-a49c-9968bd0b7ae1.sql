-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','trader');
CREATE TYPE public.deposit_status AS ENUM ('waiting','detected','confirming','confirmed','failed','expired');
CREATE TYPE public.chain_network AS ENUM ('trc20-mainnet','trc20-nile');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  balance numeric(24,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- WALLETS
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  network public.chain_network NOT NULL DEFAULT 'trc20-nile',
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (address, network)
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallets_select_auth" ON public.wallets FOR SELECT TO authenticated USING (true);
CREATE POLICY "wallets_admin_all" ON public.wallets FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- DEPOSIT REQUESTS
CREATE TABLE public.deposit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref text NOT NULL UNIQUE DEFAULT ('DEP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.wallets(id),
  network public.chain_network NOT NULL,
  expected_amount numeric(24,6) NOT NULL CHECK (expected_amount > 0),
  received_amount numeric(24,6),
  status public.deposit_status NOT NULL DEFAULT 'waiting',
  confirmations integer NOT NULL DEFAULT 0,
  required_confirmations integer NOT NULL DEFAULT 16,
  txid text,
  block_number bigint,
  sender_address text,
  credited boolean NOT NULL DEFAULT false,
  failure_reason text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  detected_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX deposit_requests_txid_key ON public.deposit_requests (txid) WHERE txid IS NOT NULL;
CREATE INDEX deposit_requests_user_idx ON public.deposit_requests (user_id, created_at DESC);
CREATE INDEX deposit_requests_status_idx ON public.deposit_requests (status);
GRANT SELECT, INSERT ON public.deposit_requests TO authenticated;
GRANT ALL ON public.deposit_requests TO service_role;
ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deposits_select_own" ON public.deposit_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "deposits_insert_own" ON public.deposit_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "deposits_admin_update" ON public.deposit_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- TRANSACTIONS
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_request_id uuid REFERENCES public.deposit_requests(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  txid text NOT NULL UNIQUE,
  network public.chain_network NOT NULL,
  token_contract text NOT NULL,
  token_symbol text NOT NULL DEFAULT 'USDT',
  sender_address text,
  receiver_address text NOT NULL,
  amount numeric(24,6) NOT NULL,
  block_number bigint,
  confirmations integer NOT NULL DEFAULT 0,
  chain_status text,
  block_timestamp timestamptz,
  verified boolean NOT NULL DEFAULT false,
  verification_error text,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_idx ON public.transactions (user_id, created_at DESC);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tx_select_own" ON public.transactions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- BLOCKCHAIN EVENTS
CREATE TABLE public.blockchain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network public.chain_network NOT NULL,
  txid text NOT NULL,
  wallet_address text NOT NULL,
  token_contract text,
  amount numeric(24,6),
  block_number bigint,
  block_timestamp timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (txid, network)
);
GRANT SELECT ON public.blockchain_events TO authenticated;
GRANT ALL ON public.blockchain_events TO service_role;
ALTER TABLE public.blockchain_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_admin_select" ON public.blockchain_events FOR SELECT TO authenticated USING (public.is_admin());

-- LISTENER LOGS
CREATE TABLE public.listener_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info',
  scope text NOT NULL DEFAULT 'listener',
  message text NOT NULL,
  network public.chain_network,
  latest_block bigint,
  events_seen integer NOT NULL DEFAULT 0,
  deposits_updated integer NOT NULL DEFAULT 0,
  duration_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listener_logs_created_idx ON public.listener_logs (created_at DESC);
GRANT SELECT ON public.listener_logs TO authenticated;
GRANT ALL ON public.listener_logs TO service_role;
ALTER TABLE public.listener_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listener_logs_admin_select" ON public.listener_logs FOR SELECT TO authenticated USING (public.is_admin());

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  audience text NOT NULL DEFAULT 'trader',
  title text NOT NULL,
  body text,
  severity text NOT NULL DEFAULT 'info',
  deposit_request_id uuid REFERENCES public.deposit_requests(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_select" ON public.notifications FOR SELECT TO authenticated
  USING ((audience = 'trader' AND user_id = auth.uid()) OR (audience = 'admin' AND public.is_admin()));
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE TO authenticated
  USING ((audience = 'trader' AND user_id = auth.uid()) OR (audience = 'admin' AND public.is_admin()))
  WITH CHECK ((audience = 'trader' AND user_id = auth.uid()) OR (audience = 'admin' AND public.is_admin()));

-- SYSTEM SETTINGS
CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_select_auth" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_admin_write" ON public.system_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'system',
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON public.audit_logs (created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin_select" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());

-- TIMESTAMP TRIGGERS
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER wallets_touch BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER deposits_touch BEFORE UPDATE ON public.deposit_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER transactions_touch BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- SINGLE DEFAULT WALLET PER NETWORK
CREATE OR REPLACE FUNCTION public.enforce_single_default_wallet()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.wallets SET is_default = false
    WHERE id <> NEW.id AND network = NEW.network AND is_default;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER wallets_single_default AFTER INSERT OR UPDATE OF is_default, network ON public.wallets
FOR EACH ROW WHEN (NEW.is_default) EXECUTE FUNCTION public.enforce_single_default_wallet();

-- NEW USER BOOTSTRAP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_user boolean;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO first_user;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN first_user THEN 'admin'::public.app_role ELSE 'trader'::public.app_role END);

  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id)
  VALUES (NEW.id, 'user', 'auth.signup', 'user', NEW.id::text);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED SETTINGS
INSERT INTO public.system_settings (key, value, description) VALUES
  ('active_network', '"trc20-nile"', 'Network the blockchain listener polls'),
  ('required_confirmations', '16', 'Block confirmations required before auto-credit'),
  ('deposit_expiry_minutes', '120', 'Minutes before an unpaid deposit request expires'),
  ('large_deposit_threshold', '1000', 'Amount above which admins get a large-deposit alert'),
  ('listener_heartbeat', 'null', 'Timestamp of the last successful listener tick');

-- REALTIME
ALTER TABLE public.deposit_requests REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.listener_logs REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deposit_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.listener_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;