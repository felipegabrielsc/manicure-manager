-- Fase 1 + 2: duração de serviços, perfil público, bloqueios pontuais e lembretes
-- Execute no SQL Editor do Supabase (ou via Supabase CLI)

-- 1. Duração por serviço (minutos)
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 60;

-- 2. Campos de perfil público e lembretes
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS instagram text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_profile_active boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reminders_enabled boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reminder_hours_before integer DEFAULT 24;

-- 3. Controle de lembrete enviado
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- 4. Bloqueios pontuais de horário
CREATE TABLE IF NOT EXISTS blocked_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocked_slots_user_start ON blocked_slots(user_id, start_time);

-- 5. RLS blocked_slots
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocked_slots_select_own" ON blocked_slots;
CREATE POLICY "blocked_slots_select_own" ON blocked_slots
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "blocked_slots_insert_own" ON blocked_slots;
CREATE POLICY "blocked_slots_insert_own" ON blocked_slots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "blocked_slots_delete_own" ON blocked_slots;
CREATE POLICY "blocked_slots_delete_own" ON blocked_slots
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "blocked_slots_public_read" ON blocked_slots;
CREATE POLICY "blocked_slots_public_read" ON blocked_slots
  FOR SELECT USING (true);

-- 6. RPC opcional: validar horário no servidor (camada extra)
CREATE OR REPLACE FUNCTION validar_horario_agendamento(
  p_user_id uuid,
  p_start_time timestamptz,
  p_duration_minutes integer DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  IF (p_start_time::time) < v_bh.open_time OR (v_end::time) > v_bh.close_time THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Fora do expediente');
  END IF;

  SELECT COUNT(*) INTO v_conflict FROM appointments a
  JOIN services s ON s.id = a.service_id
  WHERE a.user_id = p_user_id
    AND a.status IN ('AGENDADO', 'PENDENTE', 'CONCLUIDO')
    AND tstzrange(a.start_time, a.start_time + (COALESCE(s.duration_minutes, 60) || ' minutes')::interval)
        && tstzrange(p_start_time, v_end);

  IF v_conflict > 0 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Horário ocupado');
  END IF;

  SELECT COUNT(*) INTO v_conflict FROM blocked_slots
  WHERE user_id = p_user_id
    AND tstzrange(start_time, end_time) && tstzrange(p_start_time, v_end);

  IF v_conflict > 0 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Horário bloqueado');
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;
