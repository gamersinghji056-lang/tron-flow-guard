-- ============ personal wallets ============
CREATE TABLE public.user_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  network public.chain_network NOT NULL DEFAULT 'trc20-nile',
  address text NOT NULL,
  derivation_index integer NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_wallets_address_key ON public.user_wallets (address);
CREATE INDEX user_wallets_user_idx ON public.user_wallets (user_id);

GRANT SELECT, UPDATE ON public.user_wallets TO authenticated;
GRANT ALL ON public.user_wallets TO service_role;
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_wallets_select_own ON public.user_wallets
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY user_wallets_update_own ON public.user_wallets
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER user_wallets_touch BEFORE UPDATE ON public.user_wallets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- single default per user
CREATE OR REPLACE FUNCTION public.enforce_single_default_user_wallet()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.user_wallets SET is_default = false
     WHERE id <> NEW.id AND user_id = NEW.user_id AND is_default;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER user_wallets_single_default AFTER INSERT OR UPDATE ON public.user_wallets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_user_wallet();

-- ============ wallet ledger ============
CREATE TYPE public.wallet_tx_direction AS ENUM ('in','out');
CREATE TYPE public.wallet_tx_kind AS ENUM ('deposit','transfer','fee','adjustment');
CREATE TYPE public.wallet_tx_status AS ENUM ('pending','broadcasting','completed','failed');

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.user_wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction public.wallet_tx_direction NOT NULL,
  kind public.wallet_tx_kind NOT NULL DEFAULT 'transfer',
  status public.wallet_tx_status NOT NULL DEFAULT 'completed',
  amount numeric NOT NULL,
  fee numeric NOT NULL DEFAULT 0,
  counterparty_address text,
  counterparty_wallet_id uuid REFERENCES public.user_wallets(id) ON DELETE SET NULL,
  memo text,
  network public.chain_network NOT NULL DEFAULT 'trc20-nile',
  txid text,
  block_number bigint,
  onchain boolean NOT NULL DEFAULT false,
  deposit_request_id uuid REFERENCES public.deposit_requests(id) ON DELETE SET NULL,
  failure_reason text,
  balance_after numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wallet_tx_wallet_idx ON public.wallet_transactions (wallet_id, created_at DESC);
CREATE INDEX wallet_tx_user_idx ON public.wallet_transactions (user_id, created_at DESC);

GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_tx_select_own ON public.wallet_transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE TRIGGER wallet_tx_touch BEFORE UPDATE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ company wallet assignment ============
CREATE TYPE public.wallet_kind AS ENUM ('deposit','hot','cold','fee');
ALTER TABLE public.wallets
  ADD COLUMN assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN wallet_kind public.wallet_kind NOT NULL DEFAULT 'deposit',
  ADD COLUMN notes text;

DROP POLICY IF EXISTS wallets_select_auth ON public.wallets;
CREATE POLICY wallets_select_scoped ON public.wallets
  FOR SELECT TO authenticated
  USING (public.is_admin() OR assigned_user_id = auth.uid());

ALTER TABLE public.deposit_requests
  ADD COLUMN credited_wallet_id uuid REFERENCES public.user_wallets(id) ON DELETE SET NULL;

-- ============ settings ============
INSERT INTO public.system_settings (key, value, description) VALUES
  ('transfer_fee_usdt', '1.5'::jsonb, 'Flat fee in USDT deducted from the sender on every outgoing transfer'),
  ('fee_wallet_address', '""'::jsonb, 'Address of the admin wallet that collects transfer fees'),
  ('onchain_broadcast_enabled', 'false'::jsonb, 'Broadcast external transfers to the TRON network')
ON CONFLICT (key) DO NOTHING;

