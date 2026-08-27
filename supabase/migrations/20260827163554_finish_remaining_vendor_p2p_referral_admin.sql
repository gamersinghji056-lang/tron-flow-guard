-- Remaining product completion: admin referral metrics/settings, true vendor
-- bank multi-rail support, daily vendor account capacity, P2P trust metrics,
-- and private avatar/evidence storage foundations.

ALTER TABLE public.vendor_payment_accounts
  ADD COLUMN IF NOT EXISTS supported_rails text[];

UPDATE public.vendor_payment_accounts
SET supported_rails = CASE
  WHEN rail = 'upi' THEN ARRAY['upi']::text[]
  WHEN rail IN ('imps','neft','rtgs') THEN ARRAY[rail]::text[]
  ELSE ARRAY['imps','neft','rtgs']::text[]
END
WHERE supported_rails IS NULL OR array_length(supported_rails, 1) IS NULL;

ALTER TABLE public.vendor_payment_accounts
  DROP CONSTRAINT IF EXISTS vendor_payment_accounts_supported_rails_check;
ALTER TABLE public.vendor_payment_accounts
  ADD CONSTRAINT vendor_payment_accounts_supported_rails_check
  CHECK (
    supported_rails IS NULL
    OR (
      array_length(supported_rails, 1) >= 1
      AND supported_rails <@ ARRAY['upi','imps','neft','rtgs']::text[]
      AND (
        (rail = 'upi' AND supported_rails = ARRAY['upi']::text[])
        OR (rail <> 'upi' AND NOT ('upi' = ANY(supported_rails)))
      )
    )
  );

