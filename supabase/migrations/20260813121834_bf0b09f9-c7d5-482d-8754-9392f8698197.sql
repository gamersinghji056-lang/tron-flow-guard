-- ─────────────────────────────── enums ───────────────────────────────
CREATE TYPE public.p2p_side AS ENUM ('buy','sell');
CREATE TYPE public.p2p_order_status AS ENUM (
  'created','escrow_locked','payment_pending','payment_sent','payment_received',
  'completed','cancelled','expired','disputed','admin_review');
CREATE TYPE public.dispute_status AS ENUM ('open','evidence_requested','resolved','rejected');
CREATE TYPE public.dispute_priority AS ENUM ('low','medium','high','critical');
CREATE TYPE public.merchant_status AS ENUM ('pending','approved','suspended');
CREATE TYPE public.ledger_entry_type AS ENUM (
  'deposit','withdrawal','p2p_buy','p2p_sell','fee','escrow_lock','escrow_release',
  'escrow_refund','transfer_in','transfer_out','adjustment');

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locked_balance numeric NOT NULL DEFAULT 0;

-- ───────────────────────────── payment methods ─────────────────────────
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'upi',
  upi_id text NOT NULL,
  holder_name text NOT NULL,
  bank_name text,
  is_default boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payment methods" ON public.payment_methods FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins read payment methods" ON public.payment_methods FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE TRIGGER payment_methods_touch BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────── merchants ─────────────────────────────
CREATE TABLE public.merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  merchant_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status public.merchant_status NOT NULL DEFAULT 'pending',
  min_order_inr numeric NOT NULL DEFAULT 10000,
  max_order_inr numeric NOT NULL DEFAULT 500000,
  fee_percent numeric NOT NULL DEFAULT 0,
  completed_orders integer NOT NULL DEFAULT 0,
  total_orders integer NOT NULL DEFAULT 0,
  risk_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.merchants TO authenticated;
GRANT ALL ON public.merchants TO service_role;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read approved merchants" ON public.merchants FOR SELECT TO authenticated
  USING (status = 'approved' OR public.is_admin() OR user_id = auth.uid());
CREATE TRIGGER merchants_touch BEFORE UPDATE ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ────────────────────────────── advertisements ─────────────────────────
CREATE TABLE public.p2p_advertisements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  side public.p2p_side NOT NULL DEFAULT 'buy',
  asset text NOT NULL DEFAULT 'USDT',
  fiat text NOT NULL DEFAULT 'INR',
  price_inr numeric NOT NULL,
  available_usdt numeric NOT NULL DEFAULT 0,
  min_order_inr numeric NOT NULL DEFAULT 10000,
  max_order_inr numeric NOT NULL DEFAULT 500000,
  payment_methods text[] NOT NULL DEFAULT ARRAY['upi'],
  is_active boolean NOT NULL DEFAULT true,
  terms text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.p2p_advertisements TO authenticated;
GRANT ALL ON public.p2p_advertisements TO service_role;
ALTER TABLE public.p2p_advertisements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read active ads" ON public.p2p_advertisements FOR SELECT TO authenticated
  USING (is_active OR public.is_admin());
CREATE TRIGGER p2p_ads_touch BEFORE UPDATE ON public.p2p_advertisements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ───────────────────────────────── orders ──────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.p2p_order_seq START 10001;

CREATE TABLE public.p2p_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref text NOT NULL UNIQUE DEFAULT ('ORD-' || nextval('public.p2p_order_seq')),
  advertisement_id uuid REFERENCES public.p2p_advertisements(id) ON DELETE SET NULL,
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL,
  buyer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  side public.p2p_side NOT NULL DEFAULT 'sell',
  usdt_amount numeric NOT NULL,
  price_inr numeric NOT NULL,
  total_inr numeric NOT NULL,
  fee_usdt numeric NOT NULL DEFAULT 0,
  status public.p2p_order_status NOT NULL DEFAULT 'payment_pending',
  payment_method text NOT NULL DEFAULT 'upi',
  payout_upi_id text,
  payout_holder_name text,
  utr_reference text,
  paid_amount_inr numeric,
  proof_url text,
  escrow_locked boolean NOT NULL DEFAULT false,
  escrow_settled boolean NOT NULL DEFAULT false,
  payment_deadline timestamptz,
  confirm_deadline timestamptz,
  paid_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.p2p_orders TO authenticated;
