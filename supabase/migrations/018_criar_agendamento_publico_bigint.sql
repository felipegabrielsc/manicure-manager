-- O RPC antigo pede p_service_id uuid. services.id é bigint (ex.: 28).
-- Apaga TODAS as sobrecargas e recria uma só. Cole no SQL Editor e rode.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'criar_agendamento_publico'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $$;

CREATE FUNCTION public.criar_agendamento_publico(
  p_user_id uuid,
  p_service_id bigint,
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
  WHERE user_id = p_user_id AND id = p_service_id;
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

GRANT EXECUTE ON FUNCTION public.criar_agendamento_publico(uuid, bigint, timestamptz, text, text, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
