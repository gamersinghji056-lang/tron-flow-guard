-- Production API/webhook/P2P/withdrawal completion.
-- This migration extends existing RPCs and tables without replacing the
-- blockchain listener, transaction dedupe, deposit matching, or credit RPCs.

ALTER TYPE public.p2p_order_status ADD VALUE IF NOT EXISTS 'payment_submitted';
ALTER TYPE public.p2p_order_status ADD VALUE IF NOT EXISTS 'payment_verifying';
ALTER TYPE public.p2p_order_status ADD VALUE IF NOT EXISTS 'release_pending';
ALTER TYPE public.p2p_order_status ADD VALUE IF NOT EXISTS 'refunded';
ALTER TYPE public.direct_sell_status ADD VALUE IF NOT EXISTS 'payment_verifying';

ALTER TABLE public.api_keys
  ALTER COLUMN permissions SET DEFAULT ARRAY[
    'deposit:create',
    'deposit:read',
    'transaction:read',
    'balance:read',
    'direct_sell:create',
    'direct_sell:read'
  ];

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS total_debit numeric(24,6) GENERATED ALWAYS AS (amount + fee) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_idempotency_user_key
  ON public.withdrawal_requests(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  method text NOT NULL DEFAULT 'upi',
  account_ref text NOT NULL,
  holder_name text,
  min_inr numeric(24,2) NOT NULL DEFAULT 0,
  max_inr numeric(24,2) NOT NULL DEFAULT 1000000,
  daily_limit_inr numeric(24,2) NOT NULL DEFAULT 10000000,
  reserved_inr numeric(24,2) NOT NULL DEFAULT 0,
  sent_today_inr numeric(24,2) NOT NULL DEFAULT 0,
  success_rate numeric(6,2) NOT NULL DEFAULT 100,
  risk_state text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'available',
  is_online boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_sources TO authenticated;
GRANT ALL ON public.payment_sources TO service_role;
ALTER TABLE public.payment_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_sources_admin_select ON public.payment_sources
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE TRIGGER payment_sources_touch BEFORE UPDATE ON public.payment_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.payment_source_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.payment_sources(id) ON DELETE CASCADE,
  direct_sell_order_id uuid NOT NULL REFERENCES public.direct_sell_orders(id) ON DELETE CASCADE,
  amount_inr numeric(24,2) NOT NULL CHECK (amount_inr > 0),
  status text NOT NULL DEFAULT 'reserved',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(direct_sell_order_id)
);

GRANT SELECT ON public.payment_source_reservations TO authenticated;
GRANT ALL ON public.payment_source_reservations TO service_role;
ALTER TABLE public.payment_source_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_reservations_admin_or_owner ON public.payment_source_reservations
  FOR SELECT TO authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.direct_sell_orders d
      WHERE d.id = direct_sell_order_id AND d.user_id = auth.uid()
    )
  );
CREATE TRIGGER payment_source_reservations_touch BEFORE UPDATE ON public.payment_source_reservations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_user_merchant(_user_id uuid)
RETURNS public.merchants
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mer public.merchants;
  prof public.profiles;
BEGIN
  SELECT * INTO mer FROM public.merchants WHERE user_id = _user_id LIMIT 1;
  IF mer.id IS NOT NULL THEN RETURN mer; END IF;

  SELECT * INTO prof FROM public.profiles WHERE id = _user_id;
  INSERT INTO public.merchants (user_id, merchant_code, display_name, status)
  VALUES (
    _user_id,
    'USR-' || upper(substr(replace(_user_id::text, '-', ''), 1, 10)),
    COALESCE(NULLIF(prof.full_name, ''), prof.email, 'User'),
    'approved'
  )
  RETURNING * INTO mer;
  RETURN mer;
END; $$;

