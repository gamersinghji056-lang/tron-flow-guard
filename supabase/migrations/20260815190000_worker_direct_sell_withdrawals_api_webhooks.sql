-- Worker/direct-sell/API/webhook foundation.
-- This migration extends the existing listener/deposit architecture; it does
-- not replace blockchain_events, transactions, listener_state or credit RPCs.

CREATE TYPE public.direct_sell_status AS ENUM (
  'created',
  'waiting_for_usdt',
  'usdt_detected',
  'usdt_confirming',
  'usdt_confirmed',
  'funds_locked',
  'inr_payment_pending',
  'payment_assigned',
  'inr_payment_sent',
  'inr_payment_verifying',
  'completed',
  'expired',
  'partial_payment',
  'overpayment',
  'manual_review',
  'cancelled'
);

CREATE TYPE public.withdrawal_status AS ENUM (
  'pending',
  'processing',
  'broadcast',
  'confirmed',
  'failed',
  'manual_review'
);

ALTER TYPE public.ledger_entry_type ADD VALUE IF NOT EXISTS 'deposit_credit';
ALTER TYPE public.ledger_entry_type ADD VALUE IF NOT EXISTS 'withdrawal';
ALTER TYPE public.ledger_entry_type ADD VALUE IF NOT EXISTS 'p2p_escrow_lock';
ALTER TYPE public.ledger_entry_type ADD VALUE IF NOT EXISTS 'p2p_escrow_release';
ALTER TYPE public.ledger_entry_type ADD VALUE IF NOT EXISTS 'direct_sell';
ALTER TYPE public.ledger_entry_type ADD VALUE IF NOT EXISTS 'refund';

ALTER TABLE public.deposit_requests
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'deposit';

ALTER TABLE public.deposit_requests
  DROP CONSTRAINT IF EXISTS deposit_requests_purpose_check;
ALTER TABLE public.deposit_requests
  ADD CONSTRAINT deposit_requests_purpose_check
  CHECK (purpose IN ('deposit', 'direct_sell'));

