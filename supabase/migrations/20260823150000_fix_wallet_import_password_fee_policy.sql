DROP INDEX IF EXISTS public.user_wallets_address_key;

CREATE UNIQUE INDEX IF NOT EXISTS user_wallets_address_network_key
  ON public.user_wallets(address, network)
  WHERE is_archived = false;

CREATE UNIQUE INDEX IF NOT EXISTS user_wallets_active_address_key
  ON public.user_wallets(address)
  WHERE is_archived = false;

CREATE TABLE IF NOT EXISTS public.gasfree_wallet_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL,
  network public.chain_network NOT NULL,
  status text NOT NULL DEFAULT 'unavailable'
    CHECK (status IN ('available','limited','unavailable')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (address, network)
);
GRANT SELECT ON public.gasfree_wallet_registry TO authenticated;
GRANT ALL ON public.gasfree_wallet_registry TO service_role;
ALTER TABLE public.gasfree_wallet_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gasfree_wallet_registry_admin_select ON public.gasfree_wallet_registry;
CREATE POLICY gasfree_wallet_registry_admin_select ON public.gasfree_wallet_registry
  FOR SELECT TO authenticated USING (public.is_admin());

INSERT INTO public.system_settings (key, value, description) VALUES
  ('transfer_fee_usdt', '1'::jsonb, 'Fixed WTRON USDT fee for user-initiated on-chain wallet sends')
ON CONFLICT (key) DO UPDATE
  SET value = CASE
    WHEN public.system_settings.value = '1.5'::jsonb THEN EXCLUDED.value
    ELSE public.system_settings.value
  END,
  description = EXCLUDED.description;

DROP FUNCTION IF EXISTS public.create_direct_sell_order(numeric, uuid);

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
  IF _payment_method_id IS NULL THEN RAISE EXCEPTION 'Select a saved payout method'; END IF;
  SELECT * INTO pm FROM public.payment_methods WHERE id = _payment_method_id AND user_id = auth.uid();
  IF pm.id IS NULL OR pm.kind NOT IN ('upi','bank') THEN RAISE EXCEPTION 'Select one of your own active payout methods'; END IF;
  IF COALESCE(pm.status, 'active') <> 'active' THEN RAISE EXCEPTION 'Select an active payout method'; END IF;

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

REVOKE ALL ON FUNCTION public.create_direct_sell_order(numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_sell_order(numeric,uuid) TO authenticated, service_role;
