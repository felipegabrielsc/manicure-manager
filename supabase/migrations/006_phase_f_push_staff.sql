-- Fase F: push no servidor, conflito por profissional
-- Execute no SQL Editor DEPOIS de 005.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS push_pending_sent_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS push_reminder_sent_at timestamptz;

DROP FUNCTION IF EXISTS public.validar_horario_agendamento(uuid, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.validar_horario_agendamento(
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

GRANT EXECUTE ON FUNCTION public.validar_horario_agendamento(uuid, timestamptz, integer, uuid) TO anon, authenticated;
