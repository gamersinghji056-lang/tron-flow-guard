-- ===========================================================================
-- Phase: blockchain correctness
-- Adds the listener checkpoint, per-wallet network binding + custody model,
-- richer deposit outcomes, and hard idempotency for credited transfers.
-- ===========================================================================

-- 1. Richer deposit outcomes (amount matching, late payment, credited).
ALTER TYPE public.deposit_status ADD VALUE IF NOT EXISTS 'underpaid';
ALTER TYPE public.deposit_status ADD VALUE IF NOT EXISTS 'overpaid';
ALTER TYPE public.deposit_status ADD VALUE IF NOT EXISTS 'late_payment';
ALTER TYPE public.deposit_status ADD VALUE IF NOT EXISTS 'review';
ALTER TYPE public.deposit_status ADD VALUE IF NOT EXISTS 'credited';

-- 2. Listener checkpoint / reconciliation cursor, one row per network.
CREATE TABLE IF NOT EXISTS public.listener_state (
  network public.chain_network PRIMARY KEY,
  last_processed_block bigint NOT NULL DEFAULT 0,
  chain_head_block bigint,
  addresses_monitored integer NOT NULL DEFAULT 0,
  last_poll_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  reconcile_cursor timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.listener_state TO authenticated;
GRANT ALL ON public.listener_state TO service_role;
ALTER TABLE public.listener_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listener_state_admin_read" ON public.listener_state
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TRIGGER listener_state_touch BEFORE UPDATE ON public.listener_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.listener_state (network) VALUES ('trc20-nile'), ('trc20-mainnet')
  ON CONFLICT (network) DO NOTHING;

-- 3. Custody model + on-chain lifecycle on personal wallets.
--    'custodial'     -> platform derives and holds the key (P2P infrastructure)
--    'non_custodial' -> key material generated for and held by the owner only
ALTER TABLE public.user_wallets
  ADD COLUMN IF NOT EXISTS custody text NOT NULL DEFAULT 'custodial',
  ADD COLUMN IF NOT EXISTS monitored boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS activated_on_chain boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_seen_txid text,
  ADD COLUMN IF NOT EXISTS onchain_balance numeric(30,6),
  ADD COLUMN IF NOT EXISTS onchain_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS backup_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_key text;

ALTER TABLE public.user_wallets
  DROP CONSTRAINT IF EXISTS user_wallets_custody_check;
ALTER TABLE public.user_wallets
  ADD CONSTRAINT user_wallets_custody_check
  CHECK (custody IN ('custodial', 'non_custodial'));

-- A TRON address belongs to exactly one chain; never poll it on another.
ALTER TABLE public.user_wallets
  DROP CONSTRAINT IF EXISTS user_wallets_address_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_wallets_address_network_key
  ON public.user_wallets (address, network);

-- 4. Hard idempotency: one credited ledger row per on-chain transaction.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_txid_unique
  ON public.wallet_transactions (txid, wallet_id) WHERE txid IS NOT NULL;

-- 5. Indexes the listener needs to enumerate monitored addresses cheaply.
CREATE INDEX IF NOT EXISTS user_wallets_monitor_idx
  ON public.user_wallets (network, monitored) WHERE NOT is_archived;
CREATE INDEX IF NOT EXISTS wallets_monitor_idx
  ON public.wallets (network, is_active);
CREATE INDEX IF NOT EXISTS deposit_requests_open_idx
  ON public.deposit_requests (wallet_id, network, status);
CREATE INDEX IF NOT EXISTS blockchain_events_addr_idx
  ON public.blockchain_events (wallet_address, network);
CREATE INDEX IF NOT EXISTS transactions_deposit_idx
  ON public.transactions (deposit_request_id);

-- 6. Idempotent direct credit for a personal wallet receiving USDT on-chain.
--    Used by the listener for transfers that are NOT tied to a deposit order.
CREATE OR REPLACE FUNCTION public.credit_wallet_onchain_deposit(
  _wallet_id uuid,
  _amount numeric,
  _txid text,
  _from_address text,
  _network public.chain_network,
  _block_number bigint
) RETURNS TABLE(credited boolean, balance_after numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.user_wallets;
  already uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN QUERY SELECT false, 0::numeric;
    RETURN;
  END IF;

  -- Idempotency gate: this txid may only ever credit this wallet once.
  SELECT id INTO already FROM public.wallet_transactions
   WHERE txid = _txid AND wallet_id = _wallet_id;
  IF already IS NOT NULL THEN
    SELECT * INTO target FROM public.user_wallets WHERE id = _wallet_id;
    RETURN QUERY SELECT false, COALESCE(target.balance, 0);
    RETURN;
  END IF;

  SELECT * INTO target FROM public.user_wallets WHERE id = _wallet_id FOR UPDATE;
  IF target.id IS NULL OR target.network <> _network THEN
    RETURN QUERY SELECT false, 0::numeric;
    RETURN;
  END IF;

  UPDATE public.user_wallets
     SET balance = balance + _amount,
         last_synced_at = now(),
         activated_on_chain = true,
         first_seen_txid = COALESCE(first_seen_txid, _txid)
   WHERE id = target.id
  RETURNING * INTO target;

  INSERT INTO public.wallet_transactions
    (wallet_id, user_id, direction, kind, status, amount, counterparty_address,
     network, txid, block_number, onchain, balance_after, memo)
  VALUES (target.id, target.user_id, 'in', 'deposit', 'completed', _amount,
          _from_address, _network, _txid, _block_number, true, target.balance,
          'On-chain USDT deposit');

  UPDATE public.profiles SET balance = balance + _amount WHERE id = target.user_id;

  INSERT INTO public.notifications (user_id, audience, title, body, severity)
  VALUES (target.user_id, 'trader', 'Deposit credited',
          _amount || ' USDT received in ' || target.name, 'success');

  INSERT INTO public.audit_logs (actor_type, action, entity_type, entity_id, metadata)
  VALUES ('listener', 'wallet.onchain_credit', 'user_wallet', target.id::text,
          jsonb_build_object('amount', _amount, 'txid', _txid, 'network', _network));

  RETURN QUERY SELECT true, target.balance;
END; $$;

REVOKE ALL ON FUNCTION public.credit_wallet_onchain_deposit(uuid, numeric, text, text, public.chain_network, bigint) FROM PUBLIC, anon, authenticated;

-- 7. Settings the corrected listener and amount-matching policy require.
INSERT INTO public.system_settings (key, value, description) VALUES
  ('overpayment_policy', '"credit_full"', 'How to treat an overpaid deposit: credit_full | credit_expected | review'),
  ('underpayment_policy', '"review"', 'How to treat an underpaid deposit: review | credit_received'),
  ('amount_tolerance_usdt', '0.01', 'Absolute USDT tolerance when matching an on-chain amount to a deposit order'),
  ('late_payment_policy', '"credit"', 'How to treat a payment that arrives after order expiry: credit | review'),
  ('listener_stale_seconds', '120', 'A listener heartbeat older than this marks the service DEGRADED/OFFLINE'),
  ('monitor_personal_wallets', 'true', 'Poll trader personal wallet addresses in addition to company deposit wallets')
ON CONFLICT (key) DO NOTHING;