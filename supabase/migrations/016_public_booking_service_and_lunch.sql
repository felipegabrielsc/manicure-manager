-- 400 no criar_agendamento_publico: o serviço é bigint/int, o RPC antigo pedia uuid.
-- Almoço recorrente em business_hours (break_start / break_end).

ALTER TABLE business_hours ADD COLUMN IF NOT EXISTS break_start time;
ALTER TABLE business_hours ADD COLUMN IF NOT EXISTS break_end time;

CREATE OR REPLACE FUNCTION public.validar_horario_agendamento(
  p_user_id uuid,
  p_start_time timestamptz,
  p_duration_minutes integer DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end timestamptz;
  v_dow integer;
  v_bh record;
  v_conflict integer;
  v_start_t time;
  v_end_t time;
BEGIN
  v_end := p_start_time + (p_duration_minutes || ' minutes')::interval;
  v_dow := EXTRACT(DOW FROM p_start_time AT TIME ZONE 'America/Sao_Paulo');
  v_start_t := (p_start_time AT TIME ZONE 'America/Sao_Paulo')::time;
  v_end_t := (v_end AT TIME ZONE 'America/Sao_Paulo')::time;

  SELECT * INTO v_bh FROM business_hours
  WHERE user_id = p_user_id AND day_of_week = v_dow;

  IF v_bh IS NULL OR v_bh.is_closed THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Dia fechado');
  END IF;

  IF v_start_t < v_bh.open_time OR v_end_t > v_bh.close_time THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Fora do expediente');
  END IF;

  IF v_bh.break_start IS NOT NULL AND v_bh.break_end IS NOT NULL
     AND v_start_t < v_bh.break_end AND v_end_t > v_bh.break_start THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Horário de almoço');
  END IF;

  SELECT COUNT(*) INTO v_conflict FROM appointments a
  LEFT JOIN services s ON s.id = a.service_id
  WHERE a.user_id = p_user_id
    AND a.status IN ('AGENDADO', 'PENDENTE')
    AND tstzrange(a.start_time, a.start_time + (COALESCE(s.duration_minutes, 60) || ' minutes')::interval, '[)')
        && tstzrange(p_start_time, v_end, '[)');

  IF v_conflict > 0 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Horário ocupado');
  END IF;

  SELECT COUNT(*) INTO v_conflict FROM blocked_slots
  WHERE user_id = p_user_id
    AND tstzrange(start_time, end_time, '[)') && tstzrange(p_start_time, v_end, '[)');

  IF v_conflict > 0 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Horário bloqueado');
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agenda_publica(p_user_id uuid, p_day date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile jsonb;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  SELECT jsonb_build_object(
    'business_name', business_name,
    'whatsapp', whatsapp,
    'booking_active', COALESCE(booking_active, true)
  )
  INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Perfil não encontrado');
  END IF;

  v_start := (p_day::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_end := v_start + interval '1 day';

  RETURN jsonb_build_object(
    'ok', true,
    'profile', v_profile,
    'services', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'default_price', s.default_price,
        'duration_minutes', COALESCE(s.duration_minutes, 60)
      ) ORDER BY s.name)
      FROM services s WHERE s.user_id = p_user_id
    ), '[]'::jsonb),
    'business_hours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'day_of_week', b.day_of_week,
        'open_time', b.open_time,
        'close_time', b.close_time,
        'is_closed', b.is_closed,
        'break_start', b.break_start,
        'break_end', b.break_end
      ) ORDER BY b.day_of_week)
      FROM business_hours b WHERE b.user_id = p_user_id
    ), '[]'::jsonb),
    'busy', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'start', a.start_time,
        'end', a.start_time + (COALESCE(s.duration_minutes, 60) || ' minutes')::interval
      ))
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id
      WHERE a.user_id = p_user_id
        AND a.status IN ('AGENDADO', 'PENDENTE')
        AND a.start_time >= v_start AND a.start_time < v_end
    ), '[]'::jsonb),
    'blocked', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('start', bs.start_time, 'end', bs.end_time))
      FROM blocked_slots bs
      WHERE bs.user_id = p_user_id
        AND bs.start_time < v_end AND bs.end_time > v_start
    ), '[]'::jsonb)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.criar_agendamento_publico(uuid, uuid, timestamptz, text, text, text);
