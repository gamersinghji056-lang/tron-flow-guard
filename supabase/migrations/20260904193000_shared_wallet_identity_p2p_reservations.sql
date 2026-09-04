CREATE TABLE IF NOT EXISTS public.personal_wallet_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL,
  address text NOT NULL,
  first_wallet_id uuid REFERENCES public.user_wallets(id) ON DELETE SET NULL,
  onchain_usdt_balance numeric NOT NULL DEFAULT 0,
  onchain_trx_balance numeric NOT NULL DEFAULT 0,
  onchain_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_wallet_identities_network_address_key UNIQUE (network, address)
);

CREATE TABLE IF NOT EXISTS public.personal_wallet_identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.personal_wallet_identities(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.user_wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT personal_wallet_identity_links_wallet_key UNIQUE (wallet_id),
  CONSTRAINT personal_wallet_identity_links_user_identity_key UNIQUE (user_id, identity_id, status)
);

ALTER TABLE public.personal_wallet_identity_links
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.personal_wallet_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_wallet_identity_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.personal_wallet_identities TO authenticated;
GRANT SELECT ON public.personal_wallet_identity_links TO authenticated;
GRANT ALL ON public.personal_wallet_identities TO service_role;
GRANT ALL ON public.personal_wallet_identity_links TO service_role;

DROP POLICY IF EXISTS personal_wallet_identities_select_linked ON public.personal_wallet_identities;
CREATE POLICY personal_wallet_identities_select_linked
  ON public.personal_wallet_identities
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.personal_wallet_identity_links link
      WHERE link.identity_id = id
        AND link.user_id = auth.uid()
        AND link.status = 'active'
    )
  );

DROP POLICY IF EXISTS personal_wallet_identity_links_select_own ON public.personal_wallet_identity_links;
CREATE POLICY personal_wallet_identity_links_select_own
  ON public.personal_wallet_identity_links
  FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());

