-- Limita pedido público por WhatsApp, por IP e pelo total do salão.
-- O código de 4 dígitos da tela não segurava rajada. Cole depois da 035.

CREATE TABLE IF NOT EXISTS public.public_booking_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  ip text,
  phone_digits text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_booking_hits_recent_idx
  ON public.public_booking_hits (user_id, created_at DESC);

ALTER TABLE public.public_booking_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_booking_hits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.limite_pedido_publico(p_salon uuid, p_phone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip text;
  v_headers text;
  v_n integer;
BEGIN
  DELETE FROM public.public_booking_hits WHERE created_at < now() - interval '1 day';

  v_ip := NULL;
  BEGIN
    v_headers := current_setting('request.headers', true);
    IF v_headers IS NOT NULL AND left(btrim(v_headers), 1) = '{' THEN
      v_ip := split_part(btrim(COALESCE(
        v_headers::json->>'cf-connecting-ip',
        v_headers::json->>'x-forwarded-for',
        ''
      )), ',', 1);
      v_ip := NULLIF(left(btrim(v_ip), 64), '');
    END IF;
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;

  INSERT INTO public.public_booking_hits (user_id, ip, phone_digits)
  VALUES (p_salon, v_ip, left(p_phone, 20));

  SELECT COUNT(*) INTO v_n FROM public.public_booking_hits
  WHERE user_id = p_salon AND phone_digits = left(p_phone, 20)
    AND created_at > now() - interval '1 hour';
  IF v_n >= 4 THEN
    RETURN 'Muitos pedidos com este WhatsApp. Espere um pouco.';
  END IF;

  IF v_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO v_n FROM public.public_booking_hits
    WHERE user_id = p_salon AND ip = v_ip
      AND created_at > now() - interval '10 minutes';
    IF v_n >= 30 THEN
      RETURN 'Muitas tentativas deste acesso. Espere alguns minutos.';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_n FROM public.public_booking_hits
  WHERE user_id = p_salon
    AND created_at > now() - interval '10 minutes';
  IF v_n >= 20 THEN
    RETURN 'A agenda recebeu muitos pedidos agora. Tente de novo em alguns minutos.';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.limite_pedido_publico(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.marcar_horario_site(
  p_salon uuid,
  p_servico text,
  p_quando timestamptz,
  p_nome text,
  p_whatsapp text,
  p_cupom text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  v_status text := 'PENDENTE';
  v_prior integer;
  v_limite text;
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

  v_limite := public.limite_pedido_publico(p_salon, v_phone_digits);
  IF v_limite IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_limite);
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

  IF COALESCE(v_perfil.auto_confirm_public, false) THEN
    IF COALESCE(v_perfil.review_first_visit, true) THEN
      SELECT COUNT(*) INTO v_prior FROM appointments
      WHERE user_id = p_salon AND client_id = v_client_id AND status = 'CONCLUIDO';
      IF v_prior > 0 THEN
        v_status := 'AGENDADO';
      END IF;
    ELSE
      v_status := 'AGENDADO';
    END IF;
  END IF;

  INSERT INTO appointments (
    client_id, service_id, start_time, agreed_price, status, user_id, coupon_id, discount_applied
  ) VALUES (
    v_client_id, v_service_id, p_quando, v_preco, v_status, p_salon, v_coupon_id, v_desconto
  )
  RETURNING id INTO v_apt_id;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', v_apt_id,
    'whatsapp', v_perfil.whatsapp,
    'price', v_preco,
    'status', v_status
  );
EXCEPTION
  WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'reason', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_horario_site(uuid, text, timestamptz, text, text, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
