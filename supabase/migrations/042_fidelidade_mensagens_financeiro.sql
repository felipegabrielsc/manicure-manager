-- Fidelidade começa desligada, cada cliente pode sair das mensagens do bot,
-- e mensalidade / "ainda não recebi" permanecem em aberto.
-- Cole no SQL Editor DEPOIS da 041. Não reescreva a 040.

ALTER TABLE public.loyalty_settings ALTER COLUMN active SET DEFAULT false;

UPDATE public.loyalty_settings
SET active = false, updated_at = now()
WHERE COALESCE(active, true) = true
  AND visits_required = 10
  AND COALESCE(reward_description, '1 serviço grátis') = '1 serviço grátis';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS bot_messages_enabled boolean NOT NULL DEFAULT true;

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
  v_bot boolean := true;
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

  v_bot := true;
  IF apt.client_id IS NOT NULL THEN
    SELECT COALESCE(c.name, 'Cliente'), c.phone, COALESCE(c.bot_messages_enabled, true)
      INTO v_nome, v_phone, v_bot
    FROM clients c WHERE c.id = apt.client_id;
  END IF;
  v_nome := COALESCE(v_nome, 'Cliente');
  v_bot := COALESCE(v_bot, true);

  IF NOT v_bot THEN
    UPDATE notifications
      SET status = 'cancelled', updated_at = now()
      WHERE appointment_id = apt.id
        AND status = 'pending';
    IF apt.status IN ('CANCELADO', 'FALTOU') OR p_rescheduled THEN
      PERFORM public.notify_waitlist(apt.user_id, apt.service_id);
    END IF;
    RETURN;
  END IF;

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