CREATE INDEX IF NOT EXISTS vendor_payment_accounts_supported_rails_idx
  ON public.vendor_payment_accounts USING gin(supported_rails);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('user-avatars', 'user-avatars', false, 2097152, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('p2p-evidence', 'p2p-evidence', false, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS user_avatars_owner_read ON storage.objects;
CREATE POLICY user_avatars_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND (
      split_part(name, '/', 1) = (select auth.uid())::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS user_avatars_owner_write ON storage.objects;
CREATE POLICY user_avatars_owner_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'user-avatars'
    AND split_part(name, '/', 1) = (select auth.uid())::text
  );

DROP POLICY IF EXISTS user_avatars_owner_update ON storage.objects;
CREATE POLICY user_avatars_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND split_part(name, '/', 1) = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'user-avatars'
    AND split_part(name, '/', 1) = (select auth.uid())::text
  );

CREATE OR REPLACE FUNCTION public.vendor_payment_account_capacity(
  _account_id uuid,
  _business_tz text DEFAULT 'Asia/Kolkata'
)
RETURNS TABLE(
  account_id uuid,
  daily_limit_inr numeric,
  used_today_inr numeric,
  remaining_today_inr numeric,
  business_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  acct public.vendor_payment_accounts;
  start_at timestamptz;
  end_at timestamptz;
  used_vendor numeric := 0;
  used_direct numeric := 0;
BEGIN
  SELECT * INTO acct FROM public.vendor_payment_accounts WHERE id = _account_id;
  IF acct.id IS NULL THEN
    RAISE EXCEPTION 'Vendor payment account not found';
  END IF;

  business_date := (now() AT TIME ZONE _business_tz)::date;
  start_at := business_date::timestamp AT TIME ZONE _business_tz;
  end_at := (business_date + 1)::timestamp AT TIME ZONE _business_tz;

  SELECT COALESCE(SUM(total_inr), 0) INTO used_vendor
  FROM public.vendor_orders
  WHERE (payment_account_snapshot->>'account_id')::uuid = acct.id
    AND created_at >= start_at
    AND created_at < end_at
    AND status NOT IN ('cancelled','expired','failed','rejected','refunded');

  SELECT COALESCE(SUM(expected_inr), 0) INTO used_direct
  FROM public.direct_sell_orders
  WHERE vendor_payment_account_id = acct.id
    AND payout_account_source = 'vendor_payment_accounts'
    AND created_at >= start_at
    AND created_at < end_at
    AND status NOT IN ('cancelled','expired','failed','rejected','refunded');

  account_id := acct.id;
  daily_limit_inr := COALESCE(acct.daily_limit_inr, 0);
  used_today_inr := COALESCE(used_vendor, 0) + COALESCE(used_direct, 0);
  remaining_today_inr := GREATEST(daily_limit_inr - used_today_inr, 0);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_payment_account_capacity(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_payment_account_capacity(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_referral_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT jsonb_build_object(
    'settings', COALESCE((
      SELECT jsonb_object_agg(key, value)
      FROM public.system_settings
      WHERE key IN (
        'referral_campaign_enabled',
        'referral_direct_rate_percent',
        'referral_min_rate_percent',
        'referral_max_rate_percent',
        'referral_eligible_p2p_enabled',
        'referral_eligible_direct_sell_enabled'
      )
    ), '{}'::jsonb),
    'totalDirectReferrals', (SELECT COUNT(*) FROM public.referral_attributions),
    'qualifiedReferrals', (SELECT COUNT(*) FROM public.referral_attributions WHERE status IN ('qualified','rewarded')),
    'eligibleTradeVolume', COALESCE((SELECT SUM(trade_amount_usdt) FROM public.referral_rewards), 0),
    'pendingRewards', COALESCE((SELECT SUM(amount) FROM public.referral_rewards WHERE status = 'pending'), 0),
    'paidRewards', COALESCE((SELECT SUM(amount) FROM public.referral_rewards WHERE status = 'paid'), 0),
    'totalRewards', COALESCE((SELECT SUM(amount) FROM public.referral_rewards), 0),
    'recentRewards', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', reward.id,
          'amount', reward.amount,
          'currency', reward.currency,
          'status', reward.status,
          'sourceType', reward.source_type,
          'sourceOrderId', reward.source_order_id,
          'tradeAmountUsdt', reward.trade_amount_usdt,
          'ratePercent', reward.rate_percent,
          'createdAt', reward.created_at,
          'referrerUserId', reward.user_id,
          'referrerName', referrer.full_name,
          'referredUserId', attr.referred_user_id,
          'referredName', referred.full_name
        )
        ORDER BY reward.created_at DESC
      )
      FROM (
        SELECT *
        FROM public.referral_rewards
        ORDER BY created_at DESC
        LIMIT 25
      ) reward
      LEFT JOIN public.referral_attributions attr ON attr.id = reward.attribution_id
      LEFT JOIN public.profiles referrer ON referrer.id = reward.user_id
      LEFT JOIN public.profiles referred ON referred.id = attr.referred_user_id
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_referral_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_referral_overview() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.p2p_participant_profile(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  prof public.profiles;
  vendor public.trading_vendors;
  completed_count integer := 0;
  successful_count integer := 0;
  total_count integer := 0;
  volume numeric := 0;
  volume_30d numeric := 0;
  open_disputes integer := 0;
  resolved_disputes integer := 0;
  reports integer := 0;
  joined_days integer := 0;
  completion numeric := 0;
  score numeric := 0;
  tier text := 'New';
BEGIN
  SELECT * INTO prof FROM public.profiles WHERE id = _user_id;
  IF prof.id IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  SELECT * INTO vendor FROM public.trading_vendors WHERE user_id = _user_id LIMIT 1;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COALESCE(SUM(usdt_amount) FILTER (WHERE status = 'completed'), 0),
    COALESCE(SUM(usdt_amount) FILTER (WHERE status = 'completed' AND completed_at >= now() - interval '30 days'), 0)
  INTO total_count, completed_count, successful_count, volume, volume_30d
  FROM public.p2p_orders
  WHERE buyer_user_id = _user_id OR seller_id = _user_id;

  SELECT
    COUNT(*) FILTER (WHERE d.status IN ('open','evidence_requested','admin_review')),
    COUNT(*) FILTER (WHERE d.status IN ('resolved','rejected','closed'))
  INTO open_disputes, resolved_disputes
  FROM public.p2p_disputes d
  JOIN public.p2p_orders o ON o.id = d.order_id
  WHERE o.buyer_user_id = _user_id OR o.seller_id = _user_id;

  joined_days := GREATEST(0, floor(extract(epoch from (now() - prof.created_at)) / 86400)::integer);
  completion := CASE WHEN total_count > 0 THEN round(successful_count::numeric / total_count::numeric * 100, 2) ELSE 0 END;
  score :=
    LEAST(completed_count, 100) * 0.35
    + LEAST(volume / 1000, 100) * 0.30
    + completion * 0.25
    + LEAST(joined_days::numeric / 30, 24) * 0.10
    - (open_disputes * 5 + reports * 3);

  tier := CASE
    WHEN score >= 85 AND completion >= 95 THEN 'Top Trader'
    WHEN score >= 55 AND completion >= 90 THEN 'Experienced'
    WHEN score >= 20 THEN 'Active'
    ELSE 'New'
  END;

  RETURN jsonb_build_object(
    'userId', prof.id,
    'displayName', COALESCE(prof.full_name, prof.username, 'WTRON User'),
    'avatarPath', prof.avatar_path,
    'accountType', CASE WHEN vendor.id IS NOT NULL THEN 'Vendor' ELSE 'Trader' END,
    'joinedAt', prof.created_at,
    'joinedDays', joined_days,
    'completedTrades', completed_count,
    'successfulTrades', successful_count,
    'completionRate', completion,
    'totalUsdtTraded', volume,
    'volume30d', volume_30d,
    'openDisputes', open_disputes,
    'resolvedDisputes', resolved_disputes,
    'reportsReceived', reports,
    'lastActive', NULL,
    'rankingTier', tier,
    'rankingScore', round(score, 2),
    'rankingInputs', jsonb_build_object(
      'completedTrades', completed_count,
      'completionRate', completion,
      'totalUsdtTraded', volume,
      'joinedDays', joined_days,
      'openDisputes', open_disputes,
      'reportsReceived', reports
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.p2p_participant_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.p2p_participant_profile(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.p2p_has_risk_acknowledgement(_policy_version text DEFAULT 'v1')
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.p2p_risk_acknowledgements
    WHERE user_id = auth.uid()
      AND acknowledgement_key = 'p2p_pre_trade_warning:' || _policy_version
      AND acknowledged_at IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.p2p_acknowledge_risk(_policy_version text DEFAULT 'v1')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  INSERT INTO public.p2p_risk_acknowledgements (user_id, acknowledgement_key, acknowledged_at)
  VALUES (auth.uid(), 'p2p_pre_trade_warning:' || _policy_version, now())
  ON CONFLICT (user_id, acknowledgement_key)
  DO UPDATE SET acknowledged_at = EXCLUDED.acknowledged_at;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.p2p_has_risk_acknowledgement(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.p2p_acknowledge_risk(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.p2p_has_risk_acknowledgement(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p2p_acknowledge_risk(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_vendor_order(
  _listing_id uuid, _usdt numeric, _rail text)
RETURNS public.vendor_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  listing public.vendor_listings;
  vendor public.trading_vendors;
  acct public.vendor_payment_accounts;
  capacity record;
  ord public.vendor_orders;
  total numeric;
  pay_minutes integer;
  buyer_fee numeric;
  vendor_fee numeric;
  buyer_fee_rate numeric;
  vendor_fee_rate numeric;
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
    WHERE id = listing.payment_account_id
      AND vendor_id = vendor.id
      AND status = 'active'
      AND enabled = true
      AND frozen = false
      AND archived_at IS NULL
      AND (
        _rail = rail
        OR _rail = ANY(COALESCE(supported_rails, ARRAY[rail]::text[]))
      )
    FOR UPDATE;
  IF acct.id IS NULL THEN RAISE EXCEPTION 'Vendor payment account is not available'; END IF;

  SELECT * INTO capacity FROM public.vendor_payment_account_capacity(acct.id, 'Asia/Kolkata');
  IF total > COALESCE(capacity.remaining_today_inr, 0) THEN
    RAISE EXCEPTION 'Vendor payment account daily limit exceeded. Remaining INR: %', COALESCE(capacity.remaining_today_inr, 0);
  END IF;

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
       'supported_rails', COALESCE(acct.supported_rails, ARRAY[acct.rail]::text[]),
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
    jsonb_build_object('listing_id', listing.id, 'amount', _usdt, 'payment_account_id', acct.id));
  RETURN ord;
END; $$;

GRANT EXECUTE ON FUNCTION public.create_vendor_order(uuid,numeric,text) TO authenticated, service_role;
