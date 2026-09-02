CREATE OR REPLACE FUNCTION public.company_wallet_has_purpose(_wallet_id uuid, _purpose text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.wallet_purpose_assignments assignment
    WHERE assignment.wallet_id = _wallet_id
      AND assignment.purpose = _purpose
      AND assignment.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.company_wallet_has_purpose(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_wallet_has_purpose(uuid, text) TO authenticated, service_role;

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
  active_network := COALESCE(active_network, 'trc20-mainnet');
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
   WHERE w.network = active_network
     AND w.is_active
     AND (
       w.purpose = 'DIRECT_SELL'
       OR public.company_wallet_has_purpose(w.id, 'DIRECT_SELL')
     )
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
GRANT EXECUTE ON FUNCTION public.create_direct_sell_order(numeric, uuid) TO authenticated, service_role;