GRANT ALL ON public.p2p_orders TO service_role;
ALTER TABLE public.p2p_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read orders" ON public.p2p_orders FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR buyer_user_id = auth.uid() OR public.is_admin());
CREATE TRIGGER p2p_orders_touch BEFORE UPDATE ON public.p2p_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.p2p_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.p2p_orders(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'user',
  from_status public.p2p_order_status,
  to_status public.p2p_order_status,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.p2p_order_events TO authenticated;
GRANT ALL ON public.p2p_order_events TO service_role;
ALTER TABLE public.p2p_order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read order events" ON public.p2p_order_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.p2p_orders o WHERE o.id = order_id
    AND (o.seller_id = auth.uid() OR o.buyer_user_id = auth.uid())) OR public.is_admin());

CREATE TABLE public.p2p_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.p2p_orders(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role text NOT NULL DEFAULT 'user',
  body text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.p2p_messages TO authenticated;
GRANT ALL ON public.p2p_messages TO service_role;
ALTER TABLE public.p2p_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read messages" ON public.p2p_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.p2p_orders o WHERE o.id = order_id
    AND (o.seller_id = auth.uid() OR o.buyer_user_id = auth.uid())) OR public.is_admin());
CREATE POLICY "participants send messages" ON public.p2p_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND NOT is_system AND EXISTS (
    SELECT 1 FROM public.p2p_orders o WHERE o.id = order_id
      AND (o.seller_id = auth.uid() OR o.buyer_user_id = auth.uid() OR public.is_admin())));

CREATE TABLE public.p2p_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.p2p_orders(id) ON DELETE CASCADE,
  raised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  details text,
  status public.dispute_status NOT NULL DEFAULT 'open',
  priority public.dispute_priority NOT NULL DEFAULT 'medium',
  resolution text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.p2p_disputes TO authenticated;
GRANT ALL ON public.p2p_disputes TO service_role;
ALTER TABLE public.p2p_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read disputes" ON public.p2p_disputes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.p2p_orders o WHERE o.id = order_id
    AND (o.seller_id = auth.uid() OR o.buyer_user_id = auth.uid())) OR public.is_admin());
CREATE TRIGGER p2p_disputes_touch BEFORE UPDATE ON public.p2p_disputes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ───────────────────────────── ledger entries ──────────────────────────
CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.p2p_orders(id) ON DELETE SET NULL,
  deposit_request_id uuid REFERENCES public.deposit_requests(id) ON DELETE SET NULL,
  wallet_id uuid REFERENCES public.user_wallets(id) ON DELETE SET NULL,
  entry_type public.ledger_entry_type NOT NULL,
  bucket text NOT NULL DEFAULT 'available',
  currency text NOT NULL DEFAULT 'USDT',
  amount numeric NOT NULL,
  balance_before numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ledger" ON public.ledger_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- ─────────────────────────────── indexes ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pm_user ON public.payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_ads_merchant ON public.p2p_advertisements(merchant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ads_price ON public.p2p_advertisements(price_inr DESC);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON public.p2p_orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON public.p2p_orders(buyer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.p2p_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON public.p2p_order_events(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_order ON public.p2p_messages(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.p2p_disputes(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON public.ledger_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_order ON public.ledger_entries(order_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON public.wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_wallets_addr ON public.user_wallets(address, network);
CREATE INDEX IF NOT EXISTS idx_deposits_user_status ON public.deposit_requests(user_id, status, created_at DESC);

-- ──────────────────────────── fee / timer settings ─────────────────────
INSERT INTO public.system_settings (key, value, description) VALUES
  ('fee_p2p_percent', '0.2'::jsonb, 'P2P platform fee charged to the seller (percent)'),
  ('fee_deposit_percent', '0'::jsonb, 'Deposit fee (percent)'),
  ('fee_withdrawal_usdt', '1.5'::jsonb, 'Flat withdrawal fee in USDT'),
  ('fee_merchant_percent', '0'::jsonb, 'Merchant fee (percent)'),
  ('p2p_payment_window_minutes', '15'::jsonb, 'Minutes a buyer has to pay INR'),
  ('p2p_confirm_window_minutes', '30'::jsonb, 'Minutes a seller has to confirm INR receipt')
