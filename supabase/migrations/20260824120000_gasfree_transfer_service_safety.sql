CREATE TABLE IF NOT EXISTS public.gasfree_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.user_wallets(id) ON DELETE CASCADE,
  general_wallet_id uuid REFERENCES public.user_wallets(id) ON DELETE SET NULL,
  general_address text NOT NULL,
  gasfree_address text NOT NULL,
  network public.chain_network NOT NULL,
  asset text NOT NULL DEFAULT 'USDT',
  amount numeric(24,6) NOT NULL CHECK (amount > 0),
  recipient text NOT NULL,
  provider text NOT NULL,
  provider_request_id text,
  provider_nonce text,
  idempotency_key text NOT NULL,
  deadline_at timestamptz NOT NULL,
  txid text,
  status text NOT NULL DEFAULT 'CREATED'
    CHECK (status IN (
      'CREATED',
      'VALIDATING',
      'AUTHORIZED',
      'SUBMITTED_TO_PROVIDER',
      'BROADCAST',
      'CONFIRMING',
      'CONFIRMED',
      'FAILED',
      'EXPIRED'
    )),
  platform_fee numeric(24,6) NOT NULL DEFAULT 0,
  provider_fee numeric(24,6) NOT NULL DEFAULT 0,
  total_debit numeric(24,6) NOT NULL DEFAULT 0,
  failure_code text,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  broadcast_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gasfree_transfer_requests_user_idempotency_idx
  ON public.gasfree_transfer_requests(user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS gasfree_transfer_requests_wallet_created_idx
  ON public.gasfree_transfer_requests(wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS gasfree_transfer_requests_status_idx
  ON public.gasfree_transfer_requests(status, created_at DESC);

GRANT SELECT ON public.gasfree_transfer_requests TO authenticated;
GRANT ALL ON public.gasfree_transfer_requests TO service_role;
ALTER TABLE public.gasfree_transfer_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gasfree_transfer_requests_select_own ON public.gasfree_transfer_requests;
CREATE POLICY gasfree_transfer_requests_select_own ON public.gasfree_transfer_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

INSERT INTO public.system_settings (key, value, description) VALUES
  ('gasfree_transfer_enabled', 'false'::jsonb, 'Master enable switch for real GasFree transfer service'),
  ('gasfree_provider', '"gasfree_open_api"'::jsonb, 'Configured GasFree provider adapter name'),
  ('gasfree_mainnet_enabled', 'false'::jsonb, 'Allow GasFree transfer service on TRON Mainnet'),
  ('gasfree_supported_asset', '"USDT"'::jsonb, 'GasFree transfer supported asset'),
  ('gasfree_per_tx_max_usdt', '0'::jsonb, 'Per-transaction GasFree USDT limit; 0 disables sends'),
  ('gasfree_user_daily_max_usdt', '0'::jsonb, 'Per-user daily GasFree USDT limit; 0 disables sends'),
  ('gasfree_global_daily_max_usdt', '0'::jsonb, 'Global daily GasFree USDT limit; 0 disables sends'),
  ('gasfree_kill_switch', 'true'::jsonb, 'Emergency kill switch for GasFree transfer service'),
  ('gasfree_provider_fee_policy', '"provider_quote"'::jsonb, 'GasFree provider fee policy; no fake fee values'),
  ('gasfree_wtron_fee_policy', '"standard_wallet_transfer_fee"'::jsonb, 'WTRON platform fee policy for GasFree sends')
ON CONFLICT (key) DO NOTHING;
