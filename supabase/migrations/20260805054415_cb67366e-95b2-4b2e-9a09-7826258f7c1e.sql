CREATE OR REPLACE FUNCTION public.credit_deposit(_deposit_id uuid)
RETURNS TABLE (credited boolean, amount numeric, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dep public.deposit_requests;
BEGIN
  -- Row lock guarantees a single credit even with concurrent listener ticks.
  SELECT * INTO dep FROM public.deposit_requests WHERE id = _deposit_id FOR UPDATE;
  IF dep.id IS NULL OR dep.credited THEN
    RETURN QUERY SELECT false, COALESCE(dep.received_amount, 0), dep.user_id;
    RETURN;
  END IF;

  UPDATE public.deposit_requests
     SET status = 'confirmed', credited = true, confirmed_at = now()
   WHERE id = dep.id;

  UPDATE public.profiles
     SET balance = balance + COALESCE(dep.received_amount, dep.expected_amount)
   WHERE id = dep.user_id;

  INSERT INTO public.audit_logs (actor_type, action, entity_type, entity_id, metadata)
  VALUES ('listener', 'deposit.credited', 'deposit_request', dep.id::text,
          jsonb_build_object('amount', COALESCE(dep.received_amount, dep.expected_amount), 'txid', dep.txid));

  RETURN QUERY SELECT true, COALESCE(dep.received_amount, dep.expected_amount), dep.user_id;
END; $$;

REVOKE ALL ON FUNCTION public.credit_deposit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_deposit(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_stale_deposits()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected integer;
BEGIN
  WITH expired AS (
    UPDATE public.deposit_requests
       SET status = 'expired', failure_reason = 'No matching transfer arrived before the deadline'
     WHERE status = 'waiting' AND expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO affected FROM expired;
  RETURN affected;
END; $$;

REVOKE ALL ON FUNCTION public.expire_stale_deposits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_deposits() TO service_role;