ALTER TABLE public.user_wallets
  ADD COLUMN IF NOT EXISTS wallet_identity_id uuid REFERENCES public.personal_wallet_identities(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.user_wallets_active_address_key;
DROP INDEX IF EXISTS public.user_wallets_address_network_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_wallets_user_active_address_network_key
  ON public.user_wallets(user_id, address, network)
  WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS user_wallets_wallet_identity_idx
  ON public.user_wallets(wallet_identity_id)
  WHERE is_archived = false;

INSERT INTO public.personal_wallet_identities
  (network, address, first_wallet_id, onchain_usdt_balance, onchain_trx_balance, onchain_checked_at)
SELECT DISTINCT ON (network::text, address)
  network::text,
  address,
  id,
  COALESCE(onchain_balance, balance, 0),
  COALESCE(onchain_trx_balance, 0),
  onchain_checked_at
FROM public.user_wallets
WHERE address IS NOT NULL
  AND network IS NOT NULL
  AND is_archived = false
ORDER BY network::text, address, onchain_checked_at DESC NULLS LAST, id
ON CONFLICT (network, address) DO UPDATE
SET onchain_usdt_balance = CASE
      WHEN EXCLUDED.onchain_checked_at IS NULL
        AND public.personal_wallet_identities.onchain_checked_at IS NOT NULL
        THEN public.personal_wallet_identities.onchain_usdt_balance
      WHEN public.personal_wallet_identities.onchain_checked_at IS NULL
        OR EXCLUDED.onchain_checked_at >= public.personal_wallet_identities.onchain_checked_at
        THEN EXCLUDED.onchain_usdt_balance
      ELSE public.personal_wallet_identities.onchain_usdt_balance
    END,
    onchain_trx_balance = CASE
      WHEN EXCLUDED.onchain_checked_at IS NULL
        AND public.personal_wallet_identities.onchain_checked_at IS NOT NULL
        THEN public.personal_wallet_identities.onchain_trx_balance
      WHEN public.personal_wallet_identities.onchain_checked_at IS NULL
        OR EXCLUDED.onchain_checked_at >= public.personal_wallet_identities.onchain_checked_at
        THEN EXCLUDED.onchain_trx_balance
      ELSE public.personal_wallet_identities.onchain_trx_balance
    END,
    onchain_checked_at = CASE
      WHEN EXCLUDED.onchain_checked_at IS NULL
        AND public.personal_wallet_identities.onchain_checked_at IS NOT NULL
        THEN public.personal_wallet_identities.onchain_checked_at
      WHEN public.personal_wallet_identities.onchain_checked_at IS NULL
        OR EXCLUDED.onchain_checked_at >= public.personal_wallet_identities.onchain_checked_at
        THEN EXCLUDED.onchain_checked_at
      ELSE public.personal_wallet_identities.onchain_checked_at
    END,
    updated_at = now();

UPDATE public.user_wallets wallet
SET wallet_identity_id = identity.id
FROM public.personal_wallet_identities identity
WHERE wallet.wallet_identity_id IS NULL
  AND identity.network = wallet.network::text
  AND identity.address = wallet.address;

INSERT INTO public.personal_wallet_identity_links (identity_id, wallet_id, user_id, status)
SELECT wallet.wallet_identity_id, wallet.id, wallet.user_id, 'active'
FROM public.user_wallets wallet
WHERE wallet.wallet_identity_id IS NOT NULL
  AND wallet.is_archived = false
ON CONFLICT (wallet_id) DO UPDATE
SET identity_id = EXCLUDED.identity_id,
    user_id = EXCLUDED.user_id,
    status = 'active',
    archived_at = NULL;

CREATE OR REPLACE FUNCTION public.attach_personal_wallet_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  identity_id uuid;
BEGIN
  IF NEW.address IS NULL OR NEW.network IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.personal_wallet_identities
    (network, address, first_wallet_id, onchain_usdt_balance, onchain_trx_balance, onchain_checked_at)
  VALUES (
    NEW.network::text,
    NEW.address,
    NEW.id,
    COALESCE(NEW.onchain_balance, NEW.balance, 0),
    COALESCE(NEW.onchain_trx_balance, 0),
    NEW.onchain_checked_at
  )
  ON CONFLICT (network, address) DO UPDATE
  SET onchain_usdt_balance = CASE
        WHEN EXCLUDED.onchain_checked_at IS NULL
          AND public.personal_wallet_identities.onchain_checked_at IS NOT NULL
          THEN public.personal_wallet_identities.onchain_usdt_balance
        WHEN public.personal_wallet_identities.onchain_checked_at IS NULL
          OR EXCLUDED.onchain_checked_at >= public.personal_wallet_identities.onchain_checked_at
          THEN EXCLUDED.onchain_usdt_balance
        ELSE public.personal_wallet_identities.onchain_usdt_balance
      END,
      onchain_trx_balance = CASE
        WHEN EXCLUDED.onchain_checked_at IS NULL
          AND public.personal_wallet_identities.onchain_checked_at IS NOT NULL
          THEN public.personal_wallet_identities.onchain_trx_balance
        WHEN public.personal_wallet_identities.onchain_checked_at IS NULL
          OR EXCLUDED.onchain_checked_at >= public.personal_wallet_identities.onchain_checked_at
          THEN EXCLUDED.onchain_trx_balance
        ELSE public.personal_wallet_identities.onchain_trx_balance
      END,
      onchain_checked_at = CASE
        WHEN EXCLUDED.onchain_checked_at IS NULL
          AND public.personal_wallet_identities.onchain_checked_at IS NOT NULL
          THEN public.personal_wallet_identities.onchain_checked_at
        WHEN public.personal_wallet_identities.onchain_checked_at IS NULL
          OR EXCLUDED.onchain_checked_at >= public.personal_wallet_identities.onchain_checked_at
          THEN EXCLUDED.onchain_checked_at
        ELSE public.personal_wallet_identities.onchain_checked_at
      END,
      updated_at = now()
  RETURNING id INTO identity_id;

  NEW.wallet_identity_id := identity_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_wallets_attach_identity_before_write ON public.user_wallets;
CREATE TRIGGER user_wallets_attach_identity_before_write
  BEFORE INSERT OR UPDATE OF address, network, onchain_balance, onchain_trx_balance, onchain_checked_at
  ON public.user_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.attach_personal_wallet_identity();

CREATE OR REPLACE FUNCTION public.link_personal_wallet_identity_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.wallet_identity_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.personal_wallet_identity_links
    (identity_id, wallet_id, user_id, status, archived_at)
  VALUES (
    NEW.wallet_identity_id,
    NEW.id,
    NEW.user_id,
    CASE WHEN NEW.is_archived THEN 'archived' ELSE 'active' END,
    CASE WHEN NEW.is_archived THEN now() ELSE NULL END
  )
  ON CONFLICT (wallet_id) DO UPDATE
  SET identity_id = EXCLUDED.identity_id,
      user_id = EXCLUDED.user_id,
      status = EXCLUDED.status,
      archived_at = EXCLUDED.archived_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_wallets_link_identity_after_write ON public.user_wallets;
CREATE TRIGGER user_wallets_link_identity_after_write
  AFTER INSERT OR UPDATE OF wallet_identity_id, user_id, is_archived
  ON public.user_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.link_personal_wallet_identity_after_write();

CREATE TABLE IF NOT EXISTS public.personal_wallet_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.personal_wallet_identities(id) ON DELETE CASCADE,
  wallet_id uuid REFERENCES public.user_wallets(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('p2p_ad','p2p_order')),
  source_id uuid NOT NULL,
  amount_usdt numeric NOT NULL DEFAULT 0 CHECK (amount_usdt >= 0),
  fee_usdt numeric NOT NULL DEFAULT 0 CHECK (fee_usdt >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','settled','released','cancelled','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  CONSTRAINT personal_wallet_reservations_source_key UNIQUE (source_type, source_id)
);

ALTER TABLE public.personal_wallet_reservations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.personal_wallet_reservations TO authenticated;
GRANT ALL ON public.personal_wallet_reservations TO service_role;

DROP POLICY IF EXISTS personal_wallet_reservations_select_own ON public.personal_wallet_reservations;
CREATE POLICY personal_wallet_reservations_select_own
  ON public.personal_wallet_reservations
  FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());

