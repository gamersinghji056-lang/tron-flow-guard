CREATE OR REPLACE FUNCTION public.credit_deposit(_deposit_id uuid)
 RETURNS TABLE(credited boolean, amount numeric, user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  dep public.deposit_requests;
  target public.user_wallets;
  credit_amount numeric;
BEGIN
  SELECT * INTO dep FROM public.deposit_requests WHERE id = _deposit_id FOR UPDATE;
  IF dep.id IS NULL OR dep.credited THEN
    RETURN QUERY SELECT false, COALESCE(dep.received_amount, 0), dep.user_id;
    RETURN;
  END IF;

  credit_amount := COALESCE(dep.received_amount, dep.expected_amount);

  SELECT * INTO target FROM public.user_wallets uw
   WHERE uw.user_id = dep.user_id AND NOT uw.is_archived
   ORDER BY uw.is_default DESC, uw.created_at ASC LIMIT 1 FOR UPDATE;

  IF target.id IS NOT NULL THEN
    UPDATE public.user_wallets uw
       SET balance = uw.balance + credit_amount, last_synced_at = now()
     WHERE uw.id = target.id RETURNING uw.* INTO target;

    INSERT INTO public.wallet_transactions
      (wallet_id, user_id, direction, kind, status, amount, counterparty_address, network,
       txid, block_number, onchain, deposit_request_id, balance_after, memo)
    VALUES (target.id, dep.user_id, 'in', 'deposit', 'completed', credit_amount,
            dep.sender_address, dep.network, dep.txid, dep.block_number, true, dep.id,
            target.balance, 'P2P deposit ' || dep.order_ref);
  END IF;

  UPDATE public.deposit_requests dr
     SET status = 'credited', credited = true, confirmed_at = now(),
         credited_wallet_id = target.id
   WHERE dr.id = dep.id;

  UPDATE public.profiles p SET balance = p.balance + credit_amount WHERE p.id = dep.user_id;

  INSERT INTO public.audit_logs (actor_type, action, entity_type, entity_id, metadata)
  VALUES ('listener', 'deposit.credited', 'deposit_request', dep.id::text,
          jsonb_build_object('amount', credit_amount, 'txid', dep.txid,
                             'wallet_id', target.id));

  RETURN QUERY SELECT true, credit_amount, dep.user_id;
END; $function$;

REVOKE ALL ON FUNCTION public.credit_deposit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_deposit(uuid) TO service_role;