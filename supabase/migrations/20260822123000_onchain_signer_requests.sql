ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS custody_capability text NOT NULL DEFAULT 'WATCH_ONLY',
  ADD COLUMN IF NOT EXISTS signer_key_version text,
  ADD COLUMN IF NOT EXISTS signing_enabled_at timestamptz;

ALTER TABLE public.wallets
  DROP CONSTRAINT IF EXISTS wallets_custody_capability_check;
ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_custody_capability_check
  CHECK (custody_capability IN ('WATCH_ONLY','SIGNING_ENABLED'));

CREATE TABLE IF NOT EXISTS public.wallet_send_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.user_wallets(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  asset text NOT NULL CHECK (asset IN ('USDT','TRX')),
  network public.chain_network NOT NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  amount numeric(24,6) NOT NULL CHECK (amount > 0),
  estimated_network_fee_trx numeric(24,6) NOT NULL DEFAULT 0,
  platform_fee numeric(24,6) NOT NULL DEFAULT 0,
  total_debit numeric(24,6) NOT NULL DEFAULT 0,
  txid text,
  status text NOT NULL DEFAULT 'CREATED'
    CHECK (status IN ('CREATED','VALIDATING','AUTHORIZED','SIGNING','SIGNED','BROADCASTING',
      'BROADCAST','CONFIRMING','CONFIRMED','FAILED','REJECTED')),
  failure_code text,
  safe_failure_message text,
  wallet_transaction_id uuid REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  signer_key_version text,
  broadcast_result jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  authorized_at timestamptz,
  signed_at timestamptz,
  broadcast_at timestamptz,
  confirmed_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, wallet_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS wallet_send_requests_wallet_created_idx
  ON public.wallet_send_requests(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_send_requests_status_idx
  ON public.wallet_send_requests(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_send_requests_one_active_per_wallet_idx
  ON public.wallet_send_requests(wallet_id)
  WHERE status IN ('CREATED','VALIDATING','AUTHORIZED','SIGNING','SIGNED','BROADCASTING','BROADCAST','CONFIRMING');

GRANT SELECT ON public.wallet_send_requests TO authenticated;
GRANT ALL ON public.wallet_send_requests TO service_role;
ALTER TABLE public.wallet_send_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_send_requests_select_own ON public.wallet_send_requests;
CREATE POLICY wallet_send_requests_select_own ON public.wallet_send_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE TABLE IF NOT EXISTS public.signer_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.wallet_send_requests(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'user',
  wallet_id uuid,
  asset text,
  amount numeric(24,6),
  destination text,
  network public.chain_network,
  result text NOT NULL,
  txid text,
  safe_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.signer_audit_logs TO authenticated;
GRANT ALL ON public.signer_audit_logs TO service_role;
ALTER TABLE public.signer_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signer_audit_admin_select ON public.signer_audit_logs;
CREATE POLICY signer_audit_admin_select ON public.signer_audit_logs
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.signer_request_nonces (
  nonce text PRIMARY KEY,
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.signer_request_nonces TO service_role;

CREATE TABLE IF NOT EXISTS public.fee_sweeps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'fee_liabilities',
  destination_wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  network public.chain_network NOT NULL,
  amount numeric(24,6) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USDT',
  status text NOT NULL DEFAULT 'SWEEP_REQUESTED'
    CHECK (status IN ('ACCRUED','ELIGIBLE','SWEEP_REQUESTED','BROADCAST','CONFIRMED','FAILED')),
  idempotency_key text NOT NULL UNIQUE,
  txid text,
  safe_failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  broadcast_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fee_sweeps TO authenticated;
GRANT ALL ON public.fee_sweeps TO service_role;
ALTER TABLE public.fee_sweeps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fee_sweeps_admin_select ON public.fee_sweeps;
CREATE POLICY fee_sweeps_admin_select ON public.fee_sweeps
  FOR SELECT TO authenticated USING (public.is_admin());

ALTER TABLE public.fee_liabilities
  ADD COLUMN IF NOT EXISTS sweep_id uuid REFERENCES public.fee_sweeps(id) ON DELETE SET NULL;

INSERT INTO public.system_settings (key, value, description) VALUES
  ('on_chain_send_enabled', 'false'::jsonb, 'Emergency kill switch for personal wallet on-chain sends'),
  ('tron_signing_mainnet_enabled', 'false'::jsonb, 'Database-side guard for TRON mainnet signing'),
  ('fee_sweep_enabled', 'false'::jsonb, 'Emergency kill switch for fee sweeps'),
  ('fee_sweep_mode', '"manual"'::jsonb, 'Fee sweep mode: manual or automatic'),
  ('fee_sweep_minimum_usdt', '25'::jsonb, 'Minimum accrued USDT before manual fee sweep request')
ON CONFLICT (key) DO NOTHING;

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
    WHERE id = _destination_wallet_id AND is_active = true AND purpose = 'FEE_COLLECTION';
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
