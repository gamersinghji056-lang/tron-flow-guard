ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'employee';

ALTER TABLE public.trading_vendors
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telegram_username text,
  ADD COLUMN IF NOT EXISTS application_terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspension_reason text;

ALTER TABLE public.trading_vendors
  DROP CONSTRAINT IF EXISTS trading_vendors_status_check;
ALTER TABLE public.trading_vendors
  ADD CONSTRAINT trading_vendors_status_check
  CHECK (status IN ('pending','approved','rejected','suspended','disabled'));

CREATE UNIQUE INDEX IF NOT EXISTS trading_vendors_user_unique
  ON public.trading_vendors(user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.vendor_payment_accounts
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS min_inr numeric(24,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_inr numeric(24,2) NOT NULL DEFAULT 1000000,
  ADD COLUMN IF NOT EXISTS daily_limit_inr numeric(24,2) NOT NULL DEFAULT 5000000,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS frozen boolean NOT NULL DEFAULT false;

ALTER TABLE public.vendor_payment_accounts
  DROP CONSTRAINT IF EXISTS vendor_payment_accounts_status_check;
ALTER TABLE public.vendor_payment_accounts
  ADD CONSTRAINT vendor_payment_accounts_status_check
  CHECK (status IN ('active','disabled','frozen'));

CREATE INDEX IF NOT EXISTS vendor_payment_accounts_vendor_priority_idx
  ON public.vendor_payment_accounts(vendor_id, enabled DESC, frozen ASC, priority ASC, is_default DESC);

ALTER TABLE public.vendor_listings
  ADD COLUMN IF NOT EXISTS payment_account_id uuid REFERENCES public.vendor_payment_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS total_usdt numeric(24,6),
  ADD COLUMN IF NOT EXISTS terms text;

UPDATE public.vendor_listings
SET total_usdt = COALESCE(total_usdt, available_usdt + reserved_usdt)
WHERE total_usdt IS NULL;

ALTER TABLE public.vendor_listings
  ALTER COLUMN total_usdt SET DEFAULT 0,
  ALTER COLUMN total_usdt SET NOT NULL;

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS buyer_fee_rate_percent numeric(8,4) NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS vendor_fee_rate_percent numeric(8,4) NOT NULL DEFAULT 0.5;

CREATE TABLE IF NOT EXISTS public.system_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('info','warning','error','critical')),
  error_code text,
  safe_message text NOT NULL,
  related_order_id uuid,
  related_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  related_txid text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_error_logs TO authenticated;
GRANT ALL ON public.system_error_logs TO service_role;
ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_error_logs_admin_select ON public.system_error_logs;
CREATE POLICY system_error_logs_admin_select ON public.system_error_logs
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.service_heartbeats (
  service text PRIMARY KEY,
  status text NOT NULL DEFAULT 'unknown',
  last_heartbeat_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  error_count_24h integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_heartbeats TO authenticated;
GRANT ALL ON public.service_heartbeats TO service_role;
ALTER TABLE public.service_heartbeats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_heartbeats_admin_select ON public.service_heartbeats;
CREATE POLICY service_heartbeats_admin_select ON public.service_heartbeats
  FOR SELECT TO authenticated USING (public.is_admin());

INSERT INTO public.system_settings (key, value, description)
VALUES
  ('vendor_buyer_fee_percent', '0.5', 'Buyer-side vendor trade fee percent'),
  ('vendor_seller_fee_percent', '0.5', 'Vendor-side vendor trade fee percent'),
  ('wtron_buy_rate_inr', '0', 'Admin-defined WTRON buy rate for direct sell orders'),
  ('direct_sell_fee_percent', '0', 'Direct sell platform fee percent'),
  ('withdrawal_fee_usdt', '0', 'Withdrawal fee in USDT'),
  ('fee_collection_wallet_id', 'null', 'Company wallet designated for fee collection')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.approve_trading_vendor(_vendor_id uuid)
RETURNS public.trading_vendors
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE vendor public.trading_vendors;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrator access required'; END IF;
  UPDATE public.trading_vendors
    SET status = 'approved', approved_at = now(), approved_by = auth.uid(),
        rejected_at = NULL, rejected_by = NULL, rejection_reason = NULL,
        suspended_at = NULL, suspended_by = NULL, suspension_reason = NULL
    WHERE id = _vendor_id
    RETURNING * INTO vendor;
  IF vendor.id IS NULL THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'admin', 'vendor_approved', 'trading_vendor', vendor.id::text, '{}'::jsonb);
  RETURN vendor;
END; $$;

CREATE OR REPLACE FUNCTION public.reject_trading_vendor(_vendor_id uuid, _reason text DEFAULT NULL)
RETURNS public.trading_vendors
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE vendor public.trading_vendors;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrator access required'; END IF;
  UPDATE public.trading_vendors
    SET status = 'rejected', rejected_at = now(), rejected_by = auth.uid(), rejection_reason = _reason
    WHERE id = _vendor_id
    RETURNING * INTO vendor;
  IF vendor.id IS NULL THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'admin', 'vendor_rejected', 'trading_vendor', vendor.id::text,
    jsonb_build_object('reason', _reason));
  RETURN vendor;
END; $$;

CREATE OR REPLACE FUNCTION public.suspend_trading_vendor(_vendor_id uuid, _reason text DEFAULT NULL)
RETURNS public.trading_vendors
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE vendor public.trading_vendors;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrator access required'; END IF;
  UPDATE public.trading_vendors
    SET status = 'suspended', suspended_at = now(), suspended_by = auth.uid(), suspension_reason = _reason
    WHERE id = _vendor_id
    RETURNING * INTO vendor;
  IF vendor.id IS NULL THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'admin', 'vendor_suspended', 'trading_vendor', vendor.id::text,
    jsonb_build_object('reason', _reason));
  RETURN vendor;
END; $$;

CREATE OR REPLACE FUNCTION public.reactivate_trading_vendor(_vendor_id uuid)
RETURNS public.trading_vendors
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE vendor public.trading_vendors;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrator access required'; END IF;
  UPDATE public.trading_vendors
    SET status = 'approved', suspended_at = NULL, suspended_by = NULL, suspension_reason = NULL
    WHERE id = _vendor_id
    RETURNING * INTO vendor;
  IF vendor.id IS NULL THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'admin', 'vendor_reactivated', 'trading_vendor', vendor.id::text, '{}'::jsonb);
  RETURN vendor;
END; $$;

GRANT EXECUTE ON FUNCTION public.approve_trading_vendor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_trading_vendor(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.suspend_trading_vendor(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reactivate_trading_vendor(uuid) TO authenticated, service_role;