ALTER TABLE public.p2p_advertisements
  ADD COLUMN IF NOT EXISTS source_wallet_id uuid REFERENCES public.user_wallets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_wallet_identity_id uuid REFERENCES public.personal_wallet_identities(id) ON DELETE SET NULL;

ALTER TABLE public.p2p_orders
  ADD COLUMN IF NOT EXISTS source_wallet_id uuid REFERENCES public.user_wallets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_wallet_identity_id uuid REFERENCES public.personal_wallet_identities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS personal_wallet_reservations_active_identity_idx
  ON public.personal_wallet_reservations(identity_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS p2p_ads_source_wallet_identity_idx
  ON public.p2p_advertisements(source_wallet_identity_id)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS p2p_orders_source_wallet_identity_idx
  ON public.p2p_orders(source_wallet_identity_id)
  WHERE escrow_settled = false;

CREATE OR REPLACE FUNCTION public.personal_wallet_available_usdt(_identity_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public AS $$
  SELECT GREATEST(
    COALESCE(identity.onchain_usdt_balance, 0)
    - COALESCE((
      SELECT SUM(reservation.amount_usdt + reservation.fee_usdt)
      FROM public.personal_wallet_reservations reservation
      WHERE reservation.identity_id = identity.id
        AND reservation.status = 'active'
    ), 0),
    0
  )
  FROM public.personal_wallet_identities identity
  WHERE identity.id = _identity_id;
$$;

CREATE OR REPLACE FUNCTION public.personal_wallet_available_usdt_for_wallet(_wallet_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  wallet public.user_wallets;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO wallet
  FROM public.user_wallets
  WHERE id = _wallet_id
    AND user_id = auth.uid()
    AND is_archived = false
    AND network = 'trc20-mainnet'
    AND COALESCE(wallet_role, 'general') <> 'gasfree'
    AND COALESCE(wallet_type, 'standard') <> 'gasfree';
  IF wallet.id IS NULL OR wallet.wallet_identity_id IS NULL THEN
    RETURN 0;
  END IF;
  RETURN public.personal_wallet_available_usdt(wallet.wallet_identity_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_and_reserve_personal_wallet_usdt(
  _wallet_id uuid,
  _owner_id uuid,
  _source_type text,
  _source_id uuid,
  _amount_usdt numeric,
  _fee_usdt numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  wallet public.user_wallets;
  identity public.personal_wallet_identities;
  available numeric;
  reservation_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() AND _owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot reserve another user wallet';
  END IF;
  IF _wallet_id IS NULL THEN
    RAISE EXCEPTION 'Select a source wallet';
  END IF;
  SELECT * INTO wallet
  FROM public.user_wallets
  WHERE id = _wallet_id
    AND user_id = _owner_id
    AND is_archived = false
    AND network = 'trc20-mainnet'
    AND COALESCE(wallet_role, 'general') <> 'gasfree'
    AND COALESCE(wallet_type, 'standard') <> 'gasfree'
  FOR UPDATE;
  IF wallet.id IS NULL THEN
    RAISE EXCEPTION 'Select an eligible personal Mainnet wallet';
  END IF;

  SELECT * INTO identity
  FROM public.personal_wallet_identities
  WHERE id = wallet.wallet_identity_id
  FOR UPDATE;
  IF identity.id IS NULL THEN
    RAISE EXCEPTION 'Wallet identity is not available yet';
  END IF;

  available := public.personal_wallet_available_usdt(identity.id);
  IF available < (_amount_usdt + COALESCE(_fee_usdt, 0)) THEN
    RAISE EXCEPTION 'Insufficient available wallet balance: % USDT plus % USDT fee required',
      _amount_usdt, COALESCE(_fee_usdt, 0);
  END IF;

  INSERT INTO public.personal_wallet_reservations
    (identity_id, wallet_id, user_id, source_type, source_id, amount_usdt, fee_usdt, status)
  VALUES
    (identity.id, wallet.id, _owner_id, _source_type, _source_id, _amount_usdt, COALESCE(_fee_usdt, 0), 'active')
  ON CONFLICT (source_type, source_id) DO UPDATE
  SET identity_id = EXCLUDED.identity_id,
      wallet_id = EXCLUDED.wallet_id,
      user_id = EXCLUDED.user_id,
      amount_usdt = EXCLUDED.amount_usdt,
      fee_usdt = EXCLUDED.fee_usdt,
      status = 'active',
      released_at = NULL
  RETURNING id INTO reservation_id;

  RETURN reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_personal_wallet_reservation(
  _source_type text,
  _source_id uuid,
  _status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF _status NOT IN ('settled','released','cancelled','expired') THEN
    RAISE EXCEPTION 'Invalid reservation release status';
  END IF;
  UPDATE public.personal_wallet_reservations
     SET status = _status,
         released_at = now()
   WHERE source_type = _source_type
     AND source_id = _source_id
     AND status = 'active';
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_p2p_ad_wallet_reservation_if_finished(
  _advertisement_id uuid,
  _status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  ad public.p2p_advertisements;
BEGIN
  IF _advertisement_id IS NULL THEN
    RETURN false;
  END IF;
  IF _status NOT IN ('released','settled','cancelled') THEN
    RAISE EXCEPTION 'Invalid advertisement reservation release status';
  END IF;

  SELECT * INTO ad FROM public.p2p_advertisements WHERE id = _advertisement_id;
  IF ad.id IS NULL OR ad.source_wallet_identity_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.p2p_orders o
     WHERE o.advertisement_id = _advertisement_id
       AND COALESCE(o.escrow_settled, false) = false
       AND o.status NOT IN ('cancelled','expired','refunded','failed')
  ) THEN
    RETURN false;
  END IF;

  IF COALESCE(ad.available_usdt, 0) > 0 AND ad.is_active AND ad.closed_at IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.personal_wallet_reservations
     SET status = _status,
         released_at = now()
   WHERE source_type = 'p2p_ad'
     AND source_id = _advertisement_id
     AND status = 'active';

  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS public.p2p_create_ad(public.p2p_side,numeric,numeric,numeric,numeric,text[],text,boolean,uuid);
CREATE OR REPLACE FUNCTION public.p2p_create_ad(
  _side public.p2p_side,
  _price numeric,
  _available_usdt numeric,
  _min_order_inr numeric,
  _max_order_inr numeric,
  _payment_methods text[] DEFAULT ARRAY['upi'],
  _terms text DEFAULT NULL,
  _is_active boolean DEFAULT true,
  _payment_method_id uuid DEFAULT NULL,
  _source_wallet_id uuid DEFAULT NULL
)
RETURNS public.p2p_advertisements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mer public.merchants;
  pm public.payment_methods;
  wallet public.user_wallets;
  ad public.p2p_advertisements;
  fee numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _price IS NULL OR _price <= 0 THEN RAISE EXCEPTION 'Price must be greater than zero'; END IF;
  IF _available_usdt IS NULL OR _available_usdt <= 0 THEN RAISE EXCEPTION 'Available amount must be greater than zero'; END IF;
  IF _min_order_inr IS NULL OR _max_order_inr IS NULL OR _min_order_inr <= 0 OR _min_order_inr > _max_order_inr THEN
    RAISE EXCEPTION 'Invalid order limits';
  END IF;
  IF _side = 'sell' THEN
    fee := public.calculate_p2p_seller_fee(_available_usdt);
    IF _payment_method_id IS NULL THEN RAISE EXCEPTION 'Select a saved UPI payment method for sell ads'; END IF;
    SELECT * INTO pm FROM public.payment_methods WHERE id = _payment_method_id AND user_id = auth.uid();
    IF pm.id IS NULL THEN RAISE EXCEPTION 'Select one of your own payment methods'; END IF;
    SELECT * INTO wallet FROM public.user_wallets WHERE id = _source_wallet_id AND user_id = auth.uid();
    IF wallet.id IS NULL THEN RAISE EXCEPTION 'Select a source wallet'; END IF;
  END IF;

  mer := public.ensure_user_merchant(auth.uid());
  INSERT INTO public.p2p_advertisements
    (merchant_id, side, price_inr, available_usdt, min_order_inr, max_order_inr,
     payment_methods, terms, is_active, payment_method_id, source_wallet_id,
     source_wallet_identity_id, fee_policy_snapshot)
  VALUES
    (mer.id, _side, _price, _available_usdt, _min_order_inr, _max_order_inr,
     COALESCE(_payment_methods, ARRAY['upi']), _terms, COALESCE(_is_active, true), _payment_method_id,
     CASE WHEN _side = 'sell' THEN wallet.id ELSE NULL END,
     CASE WHEN _side = 'sell' THEN wallet.wallet_identity_id ELSE NULL END,
     jsonb_build_object('seller_fee_usdt', fee, 'source_wallet_id', _source_wallet_id))
  RETURNING * INTO ad;

  IF _side = 'sell' THEN
    PERFORM public.assert_and_reserve_personal_wallet_usdt(
      wallet.id, auth.uid(), 'p2p_ad', ad.id, _available_usdt, fee
    );
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'user', 'p2p.ad.created', 'p2p_advertisement', ad.id::text,
    jsonb_build_object('side', _side, 'available_usdt', _available_usdt, 'price', _price, 'fee', fee,
      'source_wallet_id', _source_wallet_id, 'source_wallet_identity_id', ad.source_wallet_identity_id));
  RETURN ad;
END;
$$;

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
DECLARE
  ad public.p2p_advertisements;
  mer public.merchants;
  prof public.profiles;
  pm public.payment_methods;
  wallet public.user_wallets;
  fee numeric := 0;
  exposure numeric := 0;
  next_active boolean;
BEGIN
  SELECT * INTO ad FROM public.p2p_advertisements WHERE id = _ad_id FOR UPDATE;
  IF ad.id IS NULL THEN RAISE EXCEPTION 'Advertisement not found'; END IF;
  SELECT * INTO mer FROM public.merchants WHERE id = ad.merchant_id;
  IF mer.user_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'Not your advertisement'; END IF;
  IF _price <= 0 OR _available_usdt < 0 OR _min_order_inr <= 0 OR _min_order_inr > _max_order_inr THEN
    RAISE EXCEPTION 'Invalid advertisement values';
  END IF;

  next_active := COALESCE(_is_active, ad.is_active);
  exposure := _available_usdt + COALESCE(ad.reserved_usdt, 0);

  IF ad.side = 'sell' THEN
    fee := public.calculate_p2p_seller_fee(exposure);
    IF COALESCE(_payment_method_id, ad.payment_method_id) IS NULL THEN RAISE EXCEPTION 'Sell ads require a saved payment method'; END IF;
    SELECT * INTO pm FROM public.payment_methods WHERE id = COALESCE(_payment_method_id, ad.payment_method_id) AND user_id = mer.user_id;
    IF pm.id IS NULL THEN RAISE EXCEPTION 'Select one of your own payment methods'; END IF;

    IF ad.source_wallet_identity_id IS NULL THEN
      SELECT * INTO prof FROM public.profiles WHERE id = mer.user_id FOR UPDATE;
      IF prof.balance < (exposure + fee) THEN
        RAISE EXCEPTION 'Insufficient available balance for sell advertisement plus fee';
      END IF;
    ELSE
      SELECT * INTO wallet FROM public.user_wallets WHERE id = ad.source_wallet_id AND user_id = mer.user_id FOR UPDATE;
      IF wallet.id IS NULL THEN RAISE EXCEPTION 'Source wallet is not available'; END IF;
      IF next_active AND exposure > 0 THEN
        PERFORM public.assert_and_reserve_personal_wallet_usdt(
          wallet.id, mer.user_id, 'p2p_ad', ad.id, exposure, fee
        );
      END IF;
    END IF;
  END IF;

  UPDATE public.p2p_advertisements
    SET price_inr = _price,
        available_usdt = _available_usdt,
        min_order_inr = _min_order_inr,
        max_order_inr = _max_order_inr,
        payment_methods = COALESCE(_payment_methods, payment_methods),
        terms = _terms,
        is_active = next_active,
        payment_method_id = COALESCE(_payment_method_id, payment_method_id),
        fee_policy_snapshot = jsonb_build_object('seller_fee_usdt', fee, 'source_wallet_id', ad.source_wallet_id),
        closed_at = CASE WHEN next_active THEN NULL ELSE now() END
    WHERE id = ad.id
    RETURNING * INTO ad;

  IF ad.side = 'sell' AND ad.source_wallet_identity_id IS NOT NULL AND NOT next_active THEN
    PERFORM public.release_p2p_ad_wallet_reservation_if_finished(ad.id, 'released');
  END IF;

  RETURN ad;
END; $$;

CREATE OR REPLACE FUNCTION public.p2p_set_ad_active(_ad_id uuid, _is_active boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ad public.p2p_advertisements;
  mer public.merchants;
  wallet public.user_wallets;
  exposure numeric;
  fee numeric;
BEGIN
  SELECT a.* INTO ad FROM public.p2p_advertisements a WHERE a.id = _ad_id FOR UPDATE;
  IF ad.id IS NULL THEN RAISE EXCEPTION 'Advertisement not found'; END IF;
  SELECT * INTO mer FROM public.merchants WHERE id = ad.merchant_id;
  IF mer.user_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'Not your advertisement'; END IF;

  IF ad.side = 'sell' AND ad.source_wallet_identity_id IS NOT NULL THEN
    IF _is_active THEN
      SELECT * INTO wallet FROM public.user_wallets WHERE id = ad.source_wallet_id AND user_id = mer.user_id FOR UPDATE;
      IF wallet.id IS NULL THEN RAISE EXCEPTION 'Source wallet is not available'; END IF;
      exposure := COALESCE(ad.available_usdt, 0) + COALESCE(ad.reserved_usdt, 0);
      fee := public.calculate_p2p_seller_fee(exposure);
      IF exposure > 0 THEN
        PERFORM public.assert_and_reserve_personal_wallet_usdt(
          wallet.id, mer.user_id, 'p2p_ad', ad.id, exposure, fee
        );
      END IF;
    END IF;
  END IF;

  UPDATE public.p2p_advertisements
     SET is_active = _is_active,
         closed_at = CASE WHEN _is_active THEN NULL ELSE now() END
   WHERE id = _ad_id;

  IF ad.side = 'sell' AND ad.source_wallet_identity_id IS NOT NULL AND NOT _is_active THEN
    PERFORM public.release_p2p_ad_wallet_reservation_if_finished(_ad_id, 'released');
  END IF;

  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.release_personal_wallet_reservation_for_p2p_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('cancelled','expired','refunded') THEN
    PERFORM public.release_personal_wallet_reservation('p2p_order', NEW.id, 'cancelled');
    PERFORM public.release_p2p_ad_wallet_reservation_if_finished(NEW.advertisement_id, 'released');
  ELSIF NEW.status = 'completed' OR NEW.escrow_settled = true THEN
    PERFORM public.release_personal_wallet_reservation('p2p_order', NEW.id, 'settled');
    PERFORM public.release_p2p_ad_wallet_reservation_if_finished(NEW.advertisement_id, 'settled');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS p2p_orders_release_personal_wallet_reservation ON public.p2p_orders;
CREATE TRIGGER p2p_orders_release_personal_wallet_reservation
  AFTER UPDATE OF status, escrow_settled
  ON public.p2p_orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.escrow_settled IS DISTINCT FROM NEW.escrow_settled)
  EXECUTE FUNCTION public.release_personal_wallet_reservation_for_p2p_order();

REVOKE ALL ON FUNCTION public.personal_wallet_available_usdt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.personal_wallet_available_usdt_for_wallet(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_and_reserve_personal_wallet_usdt(uuid,uuid,text,uuid,numeric,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_personal_wallet_reservation(text,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_p2p_ad_wallet_reservation_if_finished(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.personal_wallet_available_usdt(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.personal_wallet_available_usdt_for_wallet(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_and_reserve_personal_wallet_usdt(uuid,uuid,text,uuid,numeric,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_personal_wallet_reservation(text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_p2p_ad_wallet_reservation_if_finished(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.p2p_create_ad(public.p2p_side,numeric,numeric,numeric,numeric,text[],text,boolean,uuid,uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.p2p_create_order_from_ad(uuid,numeric,uuid);
CREATE OR REPLACE FUNCTION public.p2p_create_order_from_ad(
  _advertisement_id uuid,
  _usdt numeric,
  _payment_method_id uuid DEFAULT NULL,
  _source_wallet_id uuid DEFAULT NULL
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
  source_wallet public.user_wallets;
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
    IF _source_wallet_id IS NULL THEN RAISE EXCEPTION 'Select a source wallet'; END IF;
    SELECT * INTO seller_pm FROM public.payment_methods WHERE id = _payment_method_id AND user_id = auth.uid();
    IF seller_pm.id IS NULL THEN RAISE EXCEPTION 'Select one of your own payment methods'; END IF;
    SELECT * INTO source_wallet FROM public.user_wallets WHERE id = _source_wallet_id AND user_id = auth.uid() FOR UPDATE;
    IF source_wallet.id IS NULL THEN RAISE EXCEPTION 'Select an eligible personal Mainnet wallet'; END IF;
    seller_fee := public.calculate_p2p_seller_fee(_usdt);
    escrow_total := _usdt + seller_fee;
    INSERT INTO public.p2p_orders
      (advertisement_id, merchant_id, buyer_user_id, seller_id, side, usdt_amount, price_inr,
       total_inr, status, payment_method, payout_upi_id, payout_holder_name,
       escrow_locked, payment_deadline, seller_fee_usdt, fee_usdt, escrow_amount_usdt,
       source_wallet_id, source_wallet_identity_id, payment_method_snapshot)
    VALUES (ad.id, mer.id, mer.user_id, auth.uid(), 'sell', _usdt, ad.price_inr, total,
            'payment_pending', seller_pm.kind, seller_pm.upi_id, seller_pm.holder_name, true,
            now() + make_interval(mins => pay_minutes), seller_fee, seller_fee, escrow_total,
            source_wallet.id, source_wallet.wallet_identity_id,
            jsonb_build_object('payment_method_id', seller_pm.id, 'kind', seller_pm.kind, 'upi_id', seller_pm.upi_id, 'holder_name', seller_pm.holder_name))
    RETURNING * INTO new_order;
    PERFORM public.assert_and_reserve_personal_wallet_usdt(
      source_wallet.id, auth.uid(), 'p2p_order', new_order.id, _usdt, seller_fee
    );
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
    seller_fee := public.calculate_p2p_seller_fee(_usdt);
    buyer_fee := public.calculate_percent_fee(_usdt, 'p2p_buyer_fee_percent', 0);
    escrow_total := _usdt + seller_fee;
    IF ad.source_wallet_identity_id IS NULL THEN
      SELECT * INTO seller_profile FROM public.profiles WHERE id = mer.user_id FOR UPDATE;
      IF seller_profile.balance < escrow_total THEN RAISE EXCEPTION 'Seller no longer has sufficient balance including fee'; END IF;
    END IF;
    INSERT INTO public.p2p_orders
      (advertisement_id, merchant_id, buyer_user_id, seller_id, side, usdt_amount, price_inr,
       total_inr, status, payment_method, payout_upi_id, payout_holder_name,
       escrow_locked, payment_deadline, seller_fee_usdt, buyer_fee_usdt, fee_usdt, escrow_amount_usdt,
       source_wallet_id, source_wallet_identity_id, payment_method_snapshot)
    VALUES (ad.id, mer.id, auth.uid(), mer.user_id, 'buy', _usdt, ad.price_inr, total,
            'payment_pending', seller_pm.kind, seller_pm.upi_id, seller_pm.holder_name, true,
            now() + make_interval(mins => pay_minutes), seller_fee, buyer_fee, seller_fee, escrow_total,
            ad.source_wallet_id, ad.source_wallet_identity_id,
            jsonb_build_object('payment_method_id', seller_pm.id, 'kind', seller_pm.kind, 'upi_id', seller_pm.upi_id, 'holder_name', seller_pm.holder_name))
    RETURNING * INTO new_order;
    IF ad.source_wallet_identity_id IS NULL THEN
      UPDATE public.profiles SET balance = balance - escrow_total, locked_balance = locked_balance + escrow_total
       WHERE id = mer.user_id RETURNING * INTO seller_profile;
      PERFORM public.write_ledger(mer.user_id, new_order.id, 'escrow_lock', 'available', -escrow_total,
        seller_profile.balance + escrow_total, seller_profile.balance, 'Locked P2P sell escrow plus fee for ' || new_order.order_ref);
    END IF;
  END IF;

  UPDATE public.p2p_advertisements
     SET available_usdt = GREATEST(available_usdt - _usdt, 0),
         reserved_usdt = reserved_usdt + _usdt,
         is_active = CASE WHEN available_usdt - _usdt <= 0 THEN false ELSE is_active END,
         closed_at = CASE WHEN available_usdt - _usdt <= 0 THEN now() ELSE closed_at END
   WHERE id = ad.id;
  UPDATE public.merchants SET total_orders = total_orders + 1 WHERE id = mer.id;
  PERFORM public.record_p2p_system_event(new_order.id, auth.uid(), NULL, 'payment_pending',
    'Order created. USDT and applicable seller fee are reserved for escrow.');
  RETURN QUERY SELECT new_order.id, new_order.order_ref, new_order.total_inr;
END;
$$;

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

  IF ord.source_wallet_identity_id IS NULL THEN
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
  ELSE
    PERFORM public.release_personal_wallet_reservation('p2p_order', ord.id, 'settled');
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
  PERFORM public.release_p2p_ad_wallet_reservation_if_finished(ord.advertisement_id, 'settled');
  UPDATE public.merchants SET completed_orders = completed_orders + 1 WHERE id = ord.merchant_id;
  PERFORM public.record_p2p_system_event(ord.id, _actor_id, ord.status, 'completed', _note);
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (_actor_id, COALESCE(_actor_type, 'system'), 'p2p.escrow_released', 'p2p_order', ord.id::text,
    jsonb_build_object('amount', ord.usdt_amount, 'seller_fee', ord.seller_fee_usdt, 'buyer_fee', ord.buyer_fee_usdt,
      'source_wallet_identity_id', ord.source_wallet_identity_id));
  RETURN QUERY SELECT buyer_credit, COALESCE(ord.seller_fee_usdt, ord.fee_usdt, 0), COALESCE(ord.buyer_fee_usdt, 0);
END; $$;
REVOKE ALL ON FUNCTION public.p2p_release_escrow(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;

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

  IF ord.source_wallet_identity_id IS NULL THEN
    SELECT * INTO seller FROM public.profiles WHERE id = ord.seller_id FOR UPDATE;
    UPDATE public.profiles
       SET locked_balance = GREATEST(locked_balance - escrow_total, 0),
           balance = balance + escrow_total
     WHERE id = ord.seller_id RETURNING * INTO seller;
    PERFORM public.write_ledger(ord.seller_id, ord.id, 'escrow_refund', 'available', escrow_total,
      seller.balance - escrow_total, seller.balance, 'Escrow refunded for ' || ord.order_ref);
  ELSE
    PERFORM public.release_personal_wallet_reservation('p2p_order', ord.id, 'cancelled');
  END IF;

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
    PERFORM public.release_p2p_ad_wallet_reservation_if_finished(ord.advertisement_id, 'released');
  END IF;
  PERFORM public.record_p2p_system_event(ord.id, auth.uid(), ord.status, 'cancelled', COALESCE(_reason, 'Order cancelled'));
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.p2p_create_order_from_ad(uuid,numeric,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p2p_cancel_order(uuid,text) TO authenticated, service_role;

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
    IF ord.source_wallet_identity_id IS NULL THEN
      SELECT * INTO seller FROM public.profiles WHERE id = ord.seller_id FOR UPDATE;
      UPDATE public.profiles SET locked_balance = GREATEST(locked_balance - escrow_total, 0),
        balance = balance + escrow_total WHERE id = ord.seller_id RETURNING * INTO seller;
      PERFORM public.write_ledger(ord.seller_id, ord.id, 'escrow_refund', 'available', escrow_total,
        seller.balance - escrow_total, seller.balance, 'Escrow expired for ' || ord.order_ref);
    ELSE
      PERFORM public.release_personal_wallet_reservation('p2p_order', ord.id, 'expired');
    END IF;

    UPDATE public.p2p_orders SET status = 'expired', escrow_settled = true, escrow_locked = false,
      expired_at = now(), cancelled_at = now(), cancel_reason = 'Payment window expired' WHERE id = ord.id;
    IF ord.advertisement_id IS NOT NULL THEN
      UPDATE public.p2p_advertisements SET available_usdt = available_usdt + ord.usdt_amount,
        reserved_usdt = GREATEST(reserved_usdt - ord.usdt_amount, 0), is_active = true, closed_at = NULL
      WHERE id = ord.advertisement_id;
      PERFORM public.release_p2p_ad_wallet_reservation_if_finished(ord.advertisement_id, 'released');
    END IF;
    PERFORM public.record_p2p_system_event(ord.id, NULL, ord.status, 'expired', 'Payment window expired. Escrow returned to seller.');
    affected := affected + 1;
  END LOOP;
  RETURN affected;
END; $$;
