-- Production P2P/company/vendor trade timer and proof engine.
-- Additive to the existing wallet, ledger, Telegram, Direct Sell and TRON listener architecture.

ALTER TABLE public.p2p_advertisements
  ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reserved_usdt numeric(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

ALTER TABLE public.p2p_orders
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_proof_path text,
  ADD COLUMN IF NOT EXISTS payment_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_confirmation_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS buyer_fee_usdt numeric(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_fee_usdt numeric(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escrow_amount_usdt numeric(24,6),
  ADD COLUMN IF NOT EXISTS payment_method_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS release_idempotency_key text;

UPDATE public.p2p_orders
   SET escrow_amount_usdt = COALESCE(escrow_amount_usdt, usdt_amount + COALESCE(fee_usdt, 0)),
       seller_fee_usdt = COALESCE(NULLIF(seller_fee_usdt, 0), COALESCE(fee_usdt, 0)),
       payment_reference = COALESCE(payment_reference, utr_reference),
       payment_proof_path = COALESCE(payment_proof_path, proof_url),
       payment_submitted_at = COALESCE(payment_submitted_at, paid_at),
       seller_confirmation_deadline = COALESCE(seller_confirmation_deadline, confirm_deadline);

CREATE UNIQUE INDEX IF NOT EXISTS p2p_release_once_idx
  ON public.p2p_orders(release_idempotency_key)
  WHERE release_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS p2p_orders_payment_deadline_idx
  ON public.p2p_orders(status, payment_deadline)
  WHERE status = 'payment_pending';
CREATE INDEX IF NOT EXISTS p2p_orders_seller_confirm_deadline_idx
  ON public.p2p_orders(status, seller_confirmation_deadline)
  WHERE status IN ('payment_submitted','payment_sent');

INSERT INTO public.system_settings (key, value, description) VALUES
  ('p2p_seller_fixed_fee_usdt', '1.5'::jsonb, 'Fixed seller-side P2P fee in USDT'),
  ('p2p_seller_fee_percent', '0'::jsonb, 'Seller-side P2P fee percentage'),
  ('p2p_buyer_fee_percent', '0'::jsonb, 'Buyer-side P2P fee percentage'),
  ('p2p_min_fee_usdt', '0'::jsonb, 'Minimum P2P fee in USDT'),
  ('p2p_max_fee_usdt', '0'::jsonb, 'Maximum P2P fee in USDT. 0 means uncapped'),
  ('p2p_payment_timeout_minutes', '15'::jsonb, 'Minutes buyer has to submit payment'),
  ('p2p_seller_confirm_timeout_minutes', '15'::jsonb, 'Minutes seller has to confirm or dispute submitted payment'),
  ('p2p_auto_release_enabled', 'true'::jsonb, 'Auto-release eligible P2P escrow after seller confirmation deadline'),
  ('direct_sell_payment_confirm_timeout_minutes', '15'::jsonb, 'Minutes direct-sell user has to confirm each INR payment item'),
  ('direct_sell_auto_approve_enabled', 'true'::jsonb, 'Auto-approve sent direct-sell payment items after deadline'),
  ('vendor_payment_timeout_minutes', '15'::jsonb, 'Minutes vendor-buy users have to submit payment'),
  ('wtron_buy_rate_inr', '0'::jsonb, 'WTRON fixed buy rate INR/USDT'),
  ('wtron_sell_rate_inr', '0'::jsonb, 'WTRON fixed sell rate INR/USDT'),
  ('vendor_buyer_fee_percent', '0.5'::jsonb, 'Buyer-side verified vendor fee percentage'),
  ('vendor_seller_fee_percent', '0.5'::jsonb, 'Vendor-side verified vendor fee percentage')
ON CONFLICT (key) DO UPDATE
  SET description = EXCLUDED.description;

UPDATE public.system_settings
   SET value = '15'::jsonb
 WHERE key = 'p2p_confirm_window_minutes'
   AND (value #>> '{}')::numeric = 30;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE TABLE IF NOT EXISTS public.payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_type text NOT NULL CHECK (order_type IN ('p2p','direct_sell','vendor')),
  order_id uuid NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'payment-proofs',
  storage_path text NOT NULL UNIQUE,
  file_name text,
  content_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_proofs TO authenticated;
GRANT ALL ON public.payment_proofs TO service_role;
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_proofs_authorized_select ON public.payment_proofs;
CREATE POLICY payment_proofs_authorized_select ON public.payment_proofs
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR (
      order_type = 'p2p'
      AND EXISTS (
        SELECT 1 FROM public.p2p_orders o
        WHERE o.id = order_id AND (o.seller_id = auth.uid() OR o.buyer_user_id = auth.uid())
      )
    )
    OR (
      order_type = 'direct_sell'
      AND EXISTS (
        SELECT 1 FROM public.direct_sell_orders d
        WHERE d.id = order_id AND d.user_id = auth.uid()
      )
    )
  );

CREATE TABLE IF NOT EXISTS public.direct_sell_payment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direct_sell_order_id uuid NOT NULL REFERENCES public.direct_sell_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_inr numeric(24,2) NOT NULL CHECK (amount_inr > 0),
  utr_reference text,
  proof_path text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','confirmed','auto_approved','disputed','rejected','cancelled')),
  confirmation_deadline timestamptz,
  confirmed_at timestamptz,
  disputed_at timestamptz,
  dispute_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.direct_sell_payment_items TO authenticated;
GRANT ALL ON public.direct_sell_payment_items TO service_role;
ALTER TABLE public.direct_sell_payment_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS direct_sell_payment_items_select ON public.direct_sell_payment_items;
CREATE POLICY direct_sell_payment_items_select ON public.direct_sell_payment_items
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE TRIGGER direct_sell_payment_items_touch BEFORE UPDATE ON public.direct_sell_payment_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS direct_sell_payment_items_order_idx
  ON public.direct_sell_payment_items(direct_sell_order_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS direct_sell_payment_items_deadline_idx
  ON public.direct_sell_payment_items(status, confirmation_deadline)
  WHERE status = 'sent';

CREATE TABLE IF NOT EXISTS public.trading_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended','disabled')),
  risk_state text NOT NULL DEFAULT 'normal',
  success_rate numeric(6,2) NOT NULL DEFAULT 100,
  completed_orders integer NOT NULL DEFAULT 0,
  disputed_orders integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trading_vendors TO authenticated;
GRANT ALL ON public.trading_vendors TO service_role;
ALTER TABLE public.trading_vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trading_vendors_select ON public.trading_vendors;
CREATE POLICY trading_vendors_select ON public.trading_vendors
  FOR SELECT TO authenticated USING (status = 'approved' OR user_id = auth.uid() OR public.is_admin());
CREATE TRIGGER trading_vendors_touch BEFORE UPDATE ON public.trading_vendors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.vendor_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.trading_vendors(id) ON DELETE CASCADE,
  rail text NOT NULL CHECK (rail IN ('upi','imps','neft','rtgs')),
  account_ref text NOT NULL,
  holder_name text,
  bank_name text,
  ifsc text,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vendor_payment_accounts TO authenticated;
GRANT ALL ON public.vendor_payment_accounts TO service_role;
ALTER TABLE public.vendor_payment_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_payment_accounts_select ON public.vendor_payment_accounts;
CREATE POLICY vendor_payment_accounts_select ON public.vendor_payment_accounts
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.trading_vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );
CREATE TRIGGER vendor_payment_accounts_touch BEFORE UPDATE ON public.vendor_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.vendor_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.trading_vendors(id) ON DELETE CASCADE,
  asset text NOT NULL DEFAULT 'USDT',
  fiat text NOT NULL DEFAULT 'INR',
  rate_inr numeric(24,6) NOT NULL CHECK (rate_inr > 0),
  available_usdt numeric(24,6) NOT NULL DEFAULT 0 CHECK (available_usdt >= 0),
  reserved_usdt numeric(24,6) NOT NULL DEFAULT 0 CHECK (reserved_usdt >= 0),
  min_order_inr numeric(24,2) NOT NULL DEFAULT 1000,
  max_order_inr numeric(24,2) NOT NULL DEFAULT 1000000,
  payment_rails text[] NOT NULL DEFAULT ARRAY['upi'],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','closed')),
  daily_limit_usdt numeric(24,6) NOT NULL DEFAULT 1000000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vendor_listings TO authenticated;
GRANT ALL ON public.vendor_listings TO service_role;
ALTER TABLE public.vendor_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_listings_select ON public.vendor_listings;
CREATE POLICY vendor_listings_select ON public.vendor_listings
  FOR SELECT TO authenticated USING (
    status = 'active'
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.trading_vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );
CREATE TRIGGER vendor_listings_touch BEFORE UPDATE ON public.vendor_listings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS vendor_listings_market_idx
  ON public.vendor_listings(status, rate_inr, available_usdt);

CREATE TABLE IF NOT EXISTS public.vendor_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref text NOT NULL UNIQUE DEFAULT ('VB-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  listing_id uuid REFERENCES public.vendor_listings(id) ON DELETE SET NULL,
  vendor_id uuid NOT NULL REFERENCES public.trading_vendors(id) ON DELETE CASCADE,
  buyer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usdt_amount numeric(24,6) NOT NULL CHECK (usdt_amount > 0),
  rate_inr numeric(24,6) NOT NULL CHECK (rate_inr > 0),
  total_inr numeric(24,2) NOT NULL CHECK (total_inr > 0),
  buyer_fee_usdt numeric(24,6) NOT NULL DEFAULT 0,
  vendor_fee_usdt numeric(24,6) NOT NULL DEFAULT 0,
  payment_rail text NOT NULL DEFAULT 'upi',
  payment_account_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  utr_reference text,
  paid_amount_inr numeric(24,2),
  payment_proof_path text,
  status text NOT NULL DEFAULT 'payment_pending'
    CHECK (status IN ('created','reserved','payment_pending','payment_submitted','confirmed','completed','cancelled','expired','disputed','admin_review')),
  payment_deadline timestamptz,
  payment_submitted_at timestamptz,
  completed_at timestamptz,
  disputed_at timestamptz,
  expired_at timestamptz,
  release_idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vendor_orders TO authenticated;
GRANT ALL ON public.vendor_orders TO service_role;
ALTER TABLE public.vendor_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_orders_select ON public.vendor_orders;
CREATE POLICY vendor_orders_select ON public.vendor_orders
  FOR SELECT TO authenticated USING (
    buyer_user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.trading_vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );
CREATE TRIGGER vendor_orders_touch BEFORE UPDATE ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS vendor_orders_buyer_idx ON public.vendor_orders(buyer_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_orders_vendor_idx ON public.vendor_orders(vendor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_orders_deadline_idx ON public.vendor_orders(status, payment_deadline)
  WHERE status = 'payment_pending';
CREATE UNIQUE INDEX IF NOT EXISTS vendor_release_once_idx ON public.vendor_orders(release_idempotency_key)
  WHERE release_idempotency_key IS NOT NULL;

DROP POLICY IF EXISTS payment_proofs_authorized_select ON public.payment_proofs;
CREATE POLICY payment_proofs_authorized_select ON public.payment_proofs
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR (
      order_type = 'p2p'
      AND EXISTS (
        SELECT 1 FROM public.p2p_orders o
        WHERE o.id = order_id AND (o.seller_id = auth.uid() OR o.buyer_user_id = auth.uid())
      )
    )
    OR (
      order_type = 'direct_sell'
      AND EXISTS (
        SELECT 1 FROM public.direct_sell_orders d
        WHERE d.id = order_id AND d.user_id = auth.uid()
      )
    )
    OR (
      order_type = 'vendor'
      AND EXISTS (
        SELECT 1 FROM public.vendor_orders vo
        JOIN public.trading_vendors tv ON tv.id = vo.vendor_id
        WHERE vo.id = order_id AND (vo.buyer_user_id = auth.uid() OR tv.user_id = auth.uid())
      )
    )
  );

CREATE OR REPLACE FUNCTION public.get_numeric_setting(_key text, _default numeric)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::numeric FROM public.system_settings WHERE key = _key), _default);
$$;
REVOKE ALL ON FUNCTION public.get_numeric_setting(text,numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_boolean_setting(_key text, _default boolean)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::boolean FROM public.system_settings WHERE key = _key), _default);
$$;
REVOKE ALL ON FUNCTION public.get_boolean_setting(text,boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.calculate_p2p_seller_fee(_usdt numeric)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE fixed_fee numeric; pct numeric; min_fee numeric; max_fee numeric; fee numeric;
BEGIN
  fixed_fee := public.get_numeric_setting('p2p_seller_fixed_fee_usdt', 1.5);
  pct := public.get_numeric_setting('p2p_seller_fee_percent', 0);
  min_fee := public.get_numeric_setting('p2p_min_fee_usdt', 0);
  max_fee := public.get_numeric_setting('p2p_max_fee_usdt', 0);
  fee := round(COALESCE(fixed_fee, 0) + (_usdt * COALESCE(pct, 0) / 100), 6);
  IF min_fee > 0 THEN fee := GREATEST(fee, min_fee); END IF;
  IF max_fee > 0 THEN fee := LEAST(fee, max_fee); END IF;
  RETURN fee;
END; $$;
REVOKE ALL ON FUNCTION public.calculate_p2p_seller_fee(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_p2p_seller_fee(numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.calculate_percent_fee(_amount numeric, _setting text, _default numeric)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT round(_amount * public.get_numeric_setting(_setting, _default) / 100, 6);
$$;
REVOKE ALL ON FUNCTION public.calculate_percent_fee(numeric,text,numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_p2p_system_event(
  _order_id uuid, _actor uuid, _from public.p2p_order_status, _to public.p2p_order_status, _note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.p2p_order_events (order_id, actor_id, actor_type, from_status, to_status, note)
  VALUES (_order_id, _actor, CASE WHEN _actor IS NULL THEN 'system' ELSE 'user' END, _from, _to, _note);
  INSERT INTO public.p2p_messages (order_id, sender_role, body, is_system)
  VALUES (_order_id, 'system', _note, true);
END; $$;
REVOKE ALL ON FUNCTION public.record_p2p_system_event(uuid,uuid,public.p2p_order_status,public.p2p_order_status,text) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.p2p_create_ad(public.p2p_side,numeric,numeric,numeric,numeric,text[],text,boolean);

CREATE OR REPLACE FUNCTION public.p2p_create_ad(
  _side public.p2p_side,
  _price numeric,
  _available_usdt numeric,
  _min_order_inr numeric,
  _max_order_inr numeric,
  _payment_methods text[] DEFAULT ARRAY['upi'],
  _terms text DEFAULT NULL,
  _is_active boolean DEFAULT true,
  _payment_method_id uuid DEFAULT NULL
)
RETURNS public.p2p_advertisements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mer public.merchants;
  prof public.profiles;
  pm public.payment_methods;
  ad public.p2p_advertisements;
  fee numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _price IS NULL OR _price <= 0 THEN RAISE EXCEPTION 'Price must be greater than zero'; END IF;
  IF _available_usdt IS NULL OR _available_usdt <= 0 THEN RAISE EXCEPTION 'Available amount must be greater than zero'; END IF;
  IF _min_order_inr IS NULL OR _max_order_inr IS NULL OR _min_order_inr <= 0 OR _min_order_inr > _max_order_inr THEN
    RAISE EXCEPTION 'Invalid order limits';
  END IF;
  SELECT * INTO prof FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF _side = 'sell' THEN
    fee := public.calculate_p2p_seller_fee(_available_usdt);
    IF prof.balance < (_available_usdt + fee) THEN
      RAISE EXCEPTION 'Insufficient available balance: % USDT plus % USDT fee required', _available_usdt, fee;
    END IF;
    IF _payment_method_id IS NULL THEN RAISE EXCEPTION 'Select a saved UPI payment method for sell ads'; END IF;
    SELECT * INTO pm FROM public.payment_methods WHERE id = _payment_method_id AND user_id = auth.uid();
    IF pm.id IS NULL THEN RAISE EXCEPTION 'Select one of your own payment methods'; END IF;
  END IF;

  mer := public.ensure_user_merchant(auth.uid());
  INSERT INTO public.p2p_advertisements
    (merchant_id, side, price_inr, available_usdt, min_order_inr, max_order_inr,
     payment_methods, terms, is_active, payment_method_id, fee_policy_snapshot)
  VALUES
    (mer.id, _side, _price, _available_usdt, _min_order_inr, _max_order_inr,
     COALESCE(_payment_methods, ARRAY['upi']), _terms, COALESCE(_is_active, true), _payment_method_id,
     jsonb_build_object('seller_fee_usdt', fee))
  RETURNING * INTO ad;

  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'user', 'p2p.ad.created', 'p2p_advertisement', ad.id::text,
    jsonb_build_object('side', _side, 'available_usdt', _available_usdt, 'price', _price, 'fee', fee));
  RETURN ad;
END; $$;

DROP FUNCTION IF EXISTS public.p2p_update_ad(uuid,numeric,numeric,numeric,numeric,text[],text,boolean);

CREATE OR REPLACE FUNCTION public.p2p_update_ad(
  _ad_id uuid,
  _price numeric,
  _available_usdt numeric,
  _min_order_inr numeric,
  _max_order_inr numeric,
  _payment_methods text[] DEFAULT NULL,
  _terms text DEFAULT NULL,
  _is_active boolean DEFAULT NULL,
  _payment_method_id uuid DEFAULT NULL
)
RETURNS public.p2p_advertisements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ad public.p2p_advertisements; mer public.merchants; prof public.profiles; fee numeric := 0; pm public.payment_methods;
BEGIN
  SELECT * INTO ad FROM public.p2p_advertisements WHERE id = _ad_id FOR UPDATE;
  IF ad.id IS NULL THEN RAISE EXCEPTION 'Advertisement not found'; END IF;
  SELECT * INTO mer FROM public.merchants WHERE id = ad.merchant_id;
  IF mer.user_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'Not your advertisement'; END IF;
  IF _price <= 0 OR _available_usdt < 0 OR _min_order_inr <= 0 OR _min_order_inr > _max_order_inr THEN
    RAISE EXCEPTION 'Invalid advertisement values';
  END IF;
  SELECT * INTO prof FROM public.profiles WHERE id = mer.user_id FOR UPDATE;
  IF ad.side = 'sell' THEN
    fee := public.calculate_p2p_seller_fee(_available_usdt);
    IF prof.balance < (_available_usdt + fee) THEN
      RAISE EXCEPTION 'Insufficient available balance for sell advertisement plus fee';
    END IF;
    IF COALESCE(_payment_method_id, ad.payment_method_id) IS NULL THEN RAISE EXCEPTION 'Sell ads require a saved payment method'; END IF;
    SELECT * INTO pm FROM public.payment_methods WHERE id = COALESCE(_payment_method_id, ad.payment_method_id) AND user_id = mer.user_id;
    IF pm.id IS NULL THEN RAISE EXCEPTION 'Select one of your own payment methods'; END IF;
  END IF;
  UPDATE public.p2p_advertisements
    SET price_inr = _price,
        available_usdt = _available_usdt,
        min_order_inr = _min_order_inr,
        max_order_inr = _max_order_inr,
        payment_methods = COALESCE(_payment_methods, payment_methods),
        terms = _terms,
        is_active = COALESCE(_is_active, is_active),
        payment_method_id = COALESCE(_payment_method_id, payment_method_id),
        fee_policy_snapshot = jsonb_build_object('seller_fee_usdt', fee),
        closed_at = CASE WHEN COALESCE(_is_active, is_active) THEN NULL ELSE closed_at END
    WHERE id = ad.id
    RETURNING * INTO ad;
  RETURN ad;
END; $$;

CREATE OR REPLACE FUNCTION public.p2p_create_order_from_ad(
  _advertisement_id uuid,
  _usdt numeric,
  _payment_method_id uuid DEFAULT NULL
)
RETURNS TABLE(order_id uuid, order_ref text, total_inr numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ad public.p2p_advertisements;
  mer public.merchants;
  seller_profile public.profiles;
  seller_pm public.payment_methods;
  total numeric;
  pay_minutes integer;
  seller_fee numeric;
  buyer_fee numeric;
  escrow_total numeric;
  new_order public.p2p_orders;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO ad FROM public.p2p_advertisements WHERE id = _advertisement_id FOR UPDATE;
  IF ad.id IS NULL OR NOT ad.is_active OR ad.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Advertisement is not available'; END IF;
  SELECT * INTO mer FROM public.merchants WHERE id = ad.merchant_id;
  IF mer.user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot take your own advertisement'; END IF;
  IF _usdt IS NULL OR _usdt <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF _usdt > ad.available_usdt THEN RAISE EXCEPTION 'Advertisement only has % USDT available', ad.available_usdt; END IF;
  total := round(_usdt * ad.price_inr, 2);
  IF total < ad.min_order_inr OR total > ad.max_order_inr THEN
    RAISE EXCEPTION 'Order total is outside advertisement limits';
  END IF;
  SELECT COALESCE((value #>> '{}')::integer, 15) INTO pay_minutes
    FROM public.system_settings WHERE key = 'p2p_payment_timeout_minutes';
  pay_minutes := COALESCE(pay_minutes, public.get_numeric_setting('p2p_payment_window_minutes', 15)::integer, 15);

  IF ad.side = 'buy' THEN
    IF _payment_method_id IS NULL THEN RAISE EXCEPTION 'Payment method is required'; END IF;
    SELECT * INTO seller_pm FROM public.payment_methods WHERE id = _payment_method_id AND user_id = auth.uid();
    IF seller_pm.id IS NULL THEN RAISE EXCEPTION 'Select one of your own payment methods'; END IF;
    SELECT * INTO seller_profile FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
    seller_fee := public.calculate_p2p_seller_fee(_usdt);
    escrow_total := _usdt + seller_fee;
    IF seller_profile.balance < escrow_total THEN RAISE EXCEPTION 'Insufficient available balance including seller fee'; END IF;
    INSERT INTO public.p2p_orders
      (advertisement_id, merchant_id, buyer_user_id, seller_id, side, usdt_amount, price_inr,
       total_inr, status, payment_method, payout_upi_id, payout_holder_name,
       escrow_locked, payment_deadline, seller_fee_usdt, fee_usdt, escrow_amount_usdt,
       payment_method_snapshot)
    VALUES (ad.id, mer.id, mer.user_id, auth.uid(), 'sell', _usdt, ad.price_inr, total,
            'payment_pending', seller_pm.kind, seller_pm.upi_id, seller_pm.holder_name, true,
            now() + make_interval(mins => pay_minutes), seller_fee, seller_fee, escrow_total,
            jsonb_build_object('payment_method_id', seller_pm.id, 'kind', seller_pm.kind, 'upi_id', seller_pm.upi_id, 'holder_name', seller_pm.holder_name))
    RETURNING * INTO new_order;
    UPDATE public.profiles SET balance = balance - escrow_total, locked_balance = locked_balance + escrow_total
     WHERE id = auth.uid() RETURNING * INTO seller_profile;
    PERFORM public.write_ledger(auth.uid(), new_order.id, 'escrow_lock', 'available', -escrow_total,
      seller_profile.balance + escrow_total, seller_profile.balance, 'Locked P2P sell escrow plus fee for ' || new_order.order_ref);
  ELSE
    IF mer.user_id IS NULL THEN RAISE EXCEPTION 'Advertiser account is unavailable'; END IF;
    SELECT * INTO seller_pm FROM public.payment_methods
      WHERE id = COALESCE(ad.payment_method_id, _payment_method_id) AND user_id = mer.user_id;
    IF seller_pm.id IS NULL THEN
      SELECT * INTO seller_pm FROM public.payment_methods
        WHERE user_id = mer.user_id AND kind = ANY(ad.payment_methods)
        ORDER BY is_default DESC, created_at ASC LIMIT 1;
    END IF;
    IF seller_pm.id IS NULL THEN RAISE EXCEPTION 'Seller has no eligible payment method'; END IF;
    SELECT * INTO seller_profile FROM public.profiles WHERE id = mer.user_id FOR UPDATE;
    seller_fee := public.calculate_p2p_seller_fee(_usdt);
    buyer_fee := public.calculate_percent_fee(_usdt, 'p2p_buyer_fee_percent', 0);
    escrow_total := _usdt + seller_fee;
    IF seller_profile.balance < escrow_total THEN RAISE EXCEPTION 'Seller no longer has sufficient balance including fee'; END IF;
    INSERT INTO public.p2p_orders
      (advertisement_id, merchant_id, buyer_user_id, seller_id, side, usdt_amount, price_inr,
       total_inr, status, payment_method, payout_upi_id, payout_holder_name,
       escrow_locked, payment_deadline, seller_fee_usdt, buyer_fee_usdt, fee_usdt, escrow_amount_usdt,
       payment_method_snapshot)
    VALUES (ad.id, mer.id, auth.uid(), mer.user_id, 'buy', _usdt, ad.price_inr, total,
            'payment_pending', seller_pm.kind, seller_pm.upi_id, seller_pm.holder_name, true,
            now() + make_interval(mins => pay_minutes), seller_fee, buyer_fee, seller_fee, escrow_total,
            jsonb_build_object('payment_method_id', seller_pm.id, 'kind', seller_pm.kind, 'upi_id', seller_pm.upi_id, 'holder_name', seller_pm.holder_name))
    RETURNING * INTO new_order;
    UPDATE public.profiles SET balance = balance - escrow_total, locked_balance = locked_balance + escrow_total
     WHERE id = mer.user_id RETURNING * INTO seller_profile;
    PERFORM public.write_ledger(mer.user_id, new_order.id, 'escrow_lock', 'available', -escrow_total,
      seller_profile.balance + escrow_total, seller_profile.balance, 'Locked P2P sell escrow plus fee for ' || new_order.order_ref);
  END IF;

  UPDATE public.p2p_advertisements
     SET available_usdt = GREATEST(available_usdt - _usdt, 0),
         reserved_usdt = reserved_usdt + _usdt,
         is_active = CASE WHEN available_usdt - _usdt <= 0 THEN false ELSE is_active END,
         closed_at = CASE WHEN available_usdt - _usdt <= 0 THEN now() ELSE closed_at END
   WHERE id = ad.id;
  UPDATE public.merchants SET total_orders = total_orders + 1 WHERE id = mer.id;
  PERFORM public.record_p2p_system_event(new_order.id, auth.uid(), NULL, 'payment_pending',
    'Order created. USDT and applicable seller fee are locked in escrow.');
  RETURN QUERY SELECT new_order.id, new_order.order_ref, new_order.total_inr;
END; $$;

CREATE OR REPLACE FUNCTION public.p2p_mark_payment_sent(
  _order_id uuid, _utr text, _amount numeric, _proof_url text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord public.p2p_orders; conf_minutes integer;
BEGIN
  SELECT * INTO ord FROM public.p2p_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF ord.buyer_user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the buyer can mark this payment as sent';
  END IF;
  IF ord.status <> 'payment_pending' THEN RAISE EXCEPTION 'Order is not awaiting payment'; END IF;
  IF ord.payment_deadline IS NOT NULL AND ord.payment_deadline < now() THEN RAISE EXCEPTION 'Payment deadline has passed'; END IF;
  IF _utr IS NULL OR length(trim(_utr)) < 4 THEN RAISE EXCEPTION 'Enter the payment reference / UTR'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Enter the paid INR amount'; END IF;
  IF _proof_url IS NULL OR length(trim(_proof_url)) < 10 THEN RAISE EXCEPTION 'Upload payment proof before marking payment sent'; END IF;

  SELECT COALESCE((value #>> '{}')::integer, 15) INTO conf_minutes
    FROM public.system_settings WHERE key = 'p2p_seller_confirm_timeout_minutes';
  conf_minutes := COALESCE(conf_minutes, public.get_numeric_setting('p2p_confirm_window_minutes', 15)::integer, 15);

  UPDATE public.p2p_orders
     SET status = 'payment_submitted', utr_reference = trim(_utr), payment_reference = trim(_utr),
         paid_amount_inr = _amount, proof_url = _proof_url, payment_proof_path = _proof_url,
         paid_at = now(), payment_submitted_at = now(),
         confirm_deadline = now() + make_interval(mins => conf_minutes),
         seller_confirmation_deadline = now() + make_interval(mins => conf_minutes)
   WHERE id = ord.id;

  PERFORM public.record_p2p_system_event(ord.id, auth.uid(), ord.status, 'payment_submitted',
    'Buyer submitted payment evidence. UTR ' || trim(_utr));
  INSERT INTO public.notifications (user_id, audience, title, body, severity)
  VALUES (ord.seller_id, 'trader', 'Payment submitted',
    ord.order_ref || ': confirm receipt or dispute before the deadline', 'warning');
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.p2p_release_escrow(_order_id uuid, _actor_id uuid, _actor_type text, _note text)
RETURNS TABLE(released numeric, seller_fee numeric, buyer_fee numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ord public.p2p_orders; seller public.profiles; buyer public.profiles;
  escrow_total numeric; buyer_credit numeric; rel_key text;
BEGIN
  SELECT * INTO ord FROM public.p2p_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF ord.escrow_settled THEN RAISE EXCEPTION 'Escrow for this order is already settled'; END IF;
  IF ord.status NOT IN ('payment_sent','payment_submitted','payment_verifying','payment_received','release_pending') THEN
    RAISE EXCEPTION 'Order is not ready for release';
  END IF;
  IF EXISTS (SELECT 1 FROM public.p2p_disputes d WHERE d.order_id = ord.id AND d.status IN ('open','evidence_requested')) THEN
    RAISE EXCEPTION 'Order is disputed';
  END IF;
  escrow_total := COALESCE(ord.escrow_amount_usdt, ord.usdt_amount + COALESCE(ord.seller_fee_usdt, ord.fee_usdt, 0));
  buyer_credit := ord.usdt_amount - COALESCE(ord.buyer_fee_usdt, 0);
  IF buyer_credit <= 0 THEN RAISE EXCEPTION 'Buyer credit is invalid'; END IF;
  rel_key := 'p2p-release-' || ord.id::text;

  UPDATE public.p2p_orders
     SET status = 'release_pending', release_idempotency_key = COALESCE(release_idempotency_key, rel_key)
   WHERE id = ord.id;

  SELECT * INTO seller FROM public.profiles WHERE id = ord.seller_id FOR UPDATE;
  UPDATE public.profiles SET locked_balance = GREATEST(locked_balance - escrow_total, 0)
   WHERE id = ord.seller_id RETURNING * INTO seller;
  PERFORM public.write_ledger(ord.seller_id, ord.id, 'escrow_release', 'locked', -escrow_total,
    seller.locked_balance + escrow_total, seller.locked_balance,
    'Escrow released for ' || ord.order_ref);
  IF COALESCE(ord.seller_fee_usdt, ord.fee_usdt, 0) > 0 THEN
    PERFORM public.write_ledger(ord.seller_id, ord.id, 'fee', 'locked',
      -COALESCE(ord.seller_fee_usdt, ord.fee_usdt, 0), seller.locked_balance, seller.locked_balance,
      'Seller P2P fee for ' || ord.order_ref);
  END IF;

  IF ord.buyer_user_id IS NOT NULL THEN
    SELECT * INTO buyer FROM public.profiles WHERE id = ord.buyer_user_id FOR UPDATE;
    UPDATE public.profiles SET balance = balance + buyer_credit WHERE id = buyer.id RETURNING * INTO buyer;
    PERFORM public.write_ledger(buyer.id, ord.id, 'p2p_buy', 'available', buyer_credit,
      buyer.balance - buyer_credit, buyer.balance, 'USDT received for ' || ord.order_ref);
    IF COALESCE(ord.buyer_fee_usdt, 0) > 0 THEN
      PERFORM public.write_ledger(buyer.id, ord.id, 'fee', 'available', -ord.buyer_fee_usdt,
        buyer.balance, buyer.balance, 'Buyer P2P fee for ' || ord.order_ref);
    END IF;
  END IF;

  UPDATE public.p2p_orders
     SET status = 'completed', escrow_settled = true, escrow_locked = false, completed_at = now()
   WHERE id = ord.id;
  UPDATE public.merchants SET completed_orders = completed_orders + 1 WHERE id = ord.merchant_id;
  PERFORM public.record_p2p_system_event(ord.id, _actor_id, ord.status, 'completed', _note);
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (_actor_id, COALESCE(_actor_type, 'system'), 'p2p.escrow_released', 'p2p_order', ord.id::text,
    jsonb_build_object('amount', ord.usdt_amount, 'seller_fee', ord.seller_fee_usdt, 'buyer_fee', ord.buyer_fee_usdt));
  RETURN QUERY SELECT buyer_credit, COALESCE(ord.seller_fee_usdt, ord.fee_usdt, 0), COALESCE(ord.buyer_fee_usdt, 0);
END; $$;
REVOKE ALL ON FUNCTION public.p2p_release_escrow(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.p2p_confirm_payment_received(_order_id uuid)
RETURNS TABLE(released numeric, fee numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord public.p2p_orders; res record;
BEGIN
  SELECT * INTO ord FROM public.p2p_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF ord.seller_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the seller can release this escrow';
  END IF;
  IF ord.status NOT IN ('payment_sent','payment_submitted','payment_verifying','payment_received') THEN
    RAISE EXCEPTION 'Buyer has not submitted payment evidence yet';
  END IF;
  UPDATE public.p2p_orders SET status = 'payment_received' WHERE id = ord.id;
  SELECT * INTO res FROM public.p2p_release_escrow(ord.id, auth.uid(), CASE WHEN public.is_admin() THEN 'admin' ELSE 'user' END,
    'Seller confirmed INR receipt. Escrow released.');
  RETURN QUERY SELECT res.released::numeric, res.seller_fee::numeric;
END; $$;

CREATE OR REPLACE FUNCTION public.p2p_cancel_order(_order_id uuid, _reason text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord public.p2p_orders; seller public.profiles; escrow_total numeric;
BEGIN
  SELECT * INTO ord FROM public.p2p_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF ord.seller_id <> auth.uid() AND ord.buyer_user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not your order';
  END IF;
  IF ord.escrow_settled THEN RAISE EXCEPTION 'Order is already settled'; END IF;
  IF ord.status NOT IN ('payment_pending','created','escrow_locked') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Cannot cancel after the buyer submitted payment - raise a dispute instead';
  END IF;
  escrow_total := COALESCE(ord.escrow_amount_usdt, ord.usdt_amount + COALESCE(ord.seller_fee_usdt, ord.fee_usdt, 0));
  SELECT * INTO seller FROM public.profiles WHERE id = ord.seller_id FOR UPDATE;
  UPDATE public.profiles
     SET locked_balance = GREATEST(locked_balance - escrow_total, 0),
         balance = balance + escrow_total
   WHERE id = ord.seller_id RETURNING * INTO seller;
  PERFORM public.write_ledger(ord.seller_id, ord.id, 'escrow_refund', 'available', escrow_total,
    seller.balance - escrow_total, seller.balance, 'Escrow refunded for ' || ord.order_ref);
  UPDATE public.p2p_orders
     SET status = 'cancelled', escrow_settled = true, escrow_locked = false,
         cancelled_at = now(), cancel_reason = _reason
   WHERE id = ord.id;
  IF ord.advertisement_id IS NOT NULL THEN
    UPDATE public.p2p_advertisements
       SET available_usdt = available_usdt + ord.usdt_amount,
           reserved_usdt = GREATEST(reserved_usdt - ord.usdt_amount, 0),
           is_active = true,
           closed_at = NULL
     WHERE id = ord.advertisement_id;
  END IF;
  PERFORM public.record_p2p_system_event(ord.id, auth.uid(), ord.status, 'cancelled', COALESCE(_reason, 'Order cancelled'));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.p2p_raise_dispute(
  _order_id uuid, _reason text, _details text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord public.p2p_orders; new_id uuid;
BEGIN
  SELECT * INTO ord FROM public.p2p_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF ord.seller_id <> auth.uid() AND ord.buyer_user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not your order';
  END IF;
  IF ord.escrow_settled THEN RAISE EXCEPTION 'Order is already settled'; END IF;
  INSERT INTO public.p2p_disputes (order_id, raised_by, reason, details)
  VALUES (ord.id, auth.uid(), _reason, _details)
  RETURNING id INTO new_id;
  UPDATE public.p2p_orders SET status = 'disputed', disputed_at = now() WHERE id = ord.id;
  PERFORM public.record_p2p_system_event(ord.id, auth.uid(), ord.status, 'disputed', 'Dispute opened: ' || _reason);
  INSERT INTO public.notifications (audience, title, body, severity)
  VALUES ('admin', 'Dispute opened', ord.order_ref || ': ' || _reason, 'error');
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.expire_p2p_orders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord record; affected integer := 0; seller public.profiles; escrow_total numeric;
BEGIN
  FOR ord IN
    SELECT * FROM public.p2p_orders
    WHERE status = 'payment_pending' AND payment_deadline IS NOT NULL AND payment_deadline < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    escrow_total := COALESCE(ord.escrow_amount_usdt, ord.usdt_amount + COALESCE(ord.seller_fee_usdt, ord.fee_usdt, 0));
    SELECT * INTO seller FROM public.profiles WHERE id = ord.seller_id FOR UPDATE;
    UPDATE public.profiles SET locked_balance = GREATEST(locked_balance - escrow_total, 0),
      balance = balance + escrow_total WHERE id = ord.seller_id RETURNING * INTO seller;
    PERFORM public.write_ledger(ord.seller_id, ord.id, 'escrow_refund', 'available', escrow_total,
      seller.balance - escrow_total, seller.balance, 'Escrow expired for ' || ord.order_ref);
    UPDATE public.p2p_orders SET status = 'expired', escrow_settled = true, escrow_locked = false,
      expired_at = now(), cancelled_at = now(), cancel_reason = 'Payment window expired' WHERE id = ord.id;
    IF ord.advertisement_id IS NOT NULL THEN
      UPDATE public.p2p_advertisements SET available_usdt = available_usdt + ord.usdt_amount,
        reserved_usdt = GREATEST(reserved_usdt - ord.usdt_amount, 0), is_active = true, closed_at = NULL
      WHERE id = ord.advertisement_id;
    END IF;
    PERFORM public.record_p2p_system_event(ord.id, NULL, ord.status, 'expired', 'Payment window expired. Escrow returned to seller.');
    affected := affected + 1;
  END LOOP;
  RETURN affected;
END; $$;

CREATE OR REPLACE FUNCTION public.auto_release_p2p_orders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord record; affected integer := 0; enabled boolean;
BEGIN
  enabled := public.get_boolean_setting('p2p_auto_release_enabled', true);
  IF NOT enabled THEN RETURN 0; END IF;
  FOR ord IN
    SELECT o.*
    FROM public.p2p_orders o
    WHERE o.status IN ('payment_submitted','payment_sent')
      AND o.seller_confirmation_deadline IS NOT NULL
      AND o.seller_confirmation_deadline < now()
      AND o.escrow_locked = true
      AND o.escrow_settled = false
      AND o.utr_reference IS NOT NULL
      AND o.paid_amount_inr IS NOT NULL
      AND o.payment_proof_path IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.p2p_disputes d WHERE d.order_id = o.id AND d.status IN ('open','evidence_requested'))
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.p2p_release_escrow(ord.id, NULL, 'system', 'Seller confirmation deadline passed. Eligible escrow auto-released.');
    affected := affected + 1;
  END LOOP;
  RETURN affected;
END; $$;

CREATE OR REPLACE FUNCTION public.process_order_timers()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE expired_count integer; released_count integer; direct_count integer; vendor_expired integer;
BEGIN
  SELECT public.expire_p2p_orders() INTO expired_count;
  SELECT public.auto_release_p2p_orders() INTO released_count;
  SELECT public.auto_approve_direct_sell_payment_items() INTO direct_count;
  SELECT public.expire_vendor_orders() INTO vendor_expired;
  RETURN jsonb_build_object(
    'p2p_expired', expired_count,
    'p2p_auto_released', released_count,
    'direct_sell_auto_approved', direct_count,
    'vendor_expired', vendor_expired
  );
END; $$;

DROP FUNCTION IF EXISTS public.create_direct_sell_order(numeric);

CREATE OR REPLACE FUNCTION public.create_direct_sell_order(_amount numeric, _payment_method_id uuid DEFAULT NULL)
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
  pm public.payment_methods;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF _payment_method_id IS NULL THEN RAISE EXCEPTION 'Select a saved UPI payment method'; END IF;
  SELECT * INTO pm FROM public.payment_methods WHERE id = _payment_method_id AND user_id = auth.uid();
  IF pm.id IS NULL OR pm.kind <> 'upi' THEN RAISE EXCEPTION 'Select one of your own UPI payment methods'; END IF;

  SELECT (value #>> '{}')::public.chain_network INTO active_network FROM public.system_settings WHERE key = 'active_network';
  active_network := COALESCE(active_network, 'trc20-nile');
  SELECT COALESCE((value #>> '{}')::integer, 16) INTO required_conf FROM public.system_settings WHERE key = 'required_confirmations';
  SELECT COALESCE((value #>> '{}')::integer, 120) INTO expiry_minutes FROM public.system_settings WHERE key = 'deposit_expiry_minutes';
  rate := COALESCE(public.get_numeric_setting('wtron_buy_rate_inr', 0), public.get_numeric_setting('direct_sell_rate_inr', 0));
  IF rate <= 0 THEN
    rate := public.get_numeric_setting('direct_sell_rate_inr', 0);
  END IF;
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
     expected_inr, assigned_company_address, required_confirmations, expires_at, payment_method_id)
  VALUES
    (auth.uid(), wallet.id, wallet.network, _amount, _amount, rate,
     round(_amount * rate, 2), wallet.address, required_conf,
     now() + make_interval(mins => COALESCE(expiry_minutes, 120)), pm.id)
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
    jsonb_build_object('amount', _amount, 'rate', rate, 'deposit_request_id', dep.id, 'payment_method_id', pm.id));

  RETURN QUERY SELECT sell.id, sell.order_ref, dep.id, wallet.address, sell.expected_inr;
END; $$;

CREATE OR REPLACE FUNCTION public.create_direct_sell_payment_item(
  _order_id uuid, _amount_inr numeric, _utr text, _proof_path text DEFAULT NULL)
RETURNS public.direct_sell_payment_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord public.direct_sell_orders; item public.direct_sell_payment_items; minutes integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrator access required'; END IF;
  SELECT * INTO ord FROM public.direct_sell_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Direct sell order not found'; END IF;
  IF ord.status NOT IN ('inr_payment_pending','payment_assigned','inr_payment_sent','payment_verifying') THEN
    RAISE EXCEPTION 'Direct sell order is not ready for INR payment';
  END IF;
  IF _amount_inr IS NULL OR _amount_inr <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;
  minutes := public.get_numeric_setting('direct_sell_payment_confirm_timeout_minutes', 15)::integer;
  INSERT INTO public.direct_sell_payment_items
    (direct_sell_order_id, user_id, amount_inr, utr_reference, proof_path, status, confirmation_deadline, created_by)
  VALUES (ord.id, ord.user_id, _amount_inr, trim(_utr), _proof_path, 'sent', now() + make_interval(mins => minutes), auth.uid())
  RETURNING * INTO item;
  UPDATE public.direct_sell_orders SET status = 'inr_payment_sent', payment_reference = trim(_utr) WHERE id = ord.id;
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'admin', 'direct_sell.payment_item.sent', 'direct_sell_payment_item', item.id::text,
    jsonb_build_object('order_id', ord.id, 'amount_inr', _amount_inr, 'utr', _utr));
  RETURN item;
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_direct_sell_payment_item(_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item public.direct_sell_payment_items; total_confirmed numeric; ord public.direct_sell_orders;
BEGIN
  SELECT * INTO item FROM public.direct_sell_payment_items WHERE id = _item_id FOR UPDATE;
  IF item.id IS NULL THEN RAISE EXCEPTION 'Payment item not found'; END IF;
  IF item.user_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'Not your payment item'; END IF;
  IF item.status <> 'sent' THEN RAISE EXCEPTION 'Payment item cannot be confirmed from current state'; END IF;
  UPDATE public.direct_sell_payment_items SET status = 'confirmed', confirmed_at = now() WHERE id = item.id;
  SELECT * INTO ord FROM public.direct_sell_orders WHERE id = item.direct_sell_order_id FOR UPDATE;
  SELECT COALESCE(sum(amount_inr), 0) INTO total_confirmed
    FROM public.direct_sell_payment_items
    WHERE direct_sell_order_id = ord.id AND status IN ('confirmed','auto_approved');
  IF total_confirmed >= ord.expected_inr THEN
    UPDATE public.direct_sell_orders SET status = 'completed', completed_at = now() WHERE id = ord.id;
    INSERT INTO public.ledger_entries (user_id, entry_type, bucket, currency, amount, balance_before, balance_after, memo)
    VALUES (ord.user_id, 'direct_sell', 'settlement', 'INR', ord.expected_inr, 0, 0, 'Direct sell INR settlement ' || ord.order_ref);
  ELSE
    UPDATE public.direct_sell_orders SET status = 'payment_verifying' WHERE id = ord.id;
  END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.dispute_direct_sell_payment_item(_item_id uuid, _reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item public.direct_sell_payment_items;
BEGIN
  SELECT * INTO item FROM public.direct_sell_payment_items WHERE id = _item_id FOR UPDATE;
  IF item.id IS NULL THEN RAISE EXCEPTION 'Payment item not found'; END IF;
  IF item.user_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'Not your payment item'; END IF;
  IF item.status <> 'sent' THEN RAISE EXCEPTION 'Payment item cannot be disputed from current state'; END IF;
  UPDATE public.direct_sell_payment_items
    SET status = 'disputed', disputed_at = now(), dispute_reason = _reason
    WHERE id = item.id;
  UPDATE public.direct_sell_orders SET status = 'manual_review' WHERE id = item.direct_sell_order_id;
  INSERT INTO public.notifications (audience, title, body, severity)
  VALUES ('admin', 'Direct sell payment disputed', 'Payment item ' || item.id::text || ': ' || _reason, 'error');
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.auto_approve_direct_sell_payment_items()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item record; affected integer := 0; enabled boolean; total_confirmed numeric; ord public.direct_sell_orders;
BEGIN
  enabled := public.get_boolean_setting('direct_sell_auto_approve_enabled', true);
  IF NOT enabled THEN RETURN 0; END IF;
  FOR item IN
    SELECT * FROM public.direct_sell_payment_items
    WHERE status = 'sent' AND confirmation_deadline IS NOT NULL AND confirmation_deadline < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.direct_sell_payment_items SET status = 'auto_approved', confirmed_at = now() WHERE id = item.id;
    SELECT * INTO ord FROM public.direct_sell_orders WHERE id = item.direct_sell_order_id FOR UPDATE;
    SELECT COALESCE(sum(amount_inr), 0) INTO total_confirmed
      FROM public.direct_sell_payment_items
      WHERE direct_sell_order_id = ord.id AND status IN ('confirmed','auto_approved');
    IF total_confirmed >= ord.expected_inr THEN
      UPDATE public.direct_sell_orders SET status = 'completed', completed_at = now() WHERE id = ord.id;
      INSERT INTO public.ledger_entries (user_id, entry_type, bucket, currency, amount, balance_before, balance_after, memo)
      VALUES (ord.user_id, 'direct_sell', 'settlement', 'INR', ord.expected_inr, 0, 0, 'Direct sell INR settlement ' || ord.order_ref)
      ON CONFLICT DO NOTHING;
    ELSE
      UPDATE public.direct_sell_orders SET status = 'payment_verifying' WHERE id = ord.id;
    END IF;
    affected := affected + 1;
  END LOOP;
  RETURN affected;
END; $$;

CREATE OR REPLACE FUNCTION public.create_vendor_order(
  _listing_id uuid, _usdt numeric, _rail text)
RETURNS public.vendor_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE listing public.vendor_listings; vendor public.trading_vendors; acct public.vendor_payment_accounts;
  ord public.vendor_orders; total numeric; pay_minutes integer; buyer_fee numeric; vendor_fee numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO listing FROM public.vendor_listings WHERE id = _listing_id FOR UPDATE;
  IF listing.id IS NULL OR listing.status <> 'active' THEN RAISE EXCEPTION 'Vendor listing is not available'; END IF;
  SELECT * INTO vendor FROM public.trading_vendors WHERE id = listing.vendor_id FOR UPDATE;
  IF vendor.status <> 'approved' THEN RAISE EXCEPTION 'Vendor is not approved'; END IF;
  IF vendor.user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot take your own vendor listing'; END IF;
  IF _rail IS NULL OR NOT (_rail = ANY(listing.payment_rails)) THEN RAISE EXCEPTION 'Selected payment rail is unavailable'; END IF;
  IF _usdt IS NULL OR _usdt <= 0 OR _usdt > listing.available_usdt THEN RAISE EXCEPTION 'Invalid USDT amount'; END IF;
  total := round(_usdt * listing.rate_inr, 2);
  IF total < listing.min_order_inr OR total > listing.max_order_inr THEN RAISE EXCEPTION 'Order total is outside limits'; END IF;
  SELECT * INTO acct FROM public.vendor_payment_accounts
    WHERE vendor_id = vendor.id AND rail = _rail AND status = 'active'
    ORDER BY is_default DESC, created_at ASC LIMIT 1;
  IF acct.id IS NULL THEN RAISE EXCEPTION 'Vendor payment account is not configured'; END IF;
  pay_minutes := public.get_numeric_setting('vendor_payment_timeout_minutes', 15)::integer;
  buyer_fee := public.calculate_percent_fee(_usdt, 'vendor_buyer_fee_percent', 0.5);
  vendor_fee := public.calculate_percent_fee(_usdt, 'vendor_seller_fee_percent', 0.5);
  INSERT INTO public.vendor_orders
    (listing_id, vendor_id, buyer_user_id, usdt_amount, rate_inr, total_inr, buyer_fee_usdt,
     vendor_fee_usdt, payment_rail, payment_account_snapshot, status, payment_deadline)
  VALUES
    (listing.id, vendor.id, auth.uid(), _usdt, listing.rate_inr, total, buyer_fee,
     vendor_fee, _rail, jsonb_build_object('rail', acct.rail, 'account_ref', acct.account_ref,
       'holder_name', acct.holder_name, 'bank_name', acct.bank_name, 'ifsc', acct.ifsc),
     'payment_pending', now() + make_interval(mins => pay_minutes))
  RETURNING * INTO ord;
  UPDATE public.vendor_listings SET available_usdt = available_usdt - _usdt, reserved_usdt = reserved_usdt + _usdt,
    status = CASE WHEN available_usdt - _usdt <= 0 THEN 'paused' ELSE status END
  WHERE id = listing.id;
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'user', 'vendor.order.created', 'vendor_order', ord.id::text,
    jsonb_build_object('listing_id', listing.id, 'amount', _usdt));
  RETURN ord;
END; $$;

CREATE OR REPLACE FUNCTION public.submit_vendor_payment(
  _order_id uuid, _utr text, _amount numeric, _proof_path text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord public.vendor_orders;
BEGIN
  SELECT * INTO ord FROM public.vendor_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Vendor order not found'; END IF;
  IF ord.buyer_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the buyer can submit payment'; END IF;
  IF ord.status <> 'payment_pending' THEN RAISE EXCEPTION 'Order is not awaiting payment'; END IF;
  IF ord.payment_deadline IS NOT NULL AND ord.payment_deadline < now() THEN RAISE EXCEPTION 'Payment deadline has passed'; END IF;
  IF _utr IS NULL OR length(trim(_utr)) < 4 THEN RAISE EXCEPTION 'Enter UTR/payment reference'; END IF;
  UPDATE public.vendor_orders
    SET status = 'payment_submitted', utr_reference = trim(_utr), paid_amount_inr = _amount,
        payment_proof_path = _proof_path, payment_submitted_at = now()
    WHERE id = ord.id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_vendor_payment(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord public.vendor_orders; vendor public.trading_vendors; buyer public.profiles; credit numeric; rel_key text;
BEGIN
  SELECT * INTO ord FROM public.vendor_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Vendor order not found'; END IF;
  SELECT * INTO vendor FROM public.trading_vendors WHERE id = ord.vendor_id FOR UPDATE;
  IF vendor.user_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'Only vendor or admin can confirm payment'; END IF;
  IF ord.release_idempotency_key IS NOT NULL OR ord.status IN ('completed','confirmed') THEN RAISE EXCEPTION 'Vendor order already released'; END IF;
  IF ord.status <> 'payment_submitted' THEN RAISE EXCEPTION 'Payment evidence has not been submitted'; END IF;
  credit := ord.usdt_amount - COALESCE(ord.buyer_fee_usdt, 0);
  rel_key := 'vendor-release-' || ord.id::text;
  SELECT * INTO buyer FROM public.profiles WHERE id = ord.buyer_user_id FOR UPDATE;
  UPDATE public.profiles SET balance = balance + credit WHERE id = buyer.id RETURNING * INTO buyer;
  PERFORM public.write_ledger(buyer.id, NULL, 'p2p_buy', 'available', credit,
    buyer.balance - credit, buyer.balance, 'Vendor USDT purchase ' || ord.order_ref);
  IF COALESCE(ord.buyer_fee_usdt, 0) > 0 THEN
    PERFORM public.write_ledger(buyer.id, NULL, 'fee', 'available', -ord.buyer_fee_usdt,
      buyer.balance, buyer.balance, 'Vendor buyer fee ' || ord.order_ref);
  END IF;
  IF vendor.user_id IS NOT NULL AND COALESCE(ord.vendor_fee_usdt, 0) > 0 THEN
    PERFORM public.write_ledger(vendor.user_id, NULL, 'fee', 'available', -ord.vendor_fee_usdt,
      0, 0, 'Vendor seller fee ' || ord.order_ref);
  END IF;
  UPDATE public.vendor_orders SET status = 'completed', completed_at = now(), release_idempotency_key = rel_key WHERE id = ord.id;
  UPDATE public.vendor_listings SET reserved_usdt = GREATEST(reserved_usdt - ord.usdt_amount, 0) WHERE id = ord.listing_id;
  UPDATE public.trading_vendors SET completed_orders = completed_orders + 1 WHERE id = ord.vendor_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.dispute_vendor_order(_order_id uuid, _reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord public.vendor_orders; vendor public.trading_vendors;
BEGIN
  SELECT * INTO ord FROM public.vendor_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Vendor order not found'; END IF;
  SELECT * INTO vendor FROM public.trading_vendors WHERE id = ord.vendor_id;
  IF ord.buyer_user_id <> auth.uid() AND vendor.user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized for this vendor order';
  END IF;
  IF ord.status IN ('completed','cancelled','expired') THEN RAISE EXCEPTION 'Vendor order is already final'; END IF;
  UPDATE public.vendor_orders SET status = 'disputed', disputed_at = now() WHERE id = ord.id;
  UPDATE public.trading_vendors SET disputed_orders = disputed_orders + 1 WHERE id = ord.vendor_id;
  INSERT INTO public.notifications (audience, title, body, severity)
  VALUES ('admin', 'Vendor trade disputed', ord.order_ref || ': ' || _reason, 'error');
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.expire_vendor_orders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord record; affected integer := 0;
BEGIN
  FOR ord IN
    SELECT * FROM public.vendor_orders
    WHERE status = 'payment_pending' AND payment_deadline IS NOT NULL AND payment_deadline < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.vendor_orders SET status = 'expired', expired_at = now() WHERE id = ord.id;
    UPDATE public.vendor_listings
      SET available_usdt = available_usdt + ord.usdt_amount,
          reserved_usdt = GREATEST(reserved_usdt - ord.usdt_amount, 0),
          status = CASE WHEN status = 'paused' THEN 'active' ELSE status END
      WHERE id = ord.listing_id;
    affected := affected + 1;
  END LOOP;
  RETURN affected;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_upsert_trading_vendor(
  _vendor_id uuid,
  _name text,
  _user_id uuid DEFAULT NULL,
  _status text DEFAULT 'approved',
  _risk_state text DEFAULT 'normal')
RETURNS public.trading_vendors
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE vendor public.trading_vendors;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrator access required'; END IF;
  IF _vendor_id IS NULL THEN
    INSERT INTO public.trading_vendors (name, user_id, status, risk_state)
    VALUES (_name, _user_id, _status, _risk_state)
    RETURNING * INTO vendor;
  ELSE
    UPDATE public.trading_vendors
      SET name = _name, user_id = _user_id, status = _status, risk_state = _risk_state
      WHERE id = _vendor_id
      RETURNING * INTO vendor;
  END IF;
  RETURN vendor;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_upsert_vendor_listing(
  _listing_id uuid,
  _vendor_id uuid,
  _rate_inr numeric,
  _available_usdt numeric,
  _min_order_inr numeric,
  _max_order_inr numeric,
  _payment_rails text[],
  _status text DEFAULT 'active')
RETURNS public.vendor_listings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE listing public.vendor_listings;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrator access required'; END IF;
  IF _listing_id IS NULL THEN
    INSERT INTO public.vendor_listings (vendor_id, rate_inr, available_usdt, min_order_inr, max_order_inr, payment_rails, status)
    VALUES (_vendor_id, _rate_inr, _available_usdt, _min_order_inr, _max_order_inr, _payment_rails, _status)
    RETURNING * INTO listing;
  ELSE
    UPDATE public.vendor_listings
      SET vendor_id = _vendor_id, rate_inr = _rate_inr, available_usdt = _available_usdt,
          min_order_inr = _min_order_inr, max_order_inr = _max_order_inr,
          payment_rails = _payment_rails, status = _status
      WHERE id = _listing_id
      RETURNING * INTO listing;
  END IF;
  RETURN listing;
END; $$;

GRANT EXECUTE ON FUNCTION public.p2p_create_ad(public.p2p_side,numeric,numeric,numeric,numeric,text[],text,boolean,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p2p_update_ad(uuid,numeric,numeric,numeric,numeric,text[],text,boolean,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p2p_create_order_from_ad(uuid,numeric,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p2p_mark_payment_sent(uuid,text,numeric,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p2p_confirm_payment_received(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p2p_cancel_order(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p2p_raise_dispute(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_p2p_orders() TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_release_p2p_orders() TO service_role;
GRANT EXECUTE ON FUNCTION public.process_order_timers() TO service_role;
GRANT EXECUTE ON FUNCTION public.create_direct_sell_order(numeric,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_direct_sell_payment_item(uuid,numeric,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_direct_sell_payment_item(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispute_direct_sell_payment_item(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_approve_direct_sell_payment_items() TO service_role;
GRANT EXECUTE ON FUNCTION public.create_vendor_order(uuid,numeric,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_vendor_payment(uuid,text,numeric,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_vendor_payment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispute_vendor_order(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_vendor_orders() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_trading_vendor(uuid,text,uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_vendor_listing(uuid,uuid,numeric,numeric,numeric,numeric,text[],text) TO authenticated, service_role;
