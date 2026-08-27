-- Final product hardening: direct referrals, P2P conversation metadata,
-- customer Mainnet defaults, and protected evidence/avatar storage metadata.
-- No destructive changes.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz;

ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_order_id uuid,
  ADD COLUMN IF NOT EXISTS trade_amount_usdt numeric(24,6),
  ADD COLUMN IF NOT EXISTS rate_percent numeric(8,4),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_source_once_idx
  ON public.referral_rewards(source_type, source_order_id)
  WHERE source_type IS NOT NULL AND source_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.telegram_referral_intents (
  telegram_user_id bigint PRIMARY KEY,
  referral_code text NOT NULL,
  source text NOT NULL DEFAULT 'telegram_start',
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);

GRANT ALL ON public.telegram_referral_intents TO service_role;
ALTER TABLE public.telegram_referral_intents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.p2p_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.p2p_messages(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.p2p_orders(id) ON DELETE CASCADE,
  uploader_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_bucket text NOT NULL DEFAULT 'p2p-evidence',
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes integer NOT NULL,
  attachment_type text NOT NULL DEFAULT 'image',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p2p_message_attachments_type_check
    CHECK (attachment_type IN ('image','payment_proof','transaction_screenshot')),
  CONSTRAINT p2p_message_attachments_mime_check
    CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  CONSTRAINT p2p_message_attachments_size_check
    CHECK (file_size_bytes > 0 AND file_size_bytes <= 5242880)
);

