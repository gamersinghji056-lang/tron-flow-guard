ALTER TABLE public.direct_sell_orders
  ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'trader',
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.trading_vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payout_account_source text NOT NULL DEFAULT 'payment_methods',
  ADD COLUMN IF NOT EXISTS vendor_payment_account_id uuid REFERENCES public.vendor_payment_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.direct_sell_orders
  DROP CONSTRAINT IF EXISTS direct_sell_orders_actor_type_check;
ALTER TABLE public.direct_sell_orders
  ADD CONSTRAINT direct_sell_orders_actor_type_check
  CHECK (actor_type IN ('trader','vendor'));

ALTER TABLE public.direct_sell_orders
  DROP CONSTRAINT IF EXISTS direct_sell_orders_payout_account_source_check;
ALTER TABLE public.direct_sell_orders
  ADD CONSTRAINT direct_sell_orders_payout_account_source_check
  CHECK (payout_account_source IN ('payment_methods','vendor_payment_accounts'));

ALTER TABLE public.direct_sell_orders
  DROP CONSTRAINT IF EXISTS direct_sell_orders_payout_source_consistency_check;
ALTER TABLE public.direct_sell_orders
  ADD CONSTRAINT direct_sell_orders_payout_source_consistency_check
  CHECK (
    (
      actor_type = 'trader'
      AND payout_account_source = 'payment_methods'
      AND vendor_payment_account_id IS NULL
      AND vendor_id IS NULL
    )
    OR
    (
      actor_type = 'vendor'
      AND payout_account_source = 'vendor_payment_accounts'
      AND vendor_payment_account_id IS NOT NULL
      AND payment_method_id IS NULL
      AND vendor_id IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS direct_sell_vendor_account_day_idx
  ON public.direct_sell_orders(vendor_payment_account_id, created_at DESC)
  WHERE payout_account_source = 'vendor_payment_accounts';

CREATE INDEX IF NOT EXISTS direct_sell_vendor_status_idx
  ON public.direct_sell_orders(vendor_id, status, created_at DESC)
  WHERE actor_type = 'vendor';

UPDATE public.direct_sell_orders
SET payment_assignment =
  COALESCE(payment_assignment, '{}'::jsonb) ||
  jsonb_build_object(
    'actor_type', actor_type,
    'payout_account_source', payout_account_source,
    'payout_account_id', COALESCE(vendor_payment_account_id, payment_method_id),
    'vendor_id', vendor_id
  )
WHERE payment_assignment IS NULL
   OR NOT (payment_assignment ? 'payout_account_source');
