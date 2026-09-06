-- O 020 não converteu a coluna (o IF do information_schema pulou) e o JOIN
-- services.id = appointments.service_id tenta transformar 34 em UUID.
-- Cole INTEIRO no SQL Editor e rode.

DO $$
DECLARE
  r record;
  apt_typ text;
  svc_typ text;
  dest text;
BEGIN
  SELECT t.typname INTO apt_typ
  FROM pg_attribute a
  JOIN pg_type t ON t.oid = a.atttypid
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'appointments'
    AND a.attname = 'service_id' AND NOT a.attisdropped;

  SELECT t.typname INTO svc_typ
  FROM pg_attribute a
  JOIN pg_type t ON t.oid = a.atttypid
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'services'
    AND a.attname = 'id' AND NOT a.attisdropped;

  RAISE NOTICE 'services.id=% appointments.service_id=%', svc_typ, apt_typ;

  BEGIN
    ALTER TABLE public.appointments ALTER COLUMN service_id DROP NOT NULL;
  EXCEPTION WHEN others THEN
    NULL;
  END;

  IF apt_typ = 'uuid' AND svc_typ IN ('int2', 'int4', 'int8') THEN
    dest := CASE svc_typ WHEN 'int2' THEN 'smallint' WHEN 'int4' THEN 'integer' ELSE 'bigint' END;

    FOR r IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
      WHERE con.conrelid = 'public.appointments'::regclass
        AND con.contype = 'f'
        AND att.attname = 'service_id'
    LOOP
      EXECUTE format('ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;

    ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS service_id_num bigint;
    ALTER TABLE public.appointments DROP COLUMN service_id CASCADE;
    ALTER TABLE public.appointments RENAME COLUMN service_id_num TO service_id;
    IF dest <> 'bigint' THEN
      EXECUTE format('ALTER TABLE public.appointments ALTER COLUMN service_id TYPE %s', dest);
    END IF;
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;
  END IF;
END $$;

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
    AND tstzrange(
      a.start_time,
      a.start_time + (
        COALESCE(
          (
            SELECT s.duration_minutes FROM services s
            WHERE s.id::text = a.service_id::text
            LIMIT 1
          ),
          60
        ) || ' minutes'
      )::interval,
      '[)'
    ) && tstzrange(p_start_time, v_end, '[)')
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

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'solicitar_horario_publico'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $$;

CREATE FUNCTION public.solicitar_horario_publico(
  p_user_id uuid,
  p_servico_codigo text,
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
  v_apt_svc_typ text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT * INTO v_perfil FROM profiles WHERE id = p_user_id;
  IF v_perfil IS NULL OR v_perfil.booking_active = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Agenda fechada');
  END IF;

  SELECT * INTO v_servico FROM services
  WHERE user_id = p_user_id AND id::text = trim(p_servico_codigo);
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

  v_valid := public.validar_horario_agendamento(p_user_id, p_start_time, v_duration, NULL);
  IF COALESCE(v_valid->>'valid', 'false') <> 'true' THEN
    RETURN jsonb_build_object('ok', false, 'reason', COALESCE(v_valid->>'reason', 'Horário indisponível'));
  END IF;

  v_preco := COALESCE(v_servico.default_price, 0);

  IF p_coupon_code IS NOT NULL AND length(trim(p_coupon_code)) > 0 THEN
    v_cupom := public.validar_cupom(p_user_id, p_coupon_code);
    IF COALESCE(v_cupom->>'valid', 'false') <> 'true' THEN
      RETURN jsonb_build_object('ok', false, 'reason', COALESCE(v_cupom->>'reason', 'Cupom inválido'));
    END IF;
    v_coupon_id := NULLIF(trim(v_cupom->>'coupon_id'), '')::uuid;
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

  SELECT t.typname INTO v_apt_svc_typ
  FROM pg_attribute a
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE a.attrelid = 'public.appointments'::regclass
    AND a.attname = 'service_id'
    AND NOT a.attisdropped;

  IF v_apt_svc_typ = 'uuid' THEN
    INSERT INTO appointments (
      client_id, start_time, agreed_price, status, user_id, coupon_id, discount_applied
    ) VALUES (
      v_client_id, p_start_time, v_preco, 'PENDENTE', p_user_id, v_coupon_id, v_desconto
    )
    RETURNING id INTO v_apt_id;
  ELSE
    INSERT INTO appointments (
      client_id, service_id, start_time, agreed_price, status, user_id, coupon_id, discount_applied
    ) VALUES (
      v_client_id, v_servico.id, p_start_time, v_preco, 'PENDENTE', p_user_id, v_coupon_id, v_desconto
    )
    RETURNING id INTO v_apt_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', v_apt_id,
    'whatsapp', v_perfil.whatsapp,
    'price', v_preco
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_horario_agendamento(uuid, timestamptz, integer, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_horario_publico(uuid, text, timestamptz, text, text, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
