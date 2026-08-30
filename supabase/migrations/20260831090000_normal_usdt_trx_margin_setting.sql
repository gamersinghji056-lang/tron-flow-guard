INSERT INTO public.system_settings (key, value, description)
VALUES
  (
    'usdt_trx_transfer_fee_margin',
    '1.5'::jsonb,
    'WTRON TRX margin added to provider Energy cost for normal USDT wallet sends'
  )
ON CONFLICT (key) DO NOTHING;

UPDATE public.system_settings
SET description = 'Authoritative total customer fee for GasFree USDT wallet sends'
WHERE key = 'usdt_total_transfer_fee';
