-- Fase D: RLS, admin no banco, agenda pública atômica
-- Execute no SQL Editor DEPOIS de 001, 002 e 003.

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = auth.uid()), false);
$$;

REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_admin() THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      NEW.is_admin := OLD.is_admin;
    END IF;
    IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
      NEW.is_blocked := OLD.is_blocked;
    END IF;
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
      NEW.plan_id := OLD.plan_id;
    END IF;
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
      NEW.subscription_status := OLD.subscription_status;
    END IF;
    IF NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at THEN
      NEW.subscription_expires_at := OLD.subscription_expires_at;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Sem permissão para alterar este perfil';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_sensitive ON profiles;
CREATE TRIGGER trg_protect_profile_sensitive
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.protect_profile_sensitive_fields();

-- Remove policies antigas (inclusive as abertas demais)
DO $$
DECLARE
  r record;
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'appointments', 'clients', 'services', 'business_hours',
    'blocked_slots', 'coupons', 'transactions', 'subscription_plans'
  ]
  LOOP
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, t);
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own_or_admin ON profiles
  FOR SELECT USING (auth.uid() = id OR public.current_user_is_admin());
CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own_or_admin ON profiles
  FOR UPDATE USING (auth.uid() = id OR public.current_user_is_admin())
  WITH CHECK (auth.uid() = id OR public.current_user_is_admin());

CREATE POLICY appointments_own ON appointments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY clients_own ON clients
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY services_own ON services
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY business_hours_own ON business_hours
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY blocked_slots_own ON blocked_slots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY coupons_own ON coupons
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY transactions_own ON transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY plans_read_all ON subscription_plans FOR SELECT USING (true);
CREATE POLICY plans_write_admin ON subscription_plans
  FOR ALL USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

REVOKE INSERT, UPDATE, DELETE ON TABLE appointments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE clients FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE coupons FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE blocked_slots FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE profiles FROM anon;

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
BEGIN
  v_end := p_start_time + (p_duration_minutes || ' minutes')::interval;
  v_dow := EXTRACT(DOW FROM p_start_time AT TIME ZONE 'America/Sao_Paulo');

  SELECT * INTO v_bh FROM business_hours
  WHERE user_id = p_user_id AND day_of_week = v_dow;

  IF v_bh IS NULL OR v_bh.is_closed THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Dia fechado');
  END IF;

  IF (p_start_time AT TIME ZONE 'America/Sao_Paulo')::time < v_bh.open_time
     OR (v_end AT TIME ZONE 'America/Sao_Paulo')::time > v_bh.close_time THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Fora do expediente');
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

CREATE OR REPLACE FUNCTION public.validar_cupom(p_user_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon coupons%ROWTYPE;
BEGIN
  SELECT * INTO v_coupon FROM coupons
  WHERE user_id = p_user_id AND UPPER(code) = UPPER(p_code) AND active = true;

  IF v_coupon IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Cupom inválido');
  END IF;
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Cupom expirado');
  END IF;
  IF v_coupon.max_uses IS NOT NULL AND v_coupon.uses_count >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Cupom esgotado');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', v_coupon.id,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.incrementar_fidelidade(p_client_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active boolean;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  SELECT active INTO v_active FROM loyalty_settings WHERE user_id = p_user_id;
  IF v_active IS NOT FALSE THEN
    UPDATE clients SET loyalty_visits = COALESCE(loyalty_visits, 0) + 1
    WHERE id = p_client_id AND user_id = p_user_id;
  END IF;
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
        'is_closed', b.is_closed
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

CREATE OR REPLACE FUNCTION public.get_perfil_publico(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p profiles%ROWTYPE;
  v_services jsonb;
BEGIN
  SELECT * INTO v_p FROM profiles WHERE id = p_user_id;
  IF v_p IS NULL OR v_p.public_profile_active = false THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', s.name,
    'default_price', s.default_price,
    'duration_minutes', COALESCE(s.duration_minutes, 60)
  ) ORDER BY s.name), '[]'::jsonb)
  INTO v_services
  FROM services s WHERE s.user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'profile', jsonb_build_object(
      'business_name', v_p.business_name,
      'whatsapp', v_p.whatsapp,
      'bio', v_p.bio,
      'address', v_p.address,
      'instagram', v_p.instagram,
      'booking_active', COALESCE(v_p.booking_active, true),
      'public_profile_active', true
    ),
    'services', v_services
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_resumo_agendamento(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT a.id, a.start_time, a.status, a.agreed_price,
         c.name AS client_name,
         s.name AS service_name,
         COALESCE(s.duration_minutes, 60) AS duration_minutes
  INTO v_row
  FROM appointments a
  LEFT JOIN clients c ON c.id = a.client_id
  LEFT JOIN services s ON s.id = a.service_id
  WHERE a.id = p_id;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'start_time', v_row.start_time,
    'status', v_row.status,
    'agreed_price', v_row.agreed_price,
    'clients', jsonb_build_object('name', v_row.client_name),
    'services', jsonb_build_object(
      'name', v_row.service_name,
      'duration_minutes', v_row.duration_minutes,
      'default_price', v_row.agreed_price
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.criar_agendamento_publico(
  p_user_id uuid,
  p_service_id uuid,
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

  SELECT * INTO v_servico FROM services WHERE id = p_service_id AND user_id = p_user_id;
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
    p_service_id,
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
GRANT EXECUTE ON FUNCTION public.validar_cupom(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agenda_publica(uuid, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_perfil_publico(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_resumo_agendamento(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_agendamento_publico(uuid, uuid, timestamptz, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.incrementar_fidelidade(uuid, uuid) TO authenticated;
