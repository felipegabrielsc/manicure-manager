-- Lembrete que já passou não sai junto com a confirmação.
-- Cole no SQL Editor depois da 034. Sem este arquivo, um horário de amanhã
-- marcado de noite ainda manda o lembrete de 24h no mesmo instante da confirmação.

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
  v_phone text;
  v_servico text := 'Serviço';
  v_manutencao integer;
  v_data text;
  v_hora text;
  v_horas integer := 24;
  v_reminders boolean := true;
  v_now timestamptz := now();
  v_far timestamptz;
  v_near timestamptz;
  v_status_far text;
  v_status_near text;
  v_key text;
  v_keep text[] := ARRAY[]::text[];
  v_valor text;
  v_zap text;
  v_lembrete text;
  v_motivo text;
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

  SELECT COALESCE(c.name, 'Cliente'), c.phone INTO v_nome, v_phone FROM clients c WHERE c.id = apt.client_id;
  v_nome := COALESCE(v_nome, 'Cliente');
  SELECT COALESCE(s.name, 'Serviço'), s.maintenance_days INTO v_servico, v_manutencao
    FROM services s WHERE s.id = apt.service_id;
  v_servico := COALESCE(v_servico, 'Serviço');
  v_data := to_char(apt.start_time AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
  v_hora := to_char(apt.start_time AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI');
  v_valor := CASE
    WHEN apt.agreed_price IS NOT NULL AND apt.agreed_price > 0
      THEN 'R$ ' || to_char(apt.agreed_price, 'FM999999990.00')
    ELSE NULL
  END;

  SELECT COALESCE(p.reminder_hours_before, 24), COALESCE(p.reminders_enabled, true)
    INTO v_horas, v_reminders
  FROM profiles p WHERE p.id = apt.user_id;
  v_horas := COALESCE(v_horas, 24);
  IF v_horas < 1 THEN v_horas := 24; END IF;
  v_reminders := COALESCE(v_reminders, true);

  IF apt.status IN ('CANCELADO', 'FALTOU') THEN
    v_motivo := NULLIF(btrim(COALESCE(apt.cancellation_reason, '')), '');
    v_zap := 'Oi ' || v_nome || ', seu horário foi '
      || CASE WHEN apt.status = 'FALTOU' THEN 'marcado como falta' ELSE 'cancelado' END
      || CASE WHEN v_motivo IS NOT NULL THEN ': ' || v_motivo ELSE '' END
      || '.';
    v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_cancelled', v_now, 'pending', 'Horário cancelado', v_nome || ' às ' || v_hora || '.', NULL, v_phone, NULL);
    v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_cancelled', v_now, 'pending', 'Horário cancelado', v_nome || ' às ' || v_hora || '.', v_zap, v_phone, NULL);
  ELSIF apt.status = 'CONCLUIDO' THEN
    v_zap := 'Oi ' || v_nome || '! Obrigada pelo atendimento de ' || v_servico || '. Se puder, me conta como ficou 💜';
    v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_completed', v_now, 'pending', 'Atendimento concluído', v_nome || ' às ' || v_hora || '.', NULL, v_phone, NULL);
    v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_completed', v_now, 'pending', 'Atendimento concluído', v_nome || ' às ' || v_hora || '.', v_zap, v_phone, NULL);
    IF v_manutencao IN (15, 21, 30) THEN
      v_zap := 'Oi ' || v_nome || '! Passando para lembrar do retorno das unhas daqui a uns ' || v_manutencao || ' dias. Quando quiser, é só marcar pelo link ou me chamar aqui 💜';
      v_keep := v_keep || public.enqueue_notification(
        apt.user_id, apt.id, apt.client_id, 'whatsapp', 'client_return_reminder',
        v_now + make_interval(days => v_manutencao), 'pending',
        'Retorno', v_nome || ' em ' || v_manutencao || ' dias.', v_zap, v_phone, NULL
      );
    END IF;
  ELSIF apt.status = 'PENDENTE' THEN
    v_zap := 'Oi ' || v_nome || '! Recebi seu pedido para ' || v_data || ' às ' || v_hora || ' (' || v_servico || '). Já te confirmo por aqui.';
    v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_created', v_now, 'pending', 'Nova solicitação', v_nome || ' pediu um horário.', NULL, v_phone, NULL);
    v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_created', v_now, 'pending', 'Nova solicitação', v_nome || ' pediu um horário.', v_zap, v_phone, NULL);
  ELSE
    v_far := apt.start_time - make_interval(hours => v_horas);
    v_near := apt.start_time - interval '2 hours';
    v_status_far := CASE WHEN v_reminders AND v_far >= v_now THEN 'pending' ELSE 'cancelled' END;
    v_status_near := CASE WHEN v_reminders AND v_near >= v_now THEN 'pending' ELSE 'cancelled' END;
    v_lembrete := 'Olá ' || v_nome || '! Lembrete do seu horário: ' || v_data || ' às ' || v_hora || '.' || E'\n' || 'Serviço: ' || v_servico
      || CASE WHEN v_valor IS NOT NULL THEN E'\n' || 'Valor: ' || v_valor ELSE '' END;

    IF p_rescheduled THEN
      v_zap := 'Oi ' || v_nome || '! Seu horário foi remarcado para ' || v_data || ' às ' || v_hora || ' (' || v_servico || ').';
      v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_rescheduled', v_now, 'pending', 'Horário remarcado', v_nome || ' às ' || v_hora || '.', NULL, v_phone, NULL);
      v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_rescheduled', v_now, 'pending', 'Horário remarcado', v_nome || ' às ' || v_hora || '.', v_zap, v_phone, NULL);
    ELSE
      v_zap := 'Olá ' || v_nome || '!' || E'\n' || 'Seu horário está *confirmado*.' || E'\n'
        || '📅 ' || v_data || ' às ' || v_hora || E'\n' || '💅 ' || v_servico
        || CASE WHEN v_valor IS NOT NULL THEN E'\n' || '💰 ' || v_valor ELSE '' END
        || E'\n' || 'Te espero!';
      v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_confirmed', v_now, 'pending', 'Horário confirmado', v_nome || ' às ' || v_hora || '.', NULL, v_phone, NULL);
      v_keep := v_keep || public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_confirmed', v_now, 'pending', 'Horário confirmado', v_nome || ' às ' || v_hora || '.', v_zap, v_phone, NULL);
    END IF;

    v_key := public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_reminder_24h', v_far, v_status_far, 'Lembrete de horário', v_nome || ' às ' || v_hora || '.', NULL, v_phone, NULL);
    IF v_status_far = 'pending' THEN v_keep := v_keep || v_key; END IF;
    v_key := public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_reminder_24h', v_far, v_status_far, 'Lembrete de horário', v_nome || ' às ' || v_hora || '.', v_lembrete, v_phone, NULL);
    IF v_status_far = 'pending' THEN v_keep := v_keep || v_key; END IF;
    v_key := public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'push', 'appointment_reminder_2h', v_near, v_status_near, 'Lembrete de horário', v_nome || ' às ' || v_hora || '.', NULL, v_phone, NULL);
    IF v_status_near = 'pending' THEN v_keep := v_keep || v_key; END IF;
    v_key := public.enqueue_notification(apt.user_id, apt.id, apt.client_id, 'whatsapp', 'appointment_reminder_2h', v_near, v_status_near, 'Lembrete de horário', v_nome || ' às ' || v_hora || '.', v_lembrete, v_phone, NULL);
    IF v_status_near = 'pending' THEN v_keep := v_keep || v_key; END IF;
  END IF;

  UPDATE notifications
    SET status = 'cancelled', updated_at = now()
    WHERE appointment_id = apt.id
      AND status = 'pending'
      AND NOT (idempotency_key = ANY (v_keep));

  IF apt.status IN ('CANCELADO', 'FALTOU') OR p_rescheduled THEN
    PERFORM public.notify_waitlist(apt.user_id, apt.service_id);
  END IF;
END;
$$;
