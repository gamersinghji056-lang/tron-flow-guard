-- Vendor identities are seller-only and must not retain the default trader role
-- inserted by handle_new_user(). Vendor provisioning also enforces this for new
-- registrations; this migration normalizes existing production identities.
DELETE FROM public.user_roles trader_role
USING public.trading_vendors vendor
WHERE trader_role.user_id = vendor.user_id
  AND trader_role.role = 'trader';
