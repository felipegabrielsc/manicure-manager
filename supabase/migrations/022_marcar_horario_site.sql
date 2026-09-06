-- RPC novo, sem parâmetro uuid de serviço. Não grava service_id (coluna UUID).
-- Cole INTEIRO no SQL Editor e rode.

ALTER TABLE public.appointments ALTER COLUMN service_id DROP NOT NULL;

DROP FUNCTION IF EXISTS public.validar_horario_agendamento(uuid, timestamptz, integer);
DROP FUNCTION IF EXISTS public.validar_horario_agendamento(uuid, timestamptz, integer, uuid);

CREATE FUNCTION public.validar_horario_agendamento(
  p_user_id uuid,
  p_start_time timestamptz,
  p_duration_minutes integer DEFAULT 60,
  p_staff_id uuid DEFAULT NULL
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
    RETURN jsonb_build_object('valid', false, 'reason', 'Horário indisponível');
  END IF;

  SELECT COUNT(*) INTO v_conflict FROM appointments a
  WHERE a.user_id = p_user_id
    AND a.status IN ('AGENDADO', 'PENDENTE')
    AND tstzrange(a.start_time, a.start_time + (COALESCE(p_duration_minutes, 60) || ' minutes')::interval, '[)')
        && tstzrange(p_start_time, v_end, '[)')
    AND (
      p_staff_id IS NULL
      OR a.staff_id IS NULL
      OR a.staff_id = p_staff_id
    );

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

DROP FUNCTION IF EXISTS public.marcar_horario_site(uuid, text, timestamptz, text, text, text);

CREATE FUNCTION public.marcar_horario_site(
  p_salon uuid,
  p_servico text,
  p_quando timestamptz,
  p_nome text,
  p_whatsapp text,
  p_cupom text DEFAULT NULL
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
  PERFORM pg_advisory_xact_lock(hashtext(p_salon::text));

  SELECT * INTO v_perfil FROM profiles WHERE id = p_salon;
  IF v_perfil IS NULL OR v_perfil.booking_active = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Agenda fechada');
  END IF;

  SELECT * INTO v_servico FROM services
  WHERE user_id = p_salon AND id::text = trim(p_servico);
  IF v_servico IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Serviço inválido');
  END IF;

  v_duration := COALESCE(v_servico.duration_minutes, 60);
  v_phone_digits := regexp_replace(COALESCE(p_whatsapp, ''), '\D', '', 'g');

  IF length(v_phone_digits) < 10 OR length(trim(p_nome)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Nome ou WhatsApp inválido');
  END IF;

  IF EXISTS (
    SELECT 1 FROM appointments a
    JOIN clients c ON c.id = a.client_id
    WHERE a.user_id = p_salon
      AND a.status = 'PENDENTE'
      AND regexp_replace(c.phone, '\D', '', 'g') = v_phone_digits
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Você já tem um agendamento pendente.');
  END IF;

  v_valid := public.validar_horario_agendamento(p_salon, p_quando, v_duration, NULL);
  IF COALESCE(v_valid->>'valid', 'false') <> 'true' THEN
    RETURN jsonb_build_object('ok', false, 'reason', COALESCE(v_valid->>'reason', 'Horário indisponível'));
  END IF;

  v_preco := COALESCE(v_servico.default_price, 0);

  IF p_cupom IS NOT NULL AND length(trim(p_cupom)) > 0 THEN
    v_cupom := public.validar_cupom(p_salon, p_cupom);
    IF COALESCE(v_cupom->>'valid', 'false') <> 'true' THEN
      RETURN jsonb_build_object('ok', false, 'reason', COALESCE(v_cupom->>'reason', 'Cupom inválido'));
    END IF;
    BEGIN
      v_coupon_id := NULLIF(trim(v_cupom->>'coupon_id'), '')::uuid;
    EXCEPTION WHEN others THEN
      v_coupon_id := NULL;
    END;
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
  WHERE user_id = p_salon
    AND regexp_replace(phone, '\D', '', 'g') = v_phone_digits
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO clients (name, phone, type, user_id)
    VALUES (trim(p_nome), p_whatsapp, 'AVULSO', p_salon)
    RETURNING id INTO v_client_id;
  END IF;

  INSERT INTO appointments (
    client_id, start_time, agreed_price, status, user_id, coupon_id, discount_applied
  ) VALUES (
    v_client_id, p_quando, v_preco, 'PENDENTE', p_salon, v_coupon_id, v_desconto
  )
  RETURNING id INTO v_apt_id;

  BEGIN
    UPDATE appointments
    SET service_id = v_servico.id
    WHERE id = v_apt_id;
  EXCEPTION WHEN others THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', v_apt_id,
    'whatsapp', v_perfil.whatsapp,
    'price', v_preco
  );
EXCEPTION
  WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'reason', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_horario_agendamento(uuid, timestamptz, integer, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_horario_site(uuid, text, timestamptz, text, text, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