ON CONFLICT (key) DO NOTHING;

-- ───────────────────────────── ledger helper ───────────────────────────
CREATE OR REPLACE FUNCTION public.write_ledger(
  _user_id uuid, _order_id uuid, _type public.ledger_entry_type, _bucket text,
  _amount numeric, _before numeric, _after numeric, _memo text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.ledger_entries
    (user_id, order_id, entry_type, bucket, amount, balance_before, balance_after, memo)
  VALUES (_user_id, _order_id, _type, _bucket, _amount, _before, _after, _memo);
$$;
REVOKE ALL ON FUNCTION public.write_ledger(uuid, uuid, public.ledger_entry_type, text, numeric, numeric, numeric, text) FROM public, anon, authenticated;

-- ─────────────────────── create sell order (lock escrow) ───────────────
CREATE OR REPLACE FUNCTION public.p2p_create_sell_order(
  _advertisement_id uuid, _usdt numeric, _payment_method_id uuid)
RETURNS TABLE(order_id uuid, order_ref text, total_inr numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ad public.p2p_advertisements;
  mer public.merchants;
  pm public.payment_methods;
  prof public.profiles;
  total numeric;
  pay_minutes integer;
  new_order public.p2p_orders;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _usdt IS NULL OR _usdt <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;

  SELECT * INTO ad FROM public.p2p_advertisements WHERE id = _advertisement_id FOR UPDATE;
  IF ad.id IS NULL OR NOT ad.is_active THEN RAISE EXCEPTION 'Advertisement is not available'; END IF;
  SELECT * INTO mer FROM public.merchants WHERE id = ad.merchant_id;
  IF mer.id IS NULL OR mer.status <> 'approved' THEN RAISE EXCEPTION 'Merchant is not accepting orders'; END IF;
  IF _usdt > ad.available_usdt THEN RAISE EXCEPTION 'Advertisement only has % USDT available', ad.available_usdt; END IF;

  SELECT * INTO pm FROM public.payment_methods WHERE id = _payment_method_id AND user_id = auth.uid();
  IF pm.id IS NULL THEN RAISE EXCEPTION 'Select one of your own payment methods'; END IF;

  total := round(_usdt * ad.price_inr, 2);
  IF total < ad.min_order_inr OR total > ad.max_order_inr THEN
    RAISE EXCEPTION 'Order total % INR is outside the limits % - %', total, ad.min_order_inr, ad.max_order_inr;
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF prof.balance < _usdt THEN
    RAISE EXCEPTION 'Insufficient available balance: % USDT needed, % USDT available', _usdt, prof.balance;
  END IF;

  SELECT COALESCE((value #>> '{}')::integer, 15) INTO pay_minutes
    FROM public.system_settings WHERE key = 'p2p_payment_window_minutes';

  INSERT INTO public.p2p_orders
    (advertisement_id, merchant_id, buyer_user_id, seller_id, side, usdt_amount, price_inr,
     total_inr, status, payment_method, payout_upi_id, payout_holder_name,
     escrow_locked, payment_deadline)
  VALUES (ad.id, mer.id, mer.user_id, auth.uid(), 'sell', _usdt, ad.price_inr, total,
          'payment_pending', pm.kind, pm.upi_id, pm.holder_name, true,
          now() + make_interval(mins => COALESCE(pay_minutes, 15)))
  RETURNING * INTO new_order;

  UPDATE public.profiles
     SET balance = balance - _usdt, locked_balance = locked_balance + _usdt
   WHERE id = auth.uid() RETURNING * INTO prof;

  PERFORM public.write_ledger(auth.uid(), new_order.id, 'escrow_lock', 'available', -_usdt,
    prof.balance + _usdt, prof.balance, 'Locked for ' || new_order.order_ref);

  UPDATE public.p2p_advertisements SET available_usdt = available_usdt - _usdt WHERE id = ad.id;
  UPDATE public.merchants SET total_orders = total_orders + 1 WHERE id = mer.id;

  INSERT INTO public.p2p_order_events (order_id, actor_id, to_status, note)
  VALUES (new_order.id, auth.uid(), 'payment_pending', 'Sell order created, USDT locked in escrow');

  INSERT INTO public.p2p_messages (order_id, sender_role, body, is_system)
  VALUES (new_order.id, 'system',
    'Order created. Buyer must pay ' || total || ' INR to ' || pm.upi_id || '.', true);

  INSERT INTO public.notifications (user_id, audience, title, body, severity)
  VALUES (auth.uid(), 'trader', 'Sell order created',
    new_order.order_ref || ': ' || _usdt || ' USDT locked in escrow', 'info');
  IF mer.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, audience, title, body, severity)
    VALUES (mer.user_id, 'merchant', 'New P2P order',
      new_order.order_ref || ': pay ' || total || ' INR', 'info');
  END IF;

  RETURN QUERY SELECT new_order.id, new_order.order_ref, new_order.total_inr;
END; $$;

-- ───────────────────────── buyer marks payment sent ────────────────────
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
  IF _utr IS NULL OR length(trim(_utr)) < 4 THEN RAISE EXCEPTION 'Enter the payment reference / UTR'; END IF;

  SELECT COALESCE((value #>> '{}')::integer, 30) INTO conf_minutes
    FROM public.system_settings WHERE key = 'p2p_confirm_window_minutes';

  UPDATE public.p2p_orders
     SET status = 'payment_sent', utr_reference = trim(_utr), paid_amount_inr = _amount,
         proof_url = _proof_url, paid_at = now(),
         confirm_deadline = now() + make_interval(mins => COALESCE(conf_minutes, 30))
   WHERE id = ord.id;

  INSERT INTO public.p2p_order_events (order_id, actor_id, from_status, to_status, note)
  VALUES (ord.id, auth.uid(), ord.status, 'payment_sent', 'Buyer marked payment sent, UTR ' || trim(_utr));

  INSERT INTO public.p2p_messages (order_id, sender_role, body, is_system)
  VALUES (ord.id, 'system', 'Buyer marked payment sent. UTR ' || trim(_utr), true);

  INSERT INTO public.notifications (user_id, audience, title, body, severity)
  VALUES (ord.seller_id, 'trader', 'Payment marked as sent',
    ord.order_ref || ': check your ' || ord.payment_method || ' account and confirm receipt', 'warning');
  RETURN true;
END; $$;

-- ──────────────── seller confirms INR received → release escrow ────────
CREATE OR REPLACE FUNCTION public.p2p_confirm_payment_received(_order_id uuid)
RETURNS TABLE(released numeric, fee numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ord public.p2p_orders; seller public.profiles; buyer public.profiles;
  fee_pct numeric; fee_amt numeric; net numeric;
BEGIN
  SELECT * INTO ord FROM public.p2p_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF ord.seller_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the seller can release this escrow';
  END IF;
  IF ord.escrow_settled THEN RAISE EXCEPTION 'Escrow for this order is already settled'; END IF;
  IF ord.status NOT IN ('payment_sent','payment_received') THEN
    RAISE EXCEPTION 'Buyer has not marked the payment as sent yet';
  END IF;

  SELECT COALESCE((value #>> '{}')::numeric, 0) INTO fee_pct
    FROM public.system_settings WHERE key = 'fee_p2p_percent';
  fee_amt := round(ord.usdt_amount * COALESCE(fee_pct, 0) / 100, 6);
  net := ord.usdt_amount - fee_amt;

  SELECT * INTO seller FROM public.profiles WHERE id = ord.seller_id FOR UPDATE;
  UPDATE public.profiles SET locked_balance = GREATEST(locked_balance - ord.usdt_amount, 0)
   WHERE id = ord.seller_id RETURNING * INTO seller;

  PERFORM public.write_ledger(ord.seller_id, ord.id, 'escrow_release', 'locked', -ord.usdt_amount,
    seller.locked_balance + ord.usdt_amount, seller.locked_balance,
    'Escrow released for ' || ord.order_ref);
  IF fee_amt > 0 THEN
    PERFORM public.write_ledger(ord.seller_id, ord.id, 'fee', 'available', -fee_amt,
      seller.balance, seller.balance, 'P2P fee for ' || ord.order_ref);
  END IF;

  IF ord.buyer_user_id IS NOT NULL THEN
    SELECT * INTO buyer FROM public.profiles WHERE id = ord.buyer_user_id FOR UPDATE;
    IF buyer.id IS NOT NULL THEN
      UPDATE public.profiles SET balance = balance + net WHERE id = buyer.id RETURNING * INTO buyer;
      PERFORM public.write_ledger(buyer.id, ord.id, 'p2p_buy', 'available', net,
        buyer.balance - net, buyer.balance, 'USDT received for ' || ord.order_ref);
    END IF;
  END IF;

  UPDATE public.p2p_orders
     SET status = 'completed', escrow_settled = true, escrow_locked = false,
         fee_usdt = fee_amt, completed_at = now()
   WHERE id = ord.id;
  UPDATE public.merchants SET completed_orders = completed_orders + 1 WHERE id = ord.merchant_id;

  INSERT INTO public.p2p_order_events (order_id, actor_id, from_status, to_status, note)
  VALUES (ord.id, auth.uid(), ord.status, 'completed', 'Seller confirmed INR receipt, escrow released');
  INSERT INTO public.p2p_messages (order_id, sender_role, body, is_system)
  VALUES (ord.id, 'system', 'Order completed. ' || net || ' USDT released to the buyer.', true);
  INSERT INTO public.notifications (user_id, audience, title, body, severity)
  VALUES (ord.seller_id, 'trader', 'Order completed',
    ord.order_ref || ': ' || ord.usdt_amount || ' USDT released', 'success');
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'user', 'p2p.escrow_released', 'p2p_order', ord.id::text,
    jsonb_build_object('amount', ord.usdt_amount, 'fee', fee_amt));

  RETURN QUERY SELECT net, fee_amt;
END; $$;

-- ───────────────────────────── cancel order ────────────────────────────
CREATE OR REPLACE FUNCTION public.p2p_cancel_order(_order_id uuid, _reason text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord public.p2p_orders; seller public.profiles;
BEGIN
  SELECT * INTO ord FROM public.p2p_orders WHERE id = _order_id FOR UPDATE;
  IF ord.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF ord.seller_id <> auth.uid() AND ord.buyer_user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not your order';
  END IF;
  IF ord.escrow_settled THEN RAISE EXCEPTION 'Order is already settled'; END IF;
  IF ord.status NOT IN ('payment_pending','created','escrow_locked') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Cannot cancel after the buyer marked payment as sent — raise a dispute instead';
  END IF;

  SELECT * INTO seller FROM public.profiles WHERE id = ord.seller_id FOR UPDATE;
  UPDATE public.profiles
     SET locked_balance = GREATEST(locked_balance - ord.usdt_amount, 0),
         balance = balance + ord.usdt_amount
   WHERE id = ord.seller_id RETURNING * INTO seller;

  PERFORM public.write_ledger(ord.seller_id, ord.id, 'escrow_refund', 'available', ord.usdt_amount,
    seller.balance - ord.usdt_amount, seller.balance, 'Escrow refunded for ' || ord.order_ref);

  UPDATE public.p2p_orders
     SET status = 'cancelled', escrow_settled = true, escrow_locked = false,
         cancelled_at = now(), cancel_reason = _reason
   WHERE id = ord.id;
  IF ord.advertisement_id IS NOT NULL THEN
    UPDATE public.p2p_advertisements SET available_usdt = available_usdt + ord.usdt_amount
     WHERE id = ord.advertisement_id;
  END IF;

  INSERT INTO public.p2p_order_events (order_id, actor_id, from_status, to_status, note)
  VALUES (ord.id, auth.uid(), ord.status, 'cancelled', COALESCE(_reason, 'Order cancelled'));
  INSERT INTO public.notifications (user_id, audience, title, body, severity)
  VALUES (ord.seller_id, 'trader', 'Order cancelled',
    ord.order_ref || ': ' || ord.usdt_amount || ' USDT returned to your available balance', 'info');
  RETURN true;
END; $$;

-- ───────────────────────────── raise dispute ───────────────────────────
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
  VALUES (ord.id, auth.uid(), _reason, _details) RETURNING id INTO new_id;

  UPDATE public.p2p_orders SET status = 'disputed' WHERE id = ord.id;
  INSERT INTO public.p2p_order_events (order_id, actor_id, from_status, to_status, note)
  VALUES (ord.id, auth.uid(), ord.status, 'disputed', 'Dispute opened: ' || _reason);
  INSERT INTO public.p2p_messages (order_id, sender_role, body, is_system)
  VALUES (ord.id, 'system', 'Dispute opened: ' || _reason || '. An administrator will review this order.', true);
  INSERT INTO public.notifications (audience, title, body, severity)
  VALUES ('admin', 'Dispute opened', ord.order_ref || ': ' || _reason, 'error');
  RETURN new_id;
END; $$;

-- ─────────────────────── admin dispute resolution ──────────────────────
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(
  _dispute_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dis public.p2p_disputes; ord public.p2p_orders; seller public.profiles; buyer public.profiles;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrator access required'; END IF;
  SELECT * INTO dis FROM public.p2p_disputes WHERE id = _dispute_id FOR UPDATE;
  IF dis.id IS NULL THEN RAISE EXCEPTION 'Dispute not found'; END IF;
  SELECT * INTO ord FROM public.p2p_orders WHERE id = dis.order_id FOR UPDATE;

  IF _action = 'request_evidence' THEN
    UPDATE public.p2p_disputes SET status = 'evidence_requested', resolution = _reason WHERE id = dis.id;
    INSERT INTO public.p2p_messages (order_id, sender_role, body, is_system)
    VALUES (ord.id, 'system', 'Administrator requested more evidence: ' || COALESCE(_reason,''), true);
  ELSIF _action IN ('release','refund') THEN
    IF ord.escrow_settled THEN RAISE EXCEPTION 'Escrow already settled'; END IF;
    SELECT * INTO seller FROM public.profiles WHERE id = ord.seller_id FOR UPDATE;
    IF _action = 'release' THEN
      UPDATE public.profiles SET locked_balance = GREATEST(locked_balance - ord.usdt_amount, 0)
       WHERE id = ord.seller_id RETURNING * INTO seller;
      PERFORM public.write_ledger(ord.seller_id, ord.id, 'escrow_release', 'locked', -ord.usdt_amount,
        seller.locked_balance + ord.usdt_amount, seller.locked_balance,
        'Admin released escrow for ' || ord.order_ref);
      IF ord.buyer_user_id IS NOT NULL THEN
        UPDATE public.profiles SET balance = balance + ord.usdt_amount
         WHERE id = ord.buyer_user_id RETURNING * INTO buyer;
        IF buyer.id IS NOT NULL THEN
          PERFORM public.write_ledger(buyer.id, ord.id, 'p2p_buy', 'available', ord.usdt_amount,
            buyer.balance - ord.usdt_amount, buyer.balance, 'Admin release for ' || ord.order_ref);
        END IF;
      END IF;
      UPDATE public.p2p_orders SET status = 'completed', escrow_settled = true,
        escrow_locked = false, completed_at = now() WHERE id = ord.id;
    ELSE
      UPDATE public.profiles
         SET locked_balance = GREATEST(locked_balance - ord.usdt_amount, 0),
             balance = balance + ord.usdt_amount
       WHERE id = ord.seller_id RETURNING * INTO seller;
      PERFORM public.write_ledger(ord.seller_id, ord.id, 'escrow_refund', 'available', ord.usdt_amount,
        seller.balance - ord.usdt_amount, seller.balance, 'Admin refunded escrow for ' || ord.order_ref);
      UPDATE public.p2p_orders SET status = 'cancelled', escrow_settled = true,
        escrow_locked = false, cancelled_at = now(), cancel_reason = _reason WHERE id = ord.id;
    END IF;
    UPDATE public.p2p_disputes SET status = 'resolved', resolution = _reason,
      resolved_by = auth.uid(), resolved_at = now() WHERE id = dis.id;
  ELSIF _action = 'reject' THEN
    UPDATE public.p2p_disputes SET status = 'rejected', resolution = _reason,
      resolved_by = auth.uid(), resolved_at = now() WHERE id = dis.id;
  ELSE
    RAISE EXCEPTION 'Unknown dispute action %', _action;
  END IF;

  INSERT INTO public.p2p_order_events (order_id, actor_id, actor_type, to_status, note)
  VALUES (ord.id, auth.uid(), 'admin', NULL, 'Dispute action: ' || _action || ' — ' || COALESCE(_reason,''));
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'admin', 'dispute.' || _action, 'p2p_dispute', dis.id::text,
    jsonb_build_object('order_ref', ord.order_ref, 'amount', ord.usdt_amount, 'reason', _reason));
  RETURN true;
END; $$;