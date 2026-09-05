-- Corrige 400 ao concluir horário (incrementar_fidelidade).
-- A versão da 004 dava RAISE 'Sem permissão' e isso vira HTTP 400 no PostgREST.

DROP FUNCTION IF EXISTS public.incrementar_fidelidade(uuid, uuid);

CREATE FUNCTION public.incrementar_fidelidade(p_client_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_active boolean;
  v_updated integer;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    v_uid := p_user_id;
  END IF;
  IF v_uid IS NULL OR p_client_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_ids');
  END IF;

  SELECT active INTO v_active FROM loyalty_settings WHERE user_id = v_uid;
  IF v_active IS FALSE THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  UPDATE clients
     SET loyalty_visits = COALESCE(loyalty_visits, 0) + 1
   WHERE id = p_client_id AND user_id = v_uid;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.incrementar_fidelidade(uuid, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
