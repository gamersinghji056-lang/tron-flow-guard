ALTER TABLE public.wallet_send_requests
  ADD COLUMN IF NOT EXISTS customer_fee_usdt numeric(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_cost_usdt numeric(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wtron_revenue_usdt numeric(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_cost_trx numeric(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_fee_trx numeric(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS network_cost_trx numeric(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wtron_revenue_trx numeric(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_provider_cost_usdt numeric(24,6),
  ADD COLUMN IF NOT EXISTS actual_network_cost_trx numeric(24,6),
  ADD COLUMN IF NOT EXISTS energy_estimated integer,
  ADD COLUMN IF NOT EXISTS energy_purchased integer,
  ADD COLUMN IF NOT EXISTS energy_consumed integer,
  ADD COLUMN IF NOT EXISTS energy_provider text,
  ADD COLUMN IF NOT EXISTS provider_order_id text,
  ADD COLUMN IF NOT EXISTS provider_order_status text,
  ADD COLUMN IF NOT EXISTS provider_quote jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.wallet_send_requests
  DROP CONSTRAINT IF EXISTS wallet_send_requests_fee_accounting_nonnegative;
ALTER TABLE public.wallet_send_requests
  ADD CONSTRAINT wallet_send_requests_fee_accounting_nonnegative
  CHECK (
    customer_fee_usdt >= 0
    AND provider_cost_usdt >= 0
    AND wtron_revenue_usdt >= 0
    AND provider_cost_trx >= 0
    AND customer_fee_trx >= 0
    AND network_cost_trx >= 0
    AND wtron_revenue_trx >= 0
  );

INSERT INTO public.system_settings (key, value, description)
VALUES
  ('usdt_total_transfer_fee', '1.5'::jsonb, 'Authoritative total customer fee for normal USDT wallet sends'),
  ('tron_energy_route_enabled', 'false'::jsonb, 'Enables TRON Energy rental before normal USDT wallet sends'),
  ('tron_energy_provider', '"tronrental"'::jsonb, 'Selected TRON Energy rental provider'),
  ('tron_energy_buffer_percent', '12'::jsonb, 'Safety buffer added to live Energy estimation before purchase'),
  ('trx_min_transfer_fee', '5'::jsonb, 'Minimum total customer fee for normal TRX wallet sends'),
  ('trx_max_transfer_fee', '8'::jsonb, 'Maximum total customer fee for normal TRX wallet sends'),
  ('trx_transfer_fee_margin', '4'::jsonb, 'Configured WTRON margin added to estimated TRX network cost before clamping')
ON CONFLICT (key) DO NOTHING;
