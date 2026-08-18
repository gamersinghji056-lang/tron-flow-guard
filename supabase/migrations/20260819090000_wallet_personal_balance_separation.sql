-- Wallet hardening:
-- 1. Personal wallet on-chain receipts update personal on-chain balance only.
-- 2. Internal DB wallet transfers cannot debit non-custodial personal wallets.

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
  next_balance numeric;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN QUERY SELECT false, 0::numeric;
    RETURN;
  END IF;

  SELECT id INTO already FROM public.wallet_transactions
   WHERE txid = _txid AND wallet_id = _wallet_id;
  IF already IS NOT NULL THEN
    SELECT * INTO target FROM public.user_wallets WHERE id = _wallet_id;
    RETURN QUERY SELECT false, COALESCE(target.onchain_balance, target.balance, 0);
    RETURN;
  END IF;

  SELECT * INTO target FROM public.user_wallets WHERE id = _wallet_id FOR UPDATE;
  IF target.id IS NULL OR target.network <> _network THEN
    RETURN QUERY SELECT false, 0::numeric;
    RETURN;
  END IF;

  next_balance := COALESCE(target.onchain_balance, 0) + _amount;

  UPDATE public.user_wallets
     SET onchain_balance = next_balance,
         last_synced_at = now(),
         onchain_checked_at = now(),
         activated_on_chain = true,
         first_seen_txid = COALESCE(first_seen_txid, _txid)
   WHERE id = target.id
  RETURNING * INTO target;

  INSERT INTO public.wallet_transactions
    (wallet_id, user_id, direction, kind, status, amount, counterparty_address,
     network, txid, block_number, onchain, balance_after, memo)
  VALUES (target.id, target.user_id, 'in', 'deposit', 'completed', _amount,
          _from_address, _network, _txid, _block_number, true, next_balance,
          'On-chain USDT personal wallet receipt');

  INSERT INTO public.notifications (user_id, audience, title, body, severity)
  VALUES (target.user_id, 'trader', 'Personal wallet receipt detected',
          _amount || ' USDT received on-chain in ' || target.name, 'success');

  INSERT INTO public.audit_logs (actor_type, action, entity_type, entity_id, metadata)
  VALUES ('listener', 'wallet.onchain_credit', 'user_wallet', target.id::text,
          jsonb_build_object('amount', _amount, 'txid', _txid, 'network', _network,
                             'platform_balance_credited', false));

  RETURN QUERY SELECT true, next_balance;
END; $$;

REVOKE ALL ON FUNCTION public.credit_wallet_onchain_deposit(uuid, numeric, text, text, public.chain_network, bigint)
  FROM PUBLIC, anon, authenticated;

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
  IF src.custody = 'non_custodial' THEN
    RAISE EXCEPTION 'On-chain sending is not enabled yet.';
  END IF;
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
          _amount || ' USDT sent to ' || left(trim(_to_address), 10) || '...', 'success');

  RETURN QUERY SELECT new_tx, fee_amount, total_debit, dst.id IS NOT NULL;
END; $$;

REVOKE ALL ON FUNCTION public.wallet_transfer(uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_transfer(uuid, text, numeric, text) TO authenticated, service_role;
