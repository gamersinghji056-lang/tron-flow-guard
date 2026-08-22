ALTER TABLE public.vendor_payment_accounts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.vendor_listings
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'USER_DEPOSIT',
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS min_deposit numeric(24,6),
  ADD COLUMN IF NOT EXISTS max_deposit numeric(24,6),
  ADD COLUMN IF NOT EXISTS onchain_usdt_balance numeric(24,6),
  ADD COLUMN IF NOT EXISTS onchain_trx_balance numeric(24,6),
  ADD COLUMN IF NOT EXISTS onchain_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_listener_scan_at timestamptz;

ALTER TABLE public.wallets
  DROP CONSTRAINT IF EXISTS wallets_purpose_check;
ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_purpose_check
  CHECK (purpose IN ('USER_DEPOSIT','DIRECT_SELL','FEE_COLLECTION','HOT','OTHER'));

CREATE TABLE IF NOT EXISTS public.fee_liabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  order_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.trading_vendors(id) ON DELETE SET NULL,
  fee_type text NOT NULL,
  amount numeric(24,6) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USDT',
  destination_wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ACCRUED' CHECK (status IN ('ACCRUED','PENDING_SWEEP','SETTLED','WAIVED')),
  idempotency_key text NOT NULL UNIQUE,
  txid text,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fee_liabilities TO authenticated;
GRANT ALL ON public.fee_liabilities TO service_role;
ALTER TABLE public.fee_liabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fee_liabilities_admin_select ON public.fee_liabilities;
CREATE POLICY fee_liabilities_admin_select ON public.fee_liabilities
  FOR SELECT TO authenticated USING (public.is_admin());

ALTER TABLE public.service_heartbeats
  ADD COLUMN IF NOT EXISTS last_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text;

ALTER TABLE public.system_error_logs
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS retryable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS fee_liabilities_order_type_idx
  ON public.fee_liabilities(order_id, fee_type);
CREATE INDEX IF NOT EXISTS system_error_logs_service_created_idx
  ON public.system_error_logs(service, created_at DESC);

CREATE OR REPLACE FUNCTION public.current_fee_collection_wallet_id()
RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE raw text; result uuid;
BEGIN
  SELECT value::text INTO raw FROM public.system_settings WHERE key = 'fee_collection_wallet_id';
  BEGIN
    result := nullif(trim(both '"' from COALESCE(raw, '')), 'null')::uuid;
  EXCEPTION WHEN others THEN
    result := NULL;
  END;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.record_fee_liability(
  _source text,
  _order_id uuid,
  _user_id uuid,
  _vendor_id uuid,
  _fee_type text,
  _amount numeric,
  _currency text,
  _idempotency_key text)
RETURNS public.fee_liabilities
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE liability public.fee_liabilities; dest uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN NULL;
  END IF;
  dest := public.current_fee_collection_wallet_id();
  INSERT INTO public.fee_liabilities
    (source, order_id, user_id, vendor_id, fee_type, amount, currency, destination_wallet_id,
     status, idempotency_key)
  VALUES
    (_source, _order_id, _user_id, _vendor_id, _fee_type, _amount, COALESCE(_currency, 'USDT'),
     dest, CASE WHEN dest IS NULL THEN 'ACCRUED' ELSE 'PENDING_SWEEP' END, _idempotency_key)
  ON CONFLICT (idempotency_key) DO UPDATE
    SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING * INTO liability;
  RETURN liability;
END; $$;

CREATE OR REPLACE FUNCTION public.create_vendor_order(
  _listing_id uuid, _usdt numeric, _rail text)