-- ============ atomic internal transfer ============
CREATE OR REPLACE FUNCTION public.wallet_transfer(
  _from_wallet uuid,
  _to_address text,
  _amount numeric,
  _memo text DEFAULT NULL
)
RETURNS TABLE(out_tx_id uuid, fee numeric, total numeric, internal boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  src public.user_wallets;
  dst public.user_wallets;
  fee_wallet public.user_wallets;
  fee_amount numeric;
  fee_address text;
  total_debit numeric;
  new_tx uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  SELECT COALESCE((value #>> '{}')::numeric, 1.5) INTO fee_amount
    FROM public.system_settings WHERE key = 'transfer_fee_usdt';
  fee_amount := COALESCE(fee_amount, 1.5);
  SELECT (value #>> '{}') INTO fee_address
    FROM public.system_settings WHERE key = 'fee_wallet_address';

  SELECT * INTO src FROM public.user_wallets WHERE id = _from_wallet FOR UPDATE;
  IF src.id IS NULL THEN RAISE EXCEPTION 'Source wallet not found'; END IF;
  IF src.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not your wallet'; END IF;
  IF src.is_archived THEN RAISE EXCEPTION 'Wallet is archived'; END IF;
  IF trim(_to_address) = src.address THEN RAISE EXCEPTION 'Cannot send to the same wallet'; END IF;

  total_debit := _amount + fee_amount;
  IF src.balance < total_debit THEN
    RAISE EXCEPTION 'Insufficient balance: % USDT required (% + % fee)', total_debit, _amount, fee_amount;
  END IF;

  SELECT * INTO dst FROM public.user_wallets
   WHERE address = trim(_to_address) AND network = src.network FOR UPDATE;

  UPDATE public.user_wallets SET balance = balance - total_debit WHERE id = src.id
    RETURNING * INTO src;

  INSERT INTO public.wallet_transactions
    (wallet_id, user_id, direction, kind, status, amount, fee, counterparty_address,
     counterparty_wallet_id, memo, network, onchain, balance_after)
  VALUES (src.id, src.user_id, 'out', 'transfer',
          CASE WHEN dst.id IS NULL THEN 'pending' ELSE 'completed' END,
          _amount, fee_amount, trim(_to_address), dst.id, _memo, src.network,
          dst.id IS NULL, src.balance)
  RETURNING id INTO new_tx;

  IF dst.id IS NOT NULL THEN
    UPDATE public.user_wallets SET balance = balance + _amount WHERE id = dst.id
      RETURNING * INTO dst;
    INSERT INTO public.wallet_transactions
      (wallet_id, user_id, direction, kind, status, amount, fee, counterparty_address,
       counterparty_wallet_id, memo, network, balance_after)
    VALUES (dst.id, dst.user_id, 'in', 'transfer', 'completed', _amount, 0, src.address,
            src.id, _memo, dst.network, dst.balance);

    INSERT INTO public.notifications (user_id, audience, title, body, severity)
    VALUES (dst.user_id, 'trader', 'Transfer received',
            _amount || ' USDT arrived in ' || dst.name, 'success');
  END IF;

  -- fee collection
  IF fee_amount > 0 THEN
    IF fee_address IS NOT NULL AND fee_address <> '' THEN
      SELECT * INTO fee_wallet FROM public.user_wallets WHERE address = fee_address FOR UPDATE;
      IF fee_wallet.id IS NOT NULL THEN
        UPDATE public.user_wallets SET balance = balance + fee_amount WHERE id = fee_wallet.id
          RETURNING * INTO fee_wallet;
        INSERT INTO public.wallet_transactions
          (wallet_id, user_id, direction, kind, status, amount, counterparty_address,
           counterparty_wallet_id, memo, network, balance_after)
        VALUES (fee_wallet.id, fee_wallet.user_id, 'in', 'fee', 'completed', fee_amount,
                src.address, src.id, 'Transfer fee', fee_wallet.network, fee_wallet.balance);
      END IF;
    END IF;

    INSERT INTO public.notifications (user_id, audience, title, body, severity)
    VALUES (src.user_id, 'trader', 'Fee deducted',
            fee_amount || ' USDT network fee charged on your transfer', 'info');
  END IF;

  UPDATE public.profiles SET balance = GREATEST(balance - total_debit, 0) WHERE id = src.user_id;
  IF dst.id IS NOT NULL THEN
    UPDATE public.profiles SET balance = balance + _amount WHERE id = dst.user_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  VALUES (src.user_id, 'user', 'wallet.transfer', 'wallet_transaction', new_tx::text,
          jsonb_build_object('amount', _amount, 'fee', fee_amount, 'to', trim(_to_address),
                             'internal', dst.id IS NOT NULL));

  INSERT INTO public.notifications (user_id, audience, title, body, severity)
  VALUES (src.user_id, 'trader', 'Transfer sent',
          _amount || ' USDT sent to ' || left(trim(_to_address), 10) || '…', 'success');

  RETURN QUERY SELECT new_tx, fee_amount, total_debit, dst.id IS NOT NULL;
END; $$;

REVOKE ALL ON FUNCTION public.wallet_transfer(uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_transfer(uuid, text, numeric, text) TO authenticated, service_role;

-- ============ credit deposits into the trader's personal wallet ============
CREATE OR REPLACE FUNCTION public.credit_deposit(_deposit_id uuid)
RETURNS TABLE(credited boolean, amount numeric, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dep public.deposit_requests;
  target public.user_wallets;
  credit_amount numeric;
BEGIN
  SELECT * INTO dep FROM public.deposit_requests WHERE id = _deposit_id FOR UPDATE;
  IF dep.id IS NULL OR dep.credited THEN
    RETURN QUERY SELECT false, COALESCE(dep.received_amount, 0), dep.user_id;
    RETURN;
  END IF;

  credit_amount := COALESCE(dep.received_amount, dep.expected_amount);

  SELECT * INTO target FROM public.user_wallets
   WHERE user_id = dep.user_id AND NOT is_archived
   ORDER BY is_default DESC, created_at ASC LIMIT 1 FOR UPDATE;

  IF target.id IS NOT NULL THEN
    UPDATE public.user_wallets SET balance = balance + credit_amount, last_synced_at = now()
     WHERE id = target.id RETURNING * INTO target;

    INSERT INTO public.wallet_transactions
      (wallet_id, user_id, direction, kind, status, amount, counterparty_address, network,
       txid, block_number, onchain, deposit_request_id, balance_after, memo)
    VALUES (target.id, dep.user_id, 'in', 'deposit', 'completed', credit_amount,
            dep.sender_address, dep.network, dep.txid, dep.block_number, true, dep.id,
            target.balance, 'P2P deposit ' || dep.order_ref);
  END IF;

  UPDATE public.deposit_requests
     SET status = 'confirmed', credited = true, confirmed_at = now(),
         credited_wallet_id = target.id
   WHERE id = dep.id;

  UPDATE public.profiles SET balance = balance + credit_amount WHERE id = dep.user_id;

  INSERT INTO public.audit_logs (actor_type, action, entity_type, entity_id, metadata)
  VALUES ('listener', 'deposit.credited', 'deposit_request', dep.id::text,
          jsonb_build_object('amount', credit_amount, 'txid', dep.txid,
                             'wallet_id', target.id));

  RETURN QUERY SELECT true, credit_amount, dep.user_id;
END; $$;

-- ============ realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;