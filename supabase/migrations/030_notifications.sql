-- Fila de notificações do salão. O envio fica no worker notification-dispatch.
-- Cole no SQL Editor depois da 029.

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id bigint REFERENCES appointments(id) ON DELETE CASCADE,
  client_id uuid,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'push', 'email', 'sms')),
  type text NOT NULL CHECK (type IN (
    'appointment_created',
    'appointment_confirmed',
    'appointment_cancelled',
    'appointment_rescheduled',
    'appointment_reminder_24h',
    'appointment_reminder_2h',
    'appointment_completed',
    'client_return_reminder',
    'waitlist_available',
    'payment_reminder',
    'birthday',
    'campaign'
  )),
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider text,
  provider_message_id text,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS notifications_due_idx
  ON notifications (next_attempt_at)
  WHERE status = 'pending';

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_own ON notifications;
CREATE POLICY notifications_own ON notifications
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notifications TO authenticated;

DROP TRIGGER IF EXISTS trg_workspace_user ON notifications;
CREATE TRIGGER trg_workspace_user
  BEFORE INSERT OR UPDATE ON notifications
  FOR EACH ROW EXECUTE PROCEDURE public.force_workspace_user_id();

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_user_id uuid,
  p_appointment_id bigint,
  p_client_id uuid,
  p_channel text,
  p_type text,
  p_scheduled_for timestamptz,
  p_status text,
  p_title text,
  p_body text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  v_key := p_user_id::text || ':' || COALESCE(p_appointment_id::text, p_client_id::text, 'none')
    || ':' || p_type || ':' || p_channel || ':'
    || to_char(p_scheduled_for AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI');

  INSERT INTO notifications (
    user_id, appointment_id, client_id, channel, type, scheduled_for, status,
    next_attempt_at, idempotency_key, payload
  ) VALUES (
    p_user_id, p_appointment_id, p_client_id, p_channel, p_type, p_scheduled_for, p_status,
    p_scheduled_for, v_key,
    jsonb_build_object('title', p_title, 'body', p_body, 'url', '/', 'text', p_title || E'\n' || p_body)
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN v_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_appointment_notifications(
  p_appointment_id bigint,
  p_rescheduled boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  apt appointments%ROWTYPE;
  v_nome text := 'Cliente';
  v_hora text;
  v_horas integer := 24;
  v_reminders boolean := true;
  v_now timestamptz := now();
  v_far timestamptz;
  v_near timestamptz;
  v_keep text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO apt FROM appointments WHERE id = p_appointment_id;
  IF apt.id IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL
     AND apt.user_id IS DISTINCT FROM public.workspace_id()
     AND NOT COALESCE(public.current_user_is_admin(), false) THEN
    RETURN;
  END IF;

  SELECT COALESCE(c.name, 'Cliente') INTO v_nome FROM clients c WHERE c.id = apt.client_id;
  v_nome := COALESCE(v_nome, 'Cliente');
  v_hora := to_char(apt.start_time AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI');

  SELECT COALESCE(p.reminder_hours_before, 24), COALESCE(p.reminders_enabled, true)
    INTO v_horas, v_reminders
  FROM profiles p WHERE p.id = apt.user_id;
  v_horas := COALESCE(v_horas, 24);
  IF v_horas < 1 THEN v_horas := 24; END IF;
  v_reminders := COALESCE(v_reminders, true);

  IF apt.status IN ('CANCELADO', 'FALTOU') THEN
    v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_cancelled', v_now, 'pending', 'Horário cancelado', v_nome || ' às ' || v_hora || '.');
    v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_cancelled', v_now, 'pending', 'Horário cancelado', v_nome || ' às ' || v_hora || '.');
  ELSIF apt.status = 'CONCLUIDO' THEN
    v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_completed', v_now, 'pending', 'Atendimento concluído', v_nome || ' às ' || v_hora || '.');
    v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_completed', v_now, 'pending', 'Atendimento concluído', v_nome || ' às ' || v_hora || '.');
  ELSIF apt.status = 'PENDENTE' THEN
    v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_created', v_now, 'pending', 'Nova solicitação', v_nome || ' pediu um horário.');
    v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_created', v_now, 'pending', 'Nova solicitação', v_nome || ' pediu um horário.');
  ELSE
    v_far := apt.start_time - make_interval(hours => v_horas);
    v_near := apt.start_time - interval '2 hours';
    IF v_far < v_now THEN v_far := v_now; END IF;
    IF v_near < v_now THEN v_near := v_now; END IF;

    IF p_rescheduled THEN
      v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_rescheduled', v_now, 'pending', 'Horário remarcado', v_nome || ' às ' || v_hora || '.');
      v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_rescheduled', v_now, 'pending', 'Horário remarcado', v_nome || ' às ' || v_hora || '.');
    ELSE
      v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_confirmed', v_now, 'pending', 'Horário confirmado', v_nome || ' às ' || v_hora || '.');
      v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_confirmed', v_now, 'pending', 'Horário confirmado', v_nome || ' às ' || v_hora || '.');
    END IF;

    IF v_reminders THEN
      v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_reminder_24h', v_far, 'pending', 'Lembrete de horário', v_nome || ' às ' || v_hora || '.');
      v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_reminder_24h', v_far, 'pending', 'Lembrete de horário', v_nome || ' às ' || v_hora || '.');
      v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_reminder_2h', v_near, 'pending', 'Lembrete de horário', v_nome || ' às ' || v_hora || '.');
      v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_reminder_2h', v_near, 'pending', 'Lembrete de horário', v_nome || ' às ' || v_hora || '.');
    ELSE
      PERFORM public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_reminder_24h', v_far, 'cancelled', 'Lembrete de horário', v_nome || ' às ' || v_hora || '.');
      PERFORM public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_reminder_24h', v_far, 'cancelled', 'Lembrete de horário', v_nome || ' às ' || v_hora || '.');
      PERFORM public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_reminder_2h', v_near, 'cancelled', 'Lembrete de horário', v_nome || ' às ' || v_hora || '.');
      PERFORM public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_reminder_2h', v_near, 'cancelled', 'Lembrete de horário', v_nome || ' às ' || v_hora || '.');
    END IF;
  END IF;

  UPDATE notifications
    SET status = 'cancelled', updated_at = now()
    WHERE appointment_id = apt.id
      AND status = 'pending'
      AND NOT (idempotency_key = ANY (v_keep));
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification(uuid, bigint, uuid, text, text, timestamptz, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_appointment_notifications(bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_appointment_notifications(bigint, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_appointment_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE notifications
      SET status = 'cancelled', updated_at = now()
      WHERE appointment_id = OLD.id AND status = 'pending';
    RETURN OLD;
  END IF;

  PERFORM public.sync_appointment_notifications(
    NEW.id,
    TG_OP = 'UPDATE'
      AND OLD.start_time IS DISTINCT FROM NEW.start_time
      AND NEW.status = 'AGENDADO'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_notifications ON appointments;
CREATE TRIGGER trg_appointment_notifications
  AFTER INSERT OR UPDATE OF status, start_time OR DELETE ON appointments
  FOR EACH ROW EXECUTE PROCEDURE public.trg_appointment_notifications();

NOTIFY pgrst, 'reload schema';
