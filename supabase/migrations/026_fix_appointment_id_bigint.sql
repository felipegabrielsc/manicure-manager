-- appointments.id é BIGINT. O RPC gravava RETURNING id numa variável UUID → uuid:"49".
-- O 023 não está no banco (marcar ainda chama validar). Cole INTEIRO e rode.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('marcar_horario_site', 'pedir_horario')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $$;

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
  v_sid text;
  v_row record;
  v_found boolean := false;
  v_service_id appointments.service_id%TYPE;
  v_sprice numeric;
  v_sdur integer;
  v_cupom jsonb;
  v_client_id clients.id%TYPE;
  v_phone_digits text;
  v_preco numeric;
  v_desconto numeric := 0;
  v_apt_id appointments.id%TYPE;
  v_coupon_id uuid;
  v_end timestamptz;
  v_dow integer;
  v_bh record;
  v_start_t time;
  v_end_t time;
  v_conflict integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_salon::text));

  SELECT * INTO v_perfil FROM profiles WHERE id = p_salon;
  IF v_perfil IS NULL OR v_perfil.booking_active = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Agenda fechada');
  END IF;

  v_sid := trim(p_servico);
  FOR v_row IN
    SELECT s.id, s.default_price, s.duration_minutes
    FROM services s
    WHERE s.user_id = p_salon
  LOOP
    IF btrim(v_row.id::text) = v_sid THEN
      v_found := true;
      v_service_id := v_row.id;
      v_sprice := v_row.default_price;
      v_sdur := COALESCE(v_row.duration_minutes, 60);
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_found THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Serviço inválido');
  END IF;

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

  v_end := p_quando + (v_sdur || ' minutes')::interval;
  v_dow := EXTRACT(DOW FROM p_quando AT TIME ZONE 'America/Sao_Paulo');
  v_start_t := (p_quando AT TIME ZONE 'America/Sao_Paulo')::time;
  v_end_t := (v_end AT TIME ZONE 'America/Sao_Paulo')::time;

  SELECT * INTO v_bh FROM business_hours
  WHERE user_id = p_salon AND day_of_week = v_dow;

  IF v_bh IS NULL OR v_bh.is_closed THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Dia fechado');
  END IF;

  IF v_start_t < v_bh.open_time OR v_end_t > v_bh.close_time THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Fora do expediente');
  END IF;

  IF v_bh.break_start IS NOT NULL AND v_bh.break_end IS NOT NULL
     AND v_start_t < v_bh.break_end AND v_end_t > v_bh.break_start THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Horário indisponível');
  END IF;

  SELECT COUNT(*) INTO v_conflict FROM appointments a
  WHERE a.user_id = p_salon
    AND a.status IN ('AGENDADO', 'PENDENTE')
    AND tstzrange(a.start_time, a.start_time + (v_sdur || ' minutes')::interval, '[)')
        && tstzrange(p_quando, v_end, '[)');

  IF v_conflict > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Horário ocupado');
  END IF;

  SELECT COUNT(*) INTO v_conflict FROM blocked_slots
  WHERE user_id = p_salon
    AND tstzrange(start_time, end_time, '[)') && tstzrange(p_quando, v_end, '[)');

  IF v_conflict > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Horário bloqueado');
  END IF;

  v_preco := COALESCE(v_sprice, 0);

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
    client_id, service_id, start_time, agreed_price, status, user_id, coupon_id, discount_applied
  ) VALUES (
    v_client_id, v_service_id, p_quando, v_preco, 'PENDENTE', p_salon, v_coupon_id, v_desconto
  )
  RETURNING id INTO v_apt_id;

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

GRANT EXECUTE ON FUNCTION public.marcar_horario_site(uuid, text, timestamptz, text, text, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
