-- Sinal PIX (etapa 6/7), janela de inativas 30/45/60 e campos no agendamento público.
-- Cole no SQL Editor depois da 038. Sem isto, Configurações avisa ao salvar o sinal.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deposit_mode text NOT NULL DEFAULT 'off';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deposit_value numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pix_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_deposit_mode_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_deposit_mode_check
      CHECK (deposit_mode IN ('off', 'fixed', 'percent'));
  END IF;
END $$;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_status text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_deposit_status_check'
  ) THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_deposit_status_check
      CHECK (deposit_status IN ('none', 'pending', 'paid', 'applied', 'refunded'));
  END IF;
END $$;

ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS inactive_days integer NOT NULL DEFAULT 30;

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
    'booking_active', COALESCE(booking_active, true),
    'deposit_mode', COALESCE(deposit_mode, 'off'),
    'deposit_value', COALESCE(deposit_value, 0),
    'pix_key', pix_key
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

GRANT EXECUTE ON FUNCTION public.get_agenda_publica(uuid, date) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_perfil_publico(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_p profiles%ROWTYPE;
  v_services jsonb;
  v_fotos jsonb;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'url', f.public_url,
    'extra_url', f.extra_url,
    'kind', f.kind
  ) ORDER BY f.created_at DESC), '[]'::jsonb)
  INTO v_fotos
  FROM portfolio_photos f
  WHERE f.user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'profile', jsonb_build_object(
      'business_name', v_p.business_name,
      'whatsapp', v_p.whatsapp,
      'bio', v_p.bio,
      'address', v_p.address,
      'instagram', v_p.instagram,
      'cover_url', v_p.cover_url,
      'logo_url', v_p.logo_url,
      'booking_active', COALESCE(v_p.booking_active, true),
      'public_profile_active', true,
      'deposit_mode', COALESCE(v_p.deposit_mode, 'off'),
      'deposit_value', COALESCE(v_p.deposit_value, 0),
      'pix_key', v_p.pix_key
    ),
    'services', v_services,
    'photos', v_fotos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_perfil_publico(uuid) TO anon, authenticated;
