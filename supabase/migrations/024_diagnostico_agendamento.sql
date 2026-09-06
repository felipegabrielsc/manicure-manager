-- Rode SÓ este arquivo e copie o JSON do resultado para o chat.

SELECT jsonb_pretty(jsonb_build_object(
  'funcoes', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'nome', p.proname,
      'args', pg_get_function_identity_arguments(p.oid)
    ) ORDER BY p.proname), '[]'::jsonb)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'marcar_horario_site',
        'solicitar_horario_publico',
        'criar_agendamento_publico',
        'validar_horario_agendamento',
        'pedir_horario'
      )
  ),
  'marcar_ainda_chama_validar', (
    SELECT prosrc ILIKE '%validar_horario_agendamento%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'marcar_horario_site'
    LIMIT 1
  ),
  'colunas', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'tabela', c.relname,
      'coluna', a.attname,
      'tipo', format_type(a.atttypid, a.atttypmod)
    )), '[]'::jsonb)
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('services', 'appointments')
      AND a.attname IN ('id', 'service_id')
      AND NOT a.attisdropped
  ),
  'triggers_appointments', (
    SELECT coalesce(jsonb_agg(pg_get_triggerdef(t.oid)), '[]'::jsonb)
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.appointments'::regclass
      AND NOT t.tgisinternal
  )
));