RETURNS public.vendor_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE listing public.vendor_listings; vendor public.trading_vendors; acct public.vendor_payment_accounts;
  ord public.vendor_orders; total numeric; pay_minutes integer; buyer_fee numeric; vendor_fee numeric;
  buyer_fee_rate numeric; vendor_fee_rate numeric;
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
    WHERE id = listing.payment_account_id AND vendor_id = vendor.id AND rail = _rail
      AND status = 'active' AND enabled = true AND frozen = false AND archived_at IS NULL
    FOR UPDATE;
  IF acct.id IS NULL THEN RAISE EXCEPTION 'Vendor payment account is not available'; END IF;
  pay_minutes := public.get_numeric_setting('vendor_payment_timeout_minutes', 15)::integer;
  buyer_fee_rate := public.get_numeric_setting('vendor_buyer_fee_percent', 0.5);
  vendor_fee_rate := public.get_numeric_setting('vendor_seller_fee_percent', 0.5);
  buyer_fee := public.calculate_percent_fee(_usdt, 'vendor_buyer_fee_percent', 0.5);
  vendor_fee := public.calculate_percent_fee(_usdt, 'vendor_seller_fee_percent', 0.5);
  INSERT INTO public.vendor_orders
    (listing_id, vendor_id, buyer_user_id, usdt_amount, rate_inr, total_inr, buyer_fee_usdt,
     vendor_fee_usdt, buyer_fee_rate_percent, vendor_fee_rate_percent, payment_rail,
     payment_account_snapshot, status, payment_deadline)
  VALUES
    (listing.id, vendor.id, auth.uid(), _usdt, listing.rate_inr, total, buyer_fee,
     vendor_fee, buyer_fee_rate, vendor_fee_rate, _rail,
     jsonb_build_object('account_id', acct.id, 'label', acct.label, 'rail', acct.rail,
       'account_ref', acct.account_ref, 'holder_name', acct.holder_name, 'bank_name',
       acct.bank_name, 'account_number', acct.account_number, 'ifsc', acct.ifsc,
       'terms', listing.terms, 'rate_inr', listing.rate_inr),
     'payment_pending', now() + make_interval(mins => pay_minutes))
  RETURNING * INTO ord;
  UPDATE public.vendor_listings
    SET available_usdt = available_usdt - _usdt,
        reserved_usdt = reserved_usdt + _usdt,
        status = CASE WHEN available_usdt - _usdt <= 0 THEN 'paused' ELSE status END,
        updated_at = now()
    WHERE id = listing.id;
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'user', 'vendor.order.created', 'vendor_order', ord.id::text,
    jsonb_build_object('listing_id', listing.id, 'amount', _usdt));
  RETURN ord;
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
  IF ord.release_idempotency_key IS NOT NULL OR ord.status IN ('completed','confirmed') THEN RETURN true; END IF;
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
    PERFORM public.record_fee_liability('vendor_order', ord.id, buyer.id, ord.vendor_id,
      'vendor_buyer_fee', ord.buyer_fee_usdt, 'USDT', 'vendor-buyer-fee-' || ord.id::text);
  END IF;
  IF vendor.user_id IS NOT NULL AND COALESCE(ord.vendor_fee_usdt, 0) > 0 THEN
    PERFORM public.write_ledger(vendor.user_id, NULL, 'fee', 'available', -ord.vendor_fee_usdt,
      0, 0, 'Vendor seller fee ' || ord.order_ref);
    PERFORM public.record_fee_liability('vendor_order', ord.id, vendor.user_id, ord.vendor_id,
      'vendor_seller_fee', ord.vendor_fee_usdt, 'USDT', 'vendor-seller-fee-' || ord.id::text);
  END IF;
  UPDATE public.vendor_orders SET status = 'completed', completed_at = now(), release_idempotency_key = rel_key WHERE id = ord.id;
  UPDATE public.vendor_listings SET reserved_usdt = GREATEST(reserved_usdt - ord.usdt_amount, 0), updated_at = now() WHERE id = ord.listing_id;
  UPDATE public.trading_vendors SET completed_orders = completed_orders + 1 WHERE id = ord.vendor_id;
  RETURN true;
END; $$;

GRANT EXECUTE ON FUNCTION public.current_fee_collection_wallet_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_fee_liability(text,uuid,uuid,uuid,text,numeric,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_vendor_order(uuid,numeric,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_vendor_payment(uuid) TO authenticated, service_role;