GRANT SELECT, INSERT ON public.p2p_message_attachments TO authenticated;
GRANT ALL ON public.p2p_message_attachments TO service_role;
ALTER TABLE public.p2p_message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p2p_message_attachments_read ON public.p2p_message_attachments;
CREATE POLICY p2p_message_attachments_read ON public.p2p_message_attachments
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.p2p_orders o
      WHERE o.id = order_id
        AND (o.buyer_user_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS p2p_message_attachments_insert ON public.p2p_message_attachments;
CREATE POLICY p2p_message_attachments_insert ON public.p2p_message_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploader_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.p2p_orders o
      WHERE o.id = order_id
        AND (o.buyer_user_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

CREATE TABLE IF NOT EXISTS public.p2p_message_reads (
  order_id uuid NOT NULL REFERENCES public.p2p_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES public.p2p_messages(id) ON DELETE SET NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.p2p_message_reads TO authenticated;
GRANT ALL ON public.p2p_message_reads TO service_role;
ALTER TABLE public.p2p_message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p2p_message_reads_own ON public.p2p_message_reads;
CREATE POLICY p2p_message_reads_own ON public.p2p_message_reads
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.p2p_orders o
      WHERE o.id = order_id
        AND (o.buyer_user_id = auth.uid() OR o.seller_id = auth.uid())
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.p2p_orders o
      WHERE o.id = order_id
        AND (o.buyer_user_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

CREATE TABLE IF NOT EXISTS public.p2p_risk_acknowledgements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledgement_key text NOT NULL DEFAULT 'p2p_pre_trade_warning',
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, acknowledgement_key)
);

GRANT SELECT, INSERT, UPDATE ON public.p2p_risk_acknowledgements TO authenticated;
GRANT ALL ON public.p2p_risk_acknowledgements TO service_role;
ALTER TABLE public.p2p_risk_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p2p_risk_acknowledgements_own ON public.p2p_risk_acknowledgements;
CREATE POLICY p2p_risk_acknowledgements_own ON public.p2p_risk_acknowledgements
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

INSERT INTO public.system_settings (key, value, description) VALUES
  ('referral_campaign_enabled', 'true'::jsonb, 'Enable one-level direct referral rewards'),
  ('referral_reward_type', '"percentage"'::jsonb, 'Referral reward type'),
  ('referral_direct_rate_percent', '0.20'::jsonb, 'Direct referral commission percent of eligible completed USDT trade volume'),
  ('referral_min_rate_percent', '0.10'::jsonb, 'Minimum admin-configurable direct referral commission percent'),
  ('referral_max_rate_percent', '0.20'::jsonb, 'Maximum admin-configurable direct referral commission percent'),
  ('referral_eligible_p2p_enabled', 'true'::jsonb, 'P2P completed trades are eligible for direct referral rewards'),
  ('referral_eligible_direct_sell_enabled', 'true'::jsonb, 'WTRON Direct Sell completed trades are eligible for direct referral rewards')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION public.record_direct_referral_reward(
  _referred_user_id uuid,
  _source_type text,
  _source_order_id uuid,
  _trade_amount_usdt numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  attr public.referral_attributions;
  campaign_enabled boolean;
  p2p_enabled boolean;
  direct_enabled boolean;
  rate numeric;
  min_rate numeric;
  max_rate numeric;
  reward_amount numeric;
BEGIN
  IF _referred_user_id IS NULL OR _source_order_id IS NULL OR COALESCE(_trade_amount_usdt, 0) <= 0 THEN
    RETURN;
  END IF;

  campaign_enabled := public.get_boolean_setting('referral_campaign_enabled', true);
  p2p_enabled := public.get_boolean_setting('referral_eligible_p2p_enabled', true);
  direct_enabled := public.get_boolean_setting('referral_eligible_direct_sell_enabled', true);

  IF NOT campaign_enabled THEN
    RETURN;
  END IF;
  IF _source_type = 'p2p_order' AND NOT p2p_enabled THEN
    RETURN;
  END IF;
  IF _source_type = 'direct_sell_order' AND NOT direct_enabled THEN
    RETURN;
  END IF;

  SELECT *
    INTO attr
  FROM public.referral_attributions
  WHERE referred_user_id = _referred_user_id
    AND status IN ('pending','qualified','rewarded')
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF attr.id IS NULL OR attr.referrer_user_id = _referred_user_id THEN
    RETURN;
  END IF;

  rate := public.get_numeric_setting('referral_direct_rate_percent', 0.20);
  min_rate := public.get_numeric_setting('referral_min_rate_percent', 0.10);
  max_rate := public.get_numeric_setting('referral_max_rate_percent', 0.20);
  rate := LEAST(GREATEST(rate, min_rate), max_rate);
  reward_amount := round((_trade_amount_usdt * rate / 100)::numeric, 6);

  IF reward_amount <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.referral_attributions
    SET status = CASE WHEN status = 'pending' THEN 'qualified' ELSE status END,
        qualified_at = COALESCE(qualified_at, now())
    WHERE id = attr.id;

  INSERT INTO public.referral_rewards (
    attribution_id,
    user_id,
    amount,
    currency,
    status,
    idempotency_key,
    source_type,
    source_order_id,
    trade_amount_usdt,
    rate_percent,
    metadata
  ) VALUES (
    attr.id,
    attr.referrer_user_id,
    reward_amount,
    'USDT',
    'pending',
    _source_type || ':' || _source_order_id::text || ':' || attr.referrer_user_id::text,
    _source_type,
    _source_order_id,
    _trade_amount_usdt,
    rate,
    jsonb_build_object('referred_user_id', _referred_user_id)
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.record_direct_referral_reward(uuid, text, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_direct_referral_reward(uuid, text, uuid, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.p2p_referral_reward_after_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status::text, '') <> 'completed' THEN
    PERFORM public.record_direct_referral_reward(
      NEW.buyer_user_id,
      'p2p_order',
      NEW.id,
      NEW.usdt_amount
    );
    PERFORM public.record_direct_referral_reward(
      NEW.seller_id,
      'p2p_order',
      NEW.id,
      NEW.usdt_amount
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS p2p_referral_reward_after_completion ON public.p2p_orders;
CREATE TRIGGER p2p_referral_reward_after_completion
  AFTER UPDATE OF status ON public.p2p_orders
  FOR EACH ROW EXECUTE FUNCTION public.p2p_referral_reward_after_completion();

CREATE OR REPLACE FUNCTION public.direct_sell_referral_reward_after_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status::text, '') <> 'completed' THEN
    PERFORM public.record_direct_referral_reward(
      NEW.user_id,
      'direct_sell_order',
      NEW.id,
      NEW.expected_usdt
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS direct_sell_referral_reward_after_completion ON public.direct_sell_orders;
CREATE TRIGGER direct_sell_referral_reward_after_completion
  AFTER UPDATE OF status ON public.direct_sell_orders
  FOR EACH ROW EXECUTE FUNCTION public.direct_sell_referral_reward_after_completion();