REVOKE ALL ON FUNCTION public.ensure_user_merchant(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.p2p_create_ad(
  _side public.p2p_side,
  _price numeric,
  _available_usdt numeric,
  _min_order_inr numeric,
  _max_order_inr numeric,
  _payment_methods text[] DEFAULT ARRAY['upi'],
  _terms text DEFAULT NULL,
  _is_active boolean DEFAULT true
)
RETURNS public.p2p_advertisements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mer public.merchants;
  prof public.profiles;
  ad public.p2p_advertisements;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _price IS NULL OR _price <= 0 THEN RAISE EXCEPTION 'Price must be greater than zero'; END IF;
  IF _available_usdt IS NULL OR _available_usdt <= 0 THEN RAISE EXCEPTION 'Available amount must be greater than zero'; END IF;
  IF _min_order_inr IS NULL OR _max_order_inr IS NULL OR _min_order_inr <= 0 OR _min_order_inr > _max_order_inr THEN
    RAISE EXCEPTION 'Invalid order limits';
  END IF;
  SELECT * INTO prof FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF _side = 'sell' AND prof.balance < _available_usdt THEN
    RAISE EXCEPTION 'Insufficient available balance for sell advertisement';
  END IF;

  mer := public.ensure_user_merchant(auth.uid());
  INSERT INTO public.p2p_advertisements
    (merchant_id, side, price_inr, available_usdt, min_order_inr, max_order_inr,
     payment_methods, terms, is_active)
  VALUES
    (mer.id, _side, _price, _available_usdt, _min_order_inr, _max_order_inr,
     COALESCE(_payment_methods, ARRAY['upi']), _terms, COALESCE(_is_active, true))
  RETURNING * INTO ad;

  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'user', 'p2p.ad.created', 'p2p_advertisement', ad.id::text,
    jsonb_build_object('side', _side, 'available_usdt', _available_usdt, 'price', _price));
  RETURN ad;
END; $$;

CREATE OR REPLACE FUNCTION public.p2p_update_ad(
  _ad_id uuid,
  _price numeric,
  _available_usdt numeric,
  _min_order_inr numeric,
  _max_order_inr numeric,
  _payment_methods text[] DEFAULT NULL,
  _terms text DEFAULT NULL,
  _is_active boolean DEFAULT NULL
)
RETURNS public.p2p_advertisements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ad public.p2p_advertisements; mer public.merchants; prof public.profiles;
BEGIN
  SELECT * INTO ad FROM public.p2p_advertisements WHERE id = _ad_id FOR UPDATE;
  IF ad.id IS NULL THEN RAISE EXCEPTION 'Advertisement not found'; END IF;
  SELECT * INTO mer FROM public.merchants WHERE id = ad.merchant_id;
  IF mer.user_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'Not your advertisement'; END IF;
  IF _price <= 0 OR _available_usdt < 0 OR _min_order_inr <= 0 OR _min_order_inr > _max_order_inr THEN
    RAISE EXCEPTION 'Invalid advertisement values';
  END IF;
  SELECT * INTO prof FROM public.profiles WHERE id = mer.user_id FOR UPDATE;
  IF ad.side = 'sell' AND prof.balance < _available_usdt THEN
    RAISE EXCEPTION 'Insufficient available balance for sell advertisement';
  END IF;
  UPDATE public.p2p_advertisements
    SET price_inr = _price,
        available_usdt = _available_usdt,
        min_order_inr = _min_order_inr,
        max_order_inr = _max_order_inr,
        payment_methods = COALESCE(_payment_methods, payment_methods),
        terms = _terms,
        is_active = COALESCE(_is_active, is_active)
    WHERE id = ad.id
    RETURNING * INTO ad;
  RETURN ad;
END; $$;