DROP FUNCTION IF EXISTS public.criar_agendamento_publico(uuid, bigint, timestamptz, text, text, text);
DROP FUNCTION IF EXISTS public.criar_agendamento_publico(uuid, text, timestamptz, text, text, text);

CREATE OR REPLACE FUNCTION public.criar_agendamento_publico(
  p_user_id uuid,
  p_service_id text,
  p_start_time timestamptz,
  p_client_name text,
  p_phone text,
  p_coupon_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfil profiles%ROWTYPE;
  v_servico services%ROWTYPE;
  v_valid jsonb;
  v_cupom jsonb;
  v_client_id uuid;
  v_phone_digits text;
  v_preco numeric;
  v_desconto numeric := 0;
  v_apt_id uuid;
  v_duration integer;
  v_coupon_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT * INTO v_perfil FROM profiles WHERE id = p_user_id;
  IF v_perfil IS NULL OR v_perfil.booking_active = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Agenda fechada');
  END IF;

  SELECT * INTO v_servico FROM services
  WHERE user_id = p_user_id AND id::text = trim(p_service_id);
  IF v_servico IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Serviço inválido');
  END IF;

  v_duration := COALESCE(v_servico.duration_minutes, 60);
  v_phone_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');

  IF length(v_phone_digits) < 10 OR length(trim(p_client_name)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Nome ou WhatsApp inválido');
  END IF;

  IF EXISTS (
    SELECT 1 FROM appointments a
    JOIN clients c ON c.id = a.client_id
    WHERE a.user_id = p_user_id
      AND a.status = 'PENDENTE'
      AND regexp_replace(c.phone, '\D', '', 'g') = v_phone_digits
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Você já tem um agendamento pendente.');
  END IF;

  v_valid := public.validar_horario_agendamento(p_user_id, p_start_time, v_duration);
  IF COALESCE(v_valid->>'valid', 'false') <> 'true' THEN
    RETURN jsonb_build_object('ok', false, 'reason', COALESCE(v_valid->>'reason', 'Horário indisponível'));
  END IF;

  v_preco := COALESCE(v_servico.default_price, 0);

  IF p_coupon_code IS NOT NULL AND length(trim(p_coupon_code)) > 0 THEN
    v_cupom := public.validar_cupom(p_user_id, p_coupon_code);
    IF COALESCE(v_cupom->>'valid', 'false') <> 'true' THEN
      RETURN jsonb_build_object('ok', false, 'reason', COALESCE(v_cupom->>'reason', 'Cupom inválido'));
    END IF;
    v_coupon_id := (v_cupom->>'coupon_id')::uuid;
    IF v_cupom->>'discount_type' = 'percent' THEN
      v_desconto := LEAST(v_preco, v_preco * (COALESCE((v_cupom->>'discount_value')::numeric, 0) / 100));
    ELSE
      v_desconto := LEAST(v_preco, COALESCE((v_cupom->>'discount_value')::numeric, 0));
    END IF;
    v_preco := GREATEST(0, v_preco - v_desconto);

    UPDATE coupons
    SET uses_count = COALESCE(uses_count, 0) + 1
    WHERE id = v_coupon_id
      AND (max_uses IS NULL OR uses_count < max_uses);

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'Cupom esgotado');
    END IF;
  END IF;

  SELECT id INTO v_client_id FROM clients
  WHERE user_id = p_user_id
    AND regexp_replace(phone, '\D', '', 'g') = v_phone_digits
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO clients (name, phone, type, user_id)
    VALUES (trim(p_client_name), p_phone, 'AVULSO', p_user_id)
    RETURNING id INTO v_client_id;
  END IF;

  INSERT INTO appointments (
    client_id, service_id, start_time, agreed_price, status, user_id, coupon_id, discount_applied
  ) VALUES (
    v_client_id,
    v_servico.id,
    p_start_time,
    v_preco,
    'PENDENTE',
    p_user_id,
    v_coupon_id,
    v_desconto
  )
  RETURNING id INTO v_apt_id;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', v_apt_id,
    'whatsapp', v_perfil.whatsapp,
    'price', v_preco
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_horario_agendamento(uuid, timestamptz, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agenda_publica(uuid, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_agendamento_publico(uuid, text, timestamptz, text, text, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
