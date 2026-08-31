CREATE TABLE IF NOT EXISTS public.wallet_purpose_assignments (
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_id, purpose)
);

ALTER TABLE public.wallet_purpose_assignments
  DROP CONSTRAINT IF EXISTS wallet_purpose_assignments_purpose_check;
ALTER TABLE public.wallet_purpose_assignments
  ADD CONSTRAINT wallet_purpose_assignments_purpose_check
  CHECK (purpose IN ('USER_DEPOSIT','DIRECT_SELL','FEE_COLLECTION','HOT','OTHER'));

ALTER TABLE public.wallet_purpose_assignments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.wallet_purpose_assignments TO authenticated;
GRANT ALL ON public.wallet_purpose_assignments TO service_role;

DROP POLICY IF EXISTS wallet_purpose_assignments_admin_select ON public.wallet_purpose_assignments;
CREATE POLICY wallet_purpose_assignments_admin_select
  ON public.wallet_purpose_assignments
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS wallet_purpose_assignments_admin_write ON public.wallet_purpose_assignments;
CREATE POLICY wallet_purpose_assignments_admin_write
  ON public.wallet_purpose_assignments
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.wallet_purpose_assignments (wallet_id, purpose, is_active)
SELECT id, purpose, is_active
FROM public.wallets
WHERE purpose IS NOT NULL
ON CONFLICT (wallet_id, purpose)
DO UPDATE SET is_active = EXCLUDED.is_active;

CREATE TABLE IF NOT EXISTS public.user_transfer_controls (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  all_transfers_enabled boolean NOT NULL DEFAULT true,
  normal_usdt_enabled boolean NOT NULL DEFAULT true,
  normal_trx_enabled boolean NOT NULL DEFAULT true,
  gasfree_usdt_enabled boolean NOT NULL DEFAULT true,
  reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_transfer_controls ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_transfer_controls TO authenticated;
GRANT ALL ON public.user_transfer_controls TO service_role;

DROP POLICY IF EXISTS user_transfer_controls_admin_select ON public.user_transfer_controls;
CREATE POLICY user_transfer_controls_admin_select
  ON public.user_transfer_controls
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS user_transfer_controls_admin_write ON public.user_transfer_controls;
CREATE POLICY user_transfer_controls_admin_write
  ON public.user_transfer_controls
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.system_settings (key, value, description)
VALUES
  ('wallet_transfers_enabled', 'true'::jsonb, 'Product control for all customer wallet transfers'),
  ('normal_usdt_transfers_enabled', 'true'::jsonb, 'Product control for normal wallet USDT sends'),
  ('normal_trx_transfers_enabled', 'true'::jsonb, 'Product control for normal wallet TRX sends'),
  ('gasfree_usdt_transfers_enabled', 'true'::jsonb, 'Product control for GasFree wallet USDT sends'),
  ('fee_collection_wallet_id_usdt_trc20_mainnet', 'null'::jsonb, 'Active Mainnet WTRON USDT fee collection wallet'),
  ('fee_collection_wallet_id_usdt_trc20_nile', 'null'::jsonb, 'Active Nile WTRON USDT fee collection wallet'),
  ('fee_collection_wallet_id_trx_trc20_mainnet', 'null'::jsonb, 'Active Mainnet WTRON TRX fee collection wallet'),
  ('fee_collection_wallet_id_trx_trc20_nile', 'null'::jsonb, 'Active Nile WTRON TRX fee collection wallet')
ON CONFLICT (key) DO NOTHING;

UPDATE public.system_settings
SET value = '2'::jsonb,
    description = 'Configured WTRON TRX margin added to normal wallet USDT Energy/provider cost'
WHERE key = 'usdt_trx_transfer_fee_margin';

UPDATE public.system_settings
SET description = 'Authoritative total customer fee for GasFree USDT wallet sends'
WHERE key = 'usdt_total_transfer_fee';

CREATE OR REPLACE FUNCTION public.create_manual_fee_sweep(
  _destination_wallet_id uuid,
  _amount numeric,
  _idempotency_key text)
RETURNS public.fee_sweeps
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wallet public.wallets; sweep public.fee_sweeps;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  SELECT * INTO wallet FROM public.wallets
    WHERE id = _destination_wallet_id
      AND is_active = true
      AND (
        purpose = 'FEE_COLLECTION'
        OR EXISTS (
          SELECT 1
          FROM public.wallet_purpose_assignments assignment
          WHERE assignment.wallet_id = wallets.id
            AND assignment.purpose = 'FEE_COLLECTION'
            AND assignment.is_active = true
        )
      );
  IF wallet.id IS NULL THEN RAISE EXCEPTION 'Select an active fee collection wallet'; END IF;

  INSERT INTO public.fee_sweeps
    (requested_by, destination_wallet_id, network, amount, idempotency_key)
  VALUES
    (auth.uid(), wallet.id, wallet.network, _amount, _idempotency_key)
  ON CONFLICT (idempotency_key) DO UPDATE
    SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING * INTO sweep;

  UPDATE public.fee_liabilities
    SET sweep_id = sweep.id, status = 'PENDING_SWEEP'
    WHERE id IN (
      SELECT id FROM public.fee_liabilities
      WHERE currency = 'USDT' AND status IN ('ACCRUED','PENDING_SWEEP') AND sweep_id IS NULL
      ORDER BY created_at
      LIMIT 500
    );

  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'admin', 'fee_sweep.requested', 'fee_sweep', sweep.id::text,
    jsonb_build_object('amount', _amount, 'destination_wallet_id', wallet.id));
  RETURN sweep;
END; $$;

REVOKE ALL ON FUNCTION public.create_manual_fee_sweep(uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_fee_sweep(uuid,numeric,text) TO authenticated, service_role;