CREATE OR REPLACE FUNCTION public.p2p_set_ad_active(_ad_id uuid, _is_active boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mer public.merchants;
BEGIN
  SELECT m.* INTO mer
  FROM public.p2p_advertisements a
  JOIN public.merchants m ON m.id = a.merchant_id
  WHERE a.id = _ad_id;
  IF mer.id IS NULL THEN RAISE EXCEPTION 'Advertisement not found'; END IF;
  IF mer.user_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'Not your advertisement'; END IF;
  UPDATE public.p2p_advertisements SET is_active = _is_active WHERE id = _ad_id;
  RETURN true;
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
  new_order public.p2p_orders;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO ad FROM public.p2p_advertisements WHERE id = _advertisement_id FOR UPDATE;
  IF ad.id IS NULL OR NOT ad.is_active THEN RAISE EXCEPTION 'Advertisement is not available'; END IF;
  SELECT * INTO mer FROM public.merchants WHERE id = ad.merchant_id;
  IF mer.user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot take your own advertisement'; END IF;
  IF ad.side = 'buy' THEN
    IF _payment_method_id IS NULL THEN RAISE EXCEPTION 'Payment method is required'; END IF;
    RETURN QUERY SELECT * FROM public.p2p_create_sell_order(_advertisement_id, _usdt, _payment_method_id);
    RETURN;
  END IF;

  IF _usdt IS NULL OR _usdt <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF _usdt > ad.available_usdt THEN RAISE EXCEPTION 'Advertisement only has % USDT available', ad.available_usdt; END IF;
  total := round(_usdt * ad.price_inr, 2);
  IF total < ad.min_order_inr OR total > ad.max_order_inr THEN
    RAISE EXCEPTION 'Order total is outside advertisement limits';
  END IF;
  IF mer.user_id IS NULL THEN RAISE EXCEPTION 'Advertiser account is unavailable'; END IF;
  SELECT * INTO seller_pm FROM public.payment_methods
    WHERE user_id = mer.user_id AND kind = ANY(ad.payment_methods)
    ORDER BY is_default DESC, created_at ASC LIMIT 1;
  IF seller_pm.id IS NULL THEN RAISE EXCEPTION 'Seller has no eligible payment method'; END IF;

  SELECT * INTO seller_profile FROM public.profiles WHERE id = mer.user_id FOR UPDATE;
  IF seller_profile.balance < _usdt THEN RAISE EXCEPTION 'Seller no longer has sufficient balance'; END IF;
  SELECT COALESCE((value #>> '{}')::integer, 15) INTO pay_minutes
    FROM public.system_settings WHERE key = 'p2p_payment_window_minutes';

  INSERT INTO public.p2p_orders
    (advertisement_id, merchant_id, buyer_user_id, seller_id, side, usdt_amount, price_inr,
     total_inr, status, payment_method, payout_upi_id, payout_holder_name,
     escrow_locked, payment_deadline)
  VALUES (ad.id, mer.id, auth.uid(), mer.user_id, 'buy', _usdt, ad.price_inr, total,
          'payment_pending', seller_pm.kind, seller_pm.upi_id, seller_pm.holder_name,
          true, now() + make_interval(mins => COALESCE(pay_minutes, 15)))
  RETURNING * INTO new_order;

  UPDATE public.profiles
     SET balance = balance - _usdt, locked_balance = locked_balance + _usdt
   WHERE id = mer.user_id RETURNING * INTO seller_profile;
  PERFORM public.write_ledger(mer.user_id, new_order.id, 'escrow_lock', 'available', -_usdt,
    seller_profile.balance + _usdt, seller_profile.balance, 'Locked for ' || new_order.order_ref);

  UPDATE public.p2p_advertisements SET available_usdt = available_usdt - _usdt WHERE id = ad.id;
  UPDATE public.merchants SET total_orders = total_orders + 1 WHERE id = mer.id;
  INSERT INTO public.p2p_order_events (order_id, actor_id, to_status, note)
  VALUES (new_order.id, auth.uid(), 'payment_pending', 'Buy order created, seller USDT locked in escrow');
  INSERT INTO public.p2p_messages (order_id, sender_role, body, is_system)
  VALUES (new_order.id, 'system', 'Order created. Buyer must pay ' || total || ' INR to ' || seller_pm.upi_id || '.', true);

  RETURN QUERY SELECT new_order.id, new_order.order_ref, new_order.total_inr;
END; $$;

CREATE OR REPLACE FUNCTION public.p2p_send_message(_order_id uuid, _body text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord public.p2p_orders; msg_id uuid;
BEGIN
  SELECT * INTO ord FROM public.p2p_orders WHERE id = _order_id;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF ord.seller_id <> auth.uid() AND ord.buyer_user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not your order';
  END IF;
  IF _body IS NULL OR length(trim(_body)) < 1 THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
  INSERT INTO public.p2p_messages (order_id, sender_id, sender_role, body, is_system)
  VALUES (ord.id, auth.uid(), CASE WHEN public.is_admin() THEN 'admin' ELSE 'user' END, trim(_body), false)
  RETURNING id INTO msg_id;
  RETURN msg_id;
END; $$;

CREATE OR REPLACE FUNCTION public.expire_p2p_orders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord record; affected integer := 0; seller public.profiles;
BEGIN
  FOR ord IN
    SELECT * FROM public.p2p_orders
    WHERE status = 'payment_pending' AND payment_deadline IS NOT NULL AND payment_deadline < now()
    FOR UPDATE
  LOOP
    SELECT * INTO seller FROM public.profiles WHERE id = ord.seller_id FOR UPDATE;
    UPDATE public.profiles SET locked_balance = GREATEST(locked_balance - ord.usdt_amount, 0),
      balance = balance + ord.usdt_amount WHERE id = ord.seller_id RETURNING * INTO seller;
    PERFORM public.write_ledger(ord.seller_id, ord.id, 'escrow_refund', 'available', ord.usdt_amount,
      seller.balance - ord.usdt_amount, seller.balance, 'Escrow expired for ' || ord.order_ref);
    UPDATE public.p2p_orders SET status = 'expired', escrow_settled = true, escrow_locked = false,
      cancelled_at = now(), cancel_reason = 'Payment window expired' WHERE id = ord.id;
    IF ord.advertisement_id IS NOT NULL THEN
      UPDATE public.p2p_advertisements SET available_usdt = available_usdt + ord.usdt_amount
        WHERE id = ord.advertisement_id;
    END IF;
    INSERT INTO public.p2p_order_events (order_id, actor_type, from_status, to_status, note)
    VALUES (ord.id, 'system', ord.status, 'expired', 'Payment window expired');
    affected := affected + 1;
  END LOOP;
  RETURN affected;
END; $$;

CREATE OR REPLACE FUNCTION public.create_withdrawal_request(
  _to_address text,
  _amount numeric,
  _idempotency_key text DEFAULT NULL
)
RETURNS public.withdrawal_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  network public.chain_network;
  min_amount numeric;
  max_amount numeric;
  fee numeric;
  prof public.profiles;
  existing public.withdrawal_requests;
  withdrawal public.withdrawal_requests;
  before_balance numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _to_address IS NULL OR _to_address !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' THEN
    RAISE EXCEPTION 'Enter a valid TRON address';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.withdrawal_requests
      WHERE user_id = auth.uid() AND idempotency_key = _idempotency_key;
    IF existing.id IS NOT NULL THEN RETURN existing; END IF;
  END IF;

  SELECT COALESCE((value #>> '{}')::public.chain_network, 'trc20-nile') INTO network FROM public.system_settings WHERE key = 'active_network';
  SELECT COALESCE((value #>> '{}')::numeric, 1) INTO min_amount FROM public.system_settings WHERE key = 'withdrawal_min_usdt';
  SELECT COALESCE((value #>> '{}')::numeric, 1000000) INTO max_amount FROM public.system_settings WHERE key = 'withdrawal_max_usdt';
  SELECT COALESCE((value #>> '{}')::numeric, 1.5) INTO fee FROM public.system_settings WHERE key = 'fee_withdrawal_usdt';
  IF _amount < min_amount OR _amount > max_amount THEN
    RAISE EXCEPTION 'Withdrawal amount must be between % and % USDT', min_amount, max_amount;
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  before_balance := prof.balance;
  IF prof.balance < (_amount + fee) THEN RAISE EXCEPTION 'Insufficient available balance including fee'; END IF;
  UPDATE public.profiles SET balance = balance - (_amount + fee) WHERE id = auth.uid() RETURNING * INTO prof;

  INSERT INTO public.withdrawal_requests
    (user_id, network, to_address, amount, fee, idempotency_key, status)
  VALUES (auth.uid(), network, _to_address, _amount, fee, _idempotency_key, 'pending')
  RETURNING * INTO withdrawal;

  PERFORM public.write_ledger(auth.uid(), NULL, 'withdrawal', 'available', -(_amount + fee),
    before_balance, prof.balance, 'Withdrawal request ' || withdrawal.id::text);
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'user', 'withdrawal.created', 'withdrawal_request', withdrawal.id::text,
    jsonb_build_object('amount', _amount, 'fee', fee, 'to_address', _to_address));
  RETURN withdrawal;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_direct_sell_payment(_order_id uuid)
RETURNS public.payment_source_reservations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ord public.direct_sell_orders;
  src public.payment_sources;
  res public.payment_source_reservations;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrator access required'; END IF;
  SELECT * INTO ord FROM public.direct_sell_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Direct sell order not found'; END IF;
  IF ord.status NOT IN ('usdt_confirmed','inr_payment_pending') THEN
    RAISE EXCEPTION 'Order is not ready for INR payment assignment';
  END IF;
  SELECT * INTO src FROM public.payment_sources
    WHERE status = 'available'
      AND is_online
      AND risk_state IN ('normal','watch')
      AND ord.expected_inr BETWEEN min_inr AND max_inr
      AND (sent_today_inr + reserved_inr + ord.expected_inr) <= daily_limit_inr
    ORDER BY success_rate DESC, reserved_inr ASC, created_at ASC
    LIMIT 1 FOR UPDATE;
  IF src.id IS NULL THEN RAISE EXCEPTION 'No eligible payment source is available'; END IF;

  UPDATE public.payment_sources SET reserved_inr = reserved_inr + ord.expected_inr WHERE id = src.id;
  INSERT INTO public.payment_source_reservations (source_id, direct_sell_order_id, amount_inr)
  VALUES (src.id, ord.id, ord.expected_inr)
  ON CONFLICT (direct_sell_order_id) DO UPDATE SET updated_at = now()
  RETURNING * INTO res;

  UPDATE public.direct_sell_orders
    SET status = 'payment_assigned',
        payment_assignment = jsonb_build_object('source_id', src.id, 'label', src.label, 'method', src.method)
    WHERE id = ord.id;
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'admin', 'direct_sell.payment_assigned', 'direct_sell_order', ord.id::text,
    jsonb_build_object('source_id', src.id, 'amount_inr', ord.expected_inr));
  RETURN res;
END; $$;

CREATE OR REPLACE FUNCTION public.mark_direct_sell_payment_sent(_order_id uuid, _reference text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord public.direct_sell_orders; res public.payment_source_reservations; src public.payment_sources;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrator access required'; END IF;
  SELECT * INTO ord FROM public.direct_sell_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Direct sell order not found'; END IF;
  IF ord.status <> 'payment_assigned' THEN RAISE EXCEPTION 'Payment source is not assigned'; END IF;
  SELECT * INTO res FROM public.payment_source_reservations WHERE direct_sell_order_id = ord.id FOR UPDATE;
  SELECT * INTO src FROM public.payment_sources WHERE id = res.source_id FOR UPDATE;
  UPDATE public.payment_source_reservations SET status = 'payment_sent', payment_reference = _reference WHERE id = res.id;
  UPDATE public.payment_sources SET reserved_inr = GREATEST(reserved_inr - res.amount_inr, 0),
    sent_today_inr = sent_today_inr + res.amount_inr WHERE id = src.id;
  UPDATE public.direct_sell_orders SET status = 'inr_payment_sent', payment_reference = _reference WHERE id = ord.id;
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'admin', 'direct_sell.payment_sent', 'direct_sell_order', ord.id::text,
    jsonb_build_object('reference', _reference, 'amount_inr', ord.expected_inr));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_direct_sell_order(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord public.direct_sell_orders; res public.payment_source_reservations;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrator access required'; END IF;
  SELECT * INTO ord FROM public.direct_sell_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Direct sell order not found'; END IF;
  IF ord.status::text NOT IN ('inr_payment_sent','payment_verifying') THEN RAISE EXCEPTION 'Order cannot be completed from current state'; END IF;
  UPDATE public.payment_source_reservations SET status = 'settled' WHERE direct_sell_order_id = ord.id RETURNING * INTO res;
  UPDATE public.direct_sell_orders SET status = 'completed', completed_at = now() WHERE id = ord.id;
  INSERT INTO public.ledger_entries (user_id, entry_type, bucket, currency, amount, balance_before, balance_after, memo)
  VALUES (ord.user_id, 'direct_sell', 'settlement', 'INR', ord.expected_inr, 0, 0, 'Direct sell INR settlement ' || ord.order_ref);
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'admin', 'direct_sell.completed', 'direct_sell_order', ord.id::text,
    jsonb_build_object('expected_inr', ord.expected_inr, 'reservation_id', res.id));
  RETURN true;
END; $$;

GRANT EXECUTE ON FUNCTION public.p2p_create_ad(public.p2p_side,numeric,numeric,numeric,numeric,text[],text,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p2p_update_ad(uuid,numeric,numeric,numeric,numeric,text[],text,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p2p_set_ad_active(uuid,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p2p_create_order_from_ad(uuid,numeric,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p2p_send_message(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_p2p_orders() TO service_role;
GRANT EXECUTE ON FUNCTION public.create_withdrawal_request(text,numeric,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_direct_sell_payment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_direct_sell_payment_sent(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_direct_sell_order(uuid) TO authenticated, service_role;