CREATE TABLE public.direct_sell_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref text NOT NULL UNIQUE DEFAULT ('DS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deposit_request_id uuid REFERENCES public.deposit_requests(id) ON DELETE SET NULL,
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  network public.chain_network NOT NULL,
  expected_usdt numeric(24,6) NOT NULL CHECK (expected_usdt > 0),
  received_usdt numeric(24,6) NOT NULL DEFAULT 0,
  remaining_usdt numeric(24,6) NOT NULL DEFAULT 0,
  locked_rate_inr numeric(24,6) NOT NULL CHECK (locked_rate_inr > 0),
  expected_inr numeric(24,2) NOT NULL CHECK (expected_inr > 0),
  status public.direct_sell_status NOT NULL DEFAULT 'waiting_for_usdt',
  assigned_company_address text NOT NULL,
  sender_address text,
  txid text,
  block_number bigint,
  confirmations integer NOT NULL DEFAULT 0,
  required_confirmations integer NOT NULL DEFAULT 16,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  payment_assignment jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_reference text,
  expires_at timestamptz NOT NULL,
  usdt_confirmed_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deposit_requests
  ADD COLUMN IF NOT EXISTS direct_sell_order_id uuid REFERENCES public.direct_sell_orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS direct_sell_deposit_key
  ON public.direct_sell_orders(deposit_request_id) WHERE deposit_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS direct_sell_user_status_idx
  ON public.direct_sell_orders(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS direct_sell_status_idx
  ON public.direct_sell_orders(status, created_at DESC);

GRANT SELECT ON public.direct_sell_orders TO authenticated;
GRANT ALL ON public.direct_sell_orders TO service_role;
ALTER TABLE public.direct_sell_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY direct_sell_select_own ON public.direct_sell_orders
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE TRIGGER direct_sell_touch BEFORE UPDATE ON public.direct_sell_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid REFERENCES public.user_wallets(id) ON DELETE SET NULL,
  network public.chain_network NOT NULL,
  to_address text NOT NULL,
  amount numeric(24,6) NOT NULL CHECK (amount > 0),
  fee numeric(24,6) NOT NULL DEFAULT 0,
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  txid text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS withdrawal_user_status_idx
  ON public.withdrawal_requests(user_id, status, created_at DESC);
GRANT SELECT ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY withdrawal_select_own ON public.withdrawal_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE TRIGGER withdrawal_touch BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.system_settings (key, value, description) VALUES
  ('direct_sell_enabled', 'true'::jsonb, 'Allow users to sell USDT directly to the platform'),
  ('direct_sell_rate_inr', '0'::jsonb, 'Current platform direct-sell INR/USDT rate. 0 disables new orders.'),
  ('direct_sell_min_usdt', '1'::jsonb, 'Minimum direct-sell order size in USDT'),
  ('direct_sell_max_usdt', '1000000'::jsonb, 'Maximum direct-sell order size in USDT'),
  ('withdrawal_min_usdt', '1'::jsonb, 'Minimum withdrawal amount in USDT'),
  ('withdrawal_max_usdt', '1000000'::jsonb, 'Maximum withdrawal amount in USDT')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_direct_sell_order(_amount numeric)
RETURNS TABLE(order_id uuid, order_ref text, deposit_request_id uuid, wallet_address text, expected_inr numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  active_network public.chain_network;
  required_conf integer;
  expiry_minutes integer;
  rate numeric;
  min_amount numeric;
  max_amount numeric;
  wallet public.wallets;
  sell public.direct_sell_orders;
  dep public.deposit_requests;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;

  SELECT (value #>> '{}')::public.chain_network INTO active_network FROM public.system_settings WHERE key = 'active_network';
  active_network := COALESCE(active_network, 'trc20-nile');
  SELECT COALESCE((value #>> '{}')::integer, 16) INTO required_conf FROM public.system_settings WHERE key = 'required_confirmations';
  SELECT COALESCE((value #>> '{}')::integer, 120) INTO expiry_minutes FROM public.system_settings WHERE key = 'deposit_expiry_minutes';
  SELECT COALESCE((value #>> '{}')::numeric, 0) INTO rate FROM public.system_settings WHERE key = 'direct_sell_rate_inr';
  SELECT COALESCE((value #>> '{}')::numeric, 1) INTO min_amount FROM public.system_settings WHERE key = 'direct_sell_min_usdt';
  SELECT COALESCE((value #>> '{}')::numeric, 1000000) INTO max_amount FROM public.system_settings WHERE key = 'direct_sell_max_usdt';

  IF rate <= 0 THEN RAISE EXCEPTION 'Direct sell rate is not configured'; END IF;
  IF _amount < min_amount OR _amount > max_amount THEN
    RAISE EXCEPTION 'Direct sell amount must be between % and % USDT', min_amount, max_amount;
  END IF;

  SELECT * INTO wallet FROM public.wallets w
   WHERE w.network = active_network AND w.is_active
   ORDER BY is_default DESC, created_at ASC
   LIMIT 1;
  IF wallet.id IS NULL THEN RAISE EXCEPTION 'No active company wallet is configured'; END IF;

  INSERT INTO public.direct_sell_orders
    (user_id, wallet_id, network, expected_usdt, remaining_usdt, locked_rate_inr,
     expected_inr, assigned_company_address, required_confirmations, expires_at)
  VALUES
    (auth.uid(), wallet.id, wallet.network, _amount, _amount, rate,
     round(_amount * rate, 2), wallet.address, required_conf,
     now() + make_interval(mins => COALESCE(expiry_minutes, 120)))
  RETURNING * INTO sell;

  INSERT INTO public.deposit_requests
    (user_id, wallet_id, network, expected_amount, required_confirmations,
     expires_at, purpose, direct_sell_order_id)
  VALUES
    (auth.uid(), wallet.id, wallet.network, _amount, required_conf,
     sell.expires_at, 'direct_sell', sell.id)
  RETURNING * INTO dep;

  UPDATE public.direct_sell_orders SET deposit_request_id = dep.id WHERE id = sell.id
  RETURNING * INTO sell;

  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'user', 'direct_sell.created', 'direct_sell_order', sell.id::text,
    jsonb_build_object('amount', _amount, 'rate', rate, 'deposit_request_id', dep.id));

  RETURN QUERY SELECT sell.id, sell.order_ref, dep.id, wallet.address, sell.expected_inr;
END; $$;

REVOKE ALL ON FUNCTION public.create_direct_sell_order(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_sell_order(numeric) TO authenticated, service_role;
