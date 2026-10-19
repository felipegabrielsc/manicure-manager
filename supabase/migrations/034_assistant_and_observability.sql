-- Atendimento pelo WhatsApp (desligado por padrão) e rastro da fila.
-- Cole no SQL Editor depois da 033.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS assistant_sessions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, phone)
);

ALTER TABLE assistant_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assistant_sessions_read ON assistant_sessions;
CREATE POLICY assistant_sessions_read ON assistant_sessions
  FOR SELECT USING (user_id = public.workspace_id());
GRANT SELECT ON TABLE assistant_sessions TO authenticated;

DELETE FROM whatsapp_inbound a
USING whatsapp_inbound b
WHERE a.provider_message_id IS NOT NULL
  AND a.provider_message_id = b.provider_message_id
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_inbound_message_idx
  ON whatsapp_inbound (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notification_id uuid,
  type text,
  channel text,
  status text,
  attempt integer NOT NULL DEFAULT 0,
  phone_tail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_attempts_phone_tail_len CHECK (phone_tail IS NULL OR char_length(phone_tail) <= 4)
);

CREATE INDEX IF NOT EXISTS notification_attempts_recent_idx
  ON notification_attempts (created_at DESC);

ALTER TABLE notification_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_attempts_read ON notification_attempts;
CREATE POLICY notification_attempts_read ON notification_attempts
  FOR SELECT USING (user_id = public.workspace_id() OR public.current_user_is_admin());
GRANT SELECT ON TABLE notification_attempts TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_fila_saude()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(public.current_user_is_admin(), false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'failed', (SELECT count(*) FROM notifications WHERE status = 'failed'),
    'attention', (SELECT count(*) FROM whatsapp_connections WHERE status = 'attention')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_fila_saude() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_fila_saude() TO authenticated;

CREATE OR REPLACE FUNCTION public.assistente_cancelar(
  p_salon uuid,
  p_phone text,
  p_appointment_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text := right(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 11);
  v_id bigint;
BEGIN
  IF p_salon IS NULL OR length(v_digits) < 10 OR p_appointment_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Pedido inválido');
  END IF;

  SELECT a.id INTO v_id
  FROM appointments a
  JOIN clients c ON c.id = a.client_id
  WHERE a.id = p_appointment_id
    AND a.user_id = p_salon
    AND a.status IN ('AGENDADO', 'PENDENTE')
    AND right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 11) = v_digits;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Não achei esse horário');
  END IF;

  UPDATE appointments
    SET status = 'CANCELADO',
        cancellation_reason = 'Pedido pelo WhatsApp'
    WHERE id = v_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.assistente_remarcar(
  p_salon uuid,
  p_phone text,
  p_appointment_id bigint,
  p_quando timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text := right(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 11);
  v_id bigint;
  v_service appointments.service_id%TYPE;
  v_dur integer := 60;
  v_end timestamptz;
  v_dow integer;
  v_start_t time;
  v_end_t time;
  v_bh record;
BEGIN
  IF p_salon IS NULL OR length(v_digits) < 10 OR p_appointment_id IS NULL OR p_quando IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Pedido inválido');
  END IF;
  IF p_quando < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Não é possível agendar no passado.');
  END IF;

  SELECT a.id, a.service_id INTO v_id, v_service
  FROM appointments a
  JOIN clients c ON c.id = a.client_id
  WHERE a.id = p_appointment_id
    AND a.user_id = p_salon
    AND a.status IN ('AGENDADO', 'PENDENTE')
    AND right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 11) = v_digits;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Não achei esse horário');
  END IF;

  SELECT COALESCE(duration_minutes, 60) INTO v_dur FROM services WHERE id = v_service;
  v_dur := COALESCE(v_dur, 60);
  v_end := p_quando + make_interval(mins => v_dur);
  v_dow := EXTRACT(DOW FROM p_quando AT TIME ZONE 'America/Sao_Paulo');
  v_start_t := (p_quando AT TIME ZONE 'America/Sao_Paulo')::time;
  v_end_t := (v_end AT TIME ZONE 'America/Sao_Paulo')::time;

  SELECT * INTO v_bh FROM business_hours WHERE user_id = p_salon AND day_of_week = v_dow;
  IF v_bh IS NULL OR v_bh.is_closed THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Este dia está fechado na agenda.');
  END IF;
  IF v_start_t < v_bh.open_time OR v_end_t > v_bh.close_time THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Horário ultrapassa o expediente.');
  END IF;
  IF v_bh.break_start IS NOT NULL AND v_bh.break_end IS NOT NULL
     AND v_start_t < v_bh.break_end AND v_end_t > v_bh.break_start THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Horário de almoço.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.user_id = p_salon
      AND a.id <> v_id
      AND a.status IN ('AGENDADO', 'PENDENTE', 'CONCLUIDO')
      AND tstzrange(a.start_time, a.start_time + make_interval(mins => v_dur), '[)')
          && tstzrange(p_quando, v_end, '[)')
  ) OR EXISTS (
    SELECT 1 FROM blocked_slots b
    WHERE b.user_id = p_salon
      AND tstzrange(b.start_time, b.end_time, '[)') && tstzrange(p_quando, v_end, '[)')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Horário indisponível ou já ocupado.');
  END IF;

  UPDATE appointments SET start_time = p_quando WHERE id = v_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.assistente_cancelar(uuid, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assistente_remarcar(uuid, text, bigint, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assistente_cancelar(uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.assistente_remarcar(uuid, text, bigint, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
