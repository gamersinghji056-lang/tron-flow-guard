UPDATE public.system_settings
SET value = 'true'::jsonb,
    description = 'Admin emergency switch for personal wallet on-chain sends; false stops broadcast'
WHERE key = 'on_chain_send_enabled'
  AND value = 'false'::jsonb
  AND description = 'Emergency kill switch for personal wallet on-chain sends';

UPDATE public.system_settings
SET value = 'true'::jsonb,
    description = 'Admin guard for TRON Mainnet signing; false stops Mainnet broadcast'
WHERE key = 'tron_signing_mainnet_enabled'
  AND value = 'false'::jsonb
  AND description = 'Database-side guard for TRON mainnet signing';

UPDATE public.system_settings
SET description = 'Admin emergency switch for personal wallet on-chain sends; false stops broadcast'
WHERE key = 'on_chain_send_enabled';

UPDATE public.system_settings
SET description = 'Admin guard for TRON Mainnet signing; false stops Mainnet broadcast'
WHERE key = 'tron_signing_mainnet_enabled';
