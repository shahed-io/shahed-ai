
-- Atomic daily quota check + increment for signed-in users.
CREATE OR REPLACE FUNCTION public.consume_message_quota(_daily_limit integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := CURRENT_DATE;
  _used integer;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated', 'used', 0, 'limit', _daily_limit);
  END IF;

  INSERT INTO public.usage_daily (user_id, date, message_count, token_estimate)
  VALUES (_uid, _today, 0, 0)
  ON CONFLICT DO NOTHING;

  SELECT message_count INTO _used
  FROM public.usage_daily
  WHERE user_id = _uid AND date = _today
  FOR UPDATE;

  IF _used >= _daily_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'limit_reached', 'used', _used, 'limit', _daily_limit);
  END IF;

  UPDATE public.usage_daily
  SET message_count = message_count + 1
  WHERE user_id = _uid AND date = _today;

  RETURN jsonb_build_object('allowed', true, 'used', _used + 1, 'limit', _daily_limit, 'remaining', _daily_limit - (_used + 1));
END;
$$;

-- Ensure one row per user per day for the upsert above
CREATE UNIQUE INDEX IF NOT EXISTS usage_daily_user_date_uidx
ON public.usage_daily (user_id, date);