-- Mensalidade e "ainda não recebi" não viram pago só porque a visita foi reaberta.
CREATE OR REPLACE FUNCTION public._aplicar_conclusao(p_appointment_id bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apt appointments%ROWTYPE;
  v_client clients%ROWTYPE;
  v_staff_name text;
  v_percent numeric(8,2);
  v_service text;
  v_catalog numeric(12,2) := 0;
  v_price numeric(12,2);
  v_deposit numeric(12,2);
  v_rest numeric(12,2);
  v_when date;
  v_method text;
  v_charge_id uuid;
  v_existing financial_charges%ROWTYPE;
  v_key text;
  v_revenue boolean;
  v_competence date;
  v_due date;
  v_offset integer;
  v_due_month date;
  v_last date;
  v_day integer;
  v_fee numeric(12,2);
  v_visits integer;
BEGIN
  SELECT * INTO v_apt FROM appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR v_apt.status <> 'CONCLUIDO' THEN
    RETURN NULL;
  END IF;

  v_method := COALESCE(NULLIF(trim(v_apt.payment_method), ''), 'PENDENTE');
  v_when := (v_apt.start_time AT TIME ZONE 'America/Sao_Paulo')::date;
  v_price := round(COALESCE(v_apt.agreed_price, 0), 2);
  SELECT name, COALESCE(default_price, 0) INTO v_service, v_catalog
    FROM services WHERE id::text = v_apt.service_id::text;
  v_catalog := COALESCE(v_catalog, 0);
  IF v_price <= 0 AND v_method IN ('MENSALIDADE', 'PENDENTE') THEN
    v_price := round(v_catalog, 2);
  END IF;
  SELECT * INTO v_client FROM clients WHERE id = v_apt.client_id;
  SELECT name, COALESCE(commission_percent, 0)
    INTO v_staff_name, v_percent
  FROM staff_members WHERE id = v_apt.staff_id;

  IF v_method = 'MENSALIDADE' AND v_apt.client_id IS NOT NULL THEN
    v_competence := date_trunc('month', v_apt.start_time AT TIME ZONE 'America/Sao_Paulo')::date;
    v_key := 'mensalidade:' || v_apt.client_id::text || ':' || to_char(v_competence, 'YYYY-MM');
    v_offset := COALESCE(v_client.monthly_due_offset, 1);
    v_due_month := (v_competence + make_interval(months => v_offset))::date;
    v_last := (date_trunc('month', v_due_month) + interval '1 month - 1 day')::date;
    v_day := LEAST(GREATEST(COALESCE(v_client.monthly_due_day, 10), 1), EXTRACT(day FROM v_last)::int);
    v_due := make_date(EXTRACT(year FROM v_due_month)::int, EXTRACT(month FROM v_due_month)::int, v_day);

    SELECT * INTO v_existing FROM financial_charges
    WHERE user_id = v_apt.user_id AND source_key = v_key;
    IF v_existing.cancelled_manually THEN
      RETURN v_existing.id;
    END IF;

    INSERT INTO financial_charges (
      user_id, kind, client_id, description, competence_date, due_date,
      original_amount, source_key, status, recognizes_revenue
    ) VALUES (
      v_apt.user_id, 'MENSALIDADE', v_apt.client_id,
      'Mensalidade — ' || to_char(v_competence, 'MM/YYYY'),
      v_competence, v_due, 0, v_key, 'PENDENTE', true
    )
    ON CONFLICT (user_id, source_key) DO UPDATE
      SET due_date = EXCLUDED.due_date,
          recognizes_revenue = true,
          cancelled_at = NULL,
          updated_at = now()
    RETURNING id INTO v_charge_id;

    INSERT INTO financial_charge_items (charge_id, appointment_id, amount, description)
    VALUES (v_charge_id, v_apt.id, v_price, COALESCE(v_service, 'Visita'))
    ON CONFLICT (appointment_id) DO UPDATE
      SET charge_id = EXCLUDED.charge_id,
          amount = EXCLUDED.amount,
          description = EXCLUDED.description;

    SELECT COUNT(*), COALESCE(SUM(amount), 0)
      INTO v_visits, v_fee
    FROM financial_charge_items WHERE charge_id = v_charge_id;

    IF COALESCE(v_client.monthly_fee, 0) > 0 THEN
      v_fee := round(v_client.monthly_fee, 2);
    ELSE
      v_fee := round(v_fee, 2);
    END IF;

    UPDATE financial_charges
    SET original_amount = v_fee,
        visit_count = v_visits,
        cancelled_at = NULL,
        recognizes_revenue = true,
        status = CASE WHEN status IN ('CANCELADO', 'PAGO') THEN 'PENDENTE' ELSE status END,
        updated_at = now()
    WHERE id = v_charge_id AND NOT cancelled_manually;

    PERFORM public.recalcular_status_cobranca(v_charge_id);
    RETURN v_charge_id;
  END IF;

  v_key := 'atendimento:' || v_apt.id::text;
  v_revenue := v_method <> 'PACOTE';
  v_deposit := 0;
  IF v_apt.deposit_status IN ('paid', 'applied') THEN
    v_deposit := round(LEAST(COALESCE(v_apt.deposit_amount, 0), v_price), 2);
  END IF;

  SELECT * INTO v_existing FROM financial_charges
  WHERE user_id = v_apt.user_id AND source_key = v_key;
  IF v_existing.cancelled_manually THEN
    RETURN v_existing.id;
  END IF;

  INSERT INTO financial_charges (
    user_id, kind, appointment_id, client_id, staff_id, service_name, description,
    competence_date, due_date, original_amount, recognizes_revenue, source_key, status
  ) VALUES (
    v_apt.user_id, 'ATENDIMENTO', v_apt.id, v_apt.client_id, v_apt.staff_id, v_service,
    COALESCE(v_client.name, 'Cliente') || ' — ' || COALESCE(v_service, 'Serviço'),
    v_when, v_when, v_price, v_revenue, v_key, 'PENDENTE'
  )
  ON CONFLICT (user_id, source_key) DO UPDATE SET
    original_amount = EXCLUDED.original_amount,
    recognizes_revenue = EXCLUDED.recognizes_revenue,
    staff_id = EXCLUDED.staff_id,
    service_name = EXCLUDED.service_name,
    description = EXCLUDED.description,
    competence_date = EXCLUDED.competence_date,
    due_date = EXCLUDED.due_date,
    cancelled_at = NULL,
    updated_at = now()
  RETURNING id INTO v_charge_id;

  IF v_deposit > 0 THEN
    PERFORM public._inserir_pagamento(
      v_apt.user_id, v_charge_id, v_deposit, 'PIX', 'Sinal', v_when,
      'deposito:' || v_apt.id::text, NULL
    );
  END IF;

  IF v_revenue AND v_method IN ('PIX', 'DINHEIRO', 'CARTAO', 'OUTRO') THEN
    IF NOT EXISTS (
      SELECT 1 FROM financial_payments
      WHERE charge_id = v_charge_id
        AND entry_type = 'RECEBIMENTO'
        AND idempotency_key IS DISTINCT FROM ('deposito:' || v_apt.id::text)
        AND reversal_of IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM financial_payments e WHERE e.reversal_of = financial_payments.id
        )
    ) THEN
      v_rest := round(v_price - v_deposit, 2);
      IF v_rest > 0 THEN
        PERFORM public._inserir_pagamento(
          v_apt.user_id, v_charge_id, v_rest, v_method, NULL, v_when,
          'quitacao:' || v_apt.id::text || ':' || (
            SELECT COUNT(*) + 1 FROM financial_payments
            WHERE charge_id = v_charge_id AND idempotency_key LIKE 'quitacao:' || v_apt.id::text || ':%'
          ),
          NULL
        );
      END IF;
    END IF;
  END IF;

  IF v_revenue AND v_apt.staff_id IS NOT NULL AND COALESCE(v_percent, 0) > 0 THEN
    INSERT INTO commission_entries (
      user_id, appointment_id, staff_id, staff_name, percent_applied,
      base_amount, amount_due, status, recognized_at
    ) VALUES (
      v_apt.user_id, v_apt.id, v_apt.staff_id, v_staff_name, round(v_percent, 2),
      v_price, round(v_price * (v_percent / 100), 2), 'PENDENTE', v_when
    )
    ON CONFLICT (appointment_id) DO UPDATE
      SET status = CASE
        WHEN commission_entries.status = 'CANCELADO' THEN 'PENDENTE'
        ELSE commission_entries.status
      END,
      updated_at = now();
  END IF;

  PERFORM public.recalcular_status_cobranca(v_charge_id);
  RETURN v_charge_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverter_conclusao_atendimento(p_appointment_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_owner uuid;
  v_charge financial_charges%ROWTYPE;
  v_pay financial_payments%ROWTYPE;
  v_item_charge uuid;
  v_today date;
  v_net numeric(12,2);
  v_visits integer;
  v_fee numeric(12,2);
  v_monthly numeric(12,2);
BEGIN
  v_user := public.workspace_id();
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  SELECT user_id INTO v_owner FROM appointments WHERE id = p_appointment_id;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_user THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Atendimento não encontrado');
  END IF;

  SELECT charge_id INTO v_item_charge FROM financial_charge_items WHERE appointment_id = p_appointment_id;
  IF v_item_charge IS NOT NULL THEN
    DELETE FROM financial_charge_items WHERE appointment_id = p_appointment_id;
    SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO v_visits, v_fee
      FROM financial_charge_items WHERE charge_id = v_item_charge;
    SELECT c.monthly_fee INTO v_monthly
      FROM financial_charges ch
      JOIN clients c ON c.id = ch.client_id
      WHERE ch.id = v_item_charge;
    IF COALESCE(v_monthly, 0) > 0 THEN
      v_fee := round(v_monthly, 2);
    ELSE
      v_fee := round(COALESCE(v_fee, 0), 2);
    END IF;
    UPDATE financial_charges
    SET visit_count = v_visits,
        original_amount = CASE WHEN kind = 'MENSALIDADE' THEN v_fee ELSE original_amount END,
        updated_at = now()
    WHERE id = v_item_charge;
    SELECT round(COALESCE(SUM(CASE WHEN entry_type = 'ESTORNO' THEN -amount ELSE amount END), 0), 2)
      INTO v_net FROM financial_payments WHERE charge_id = v_item_charge;
    IF v_visits = 0 AND COALESCE(v_net, 0) <= 0 THEN
      UPDATE financial_charges
      SET cancelled_at = now(), status = 'CANCELADO', updated_at = now()
      WHERE id = v_item_charge AND NOT cancelled_manually;
    ELSE
      PERFORM public.recalcular_status_cobranca(v_item_charge);
    END IF;
  END IF;

  SELECT * INTO v_charge FROM financial_charges
  WHERE user_id = v_user AND source_key = 'atendimento:' || p_appointment_id::text;
  IF FOUND AND NOT v_charge.cancelled_manually THEN
    FOR v_pay IN
      SELECT * FROM financial_payments
      WHERE charge_id = v_charge.id
        AND entry_type = 'RECEBIMENTO'
        AND idempotency_key LIKE 'quitacao:' || p_appointment_id::text || ':%'
    LOOP
      IF NOT EXISTS (SELECT 1 FROM financial_payments WHERE reversal_of = v_pay.id) THEN
        PERFORM public._inserir_pagamento(
          v_user, v_charge.id, v_pay.amount, v_pay.method, 'Reabertura',
          v_today, 'estorno:' || v_pay.id::text, auth.uid(), 'ESTORNO', v_pay.id
        );
      END IF;
    END LOOP;

    SELECT round(COALESCE(SUM(CASE WHEN entry_type = 'ESTORNO' THEN -amount ELSE amount END), 0), 2)
      INTO v_net FROM financial_payments WHERE charge_id = v_charge.id;

    IF COALESCE(v_net, 0) <= 0 THEN
      UPDATE financial_charges
      SET cancelled_at = now(), status = 'CANCELADO', updated_at = now()
      WHERE id = v_charge.id;
    ELSE
      UPDATE financial_charges
      SET recognizes_revenue = false, cancelled_at = NULL, updated_at = now()
      WHERE id = v_charge.id;
      PERFORM public.recalcular_status_cobranca(v_charge.id);
    END IF;
  END IF;

  UPDATE commission_entries
  SET status = 'CANCELADO', updated_at = now()
  WHERE appointment_id = p_appointment_id AND user_id = v_user AND status <> 'PAGO';

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Só visita sem cobrança saudável. Não repete os últimos 120 dias.
CREATE OR REPLACE FUNCTION public.sincronizar_financeiro_existente()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  r record;
  v_count integer := 0;
BEGIN
  v_user := public.workspace_id();
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Sessão expirada');
  END IF;

  FOR r IN
    SELECT a.id
    FROM appointments a
    WHERE a.user_id = v_user
      AND a.status = 'CONCLUIDO'
      AND (
        (
          COALESCE(a.payment_method, 'PENDENTE') IS DISTINCT FROM 'MENSALIDADE'
          AND NOT EXISTS (
            SELECT 1 FROM financial_charges c
            WHERE c.appointment_id = a.id
              AND c.cancelled_at IS NULL
              AND c.status IS DISTINCT FROM 'CANCELADO'
              AND (c.recognizes_revenue OR a.payment_method = 'PACOTE')
          )
        )
        OR (
          a.payment_method = 'MENSALIDADE'
          AND NOT EXISTS (
            SELECT 1
            FROM financial_charge_items i
            JOIN financial_charges c ON c.id = i.charge_id
            WHERE i.appointment_id = a.id
              AND c.cancelled_at IS NULL
              AND c.recognizes_revenue
              AND c.status IS DISTINCT FROM 'CANCELADO'
          )
        )
      )
  LOOP
    PERFORM public._aplicar_conclusao(r.id);
    v_count := v_count + 1;
  END LOOP;

  PERFORM public._vincular_receitas(v_user);
  RETURN jsonb_build_object('ok', true, 'appointments', v_count);
END;
$$;

-- Corrige visitas já concluídas como mensalidade ou ainda não recebidas.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM appointments
    WHERE status = 'CONCLUIDO'
      AND payment_method IN ('MENSALIDADE', 'PENDENTE')
  LOOP
    PERFORM public._aplicar_conclusao(r.id);
  END LOOP;
END $$;
