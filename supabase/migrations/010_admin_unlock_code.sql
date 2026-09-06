-- Código mestre para virar admin de novo (não vai no front).
-- Troque o valor depois de rodar:
--   UPDATE app_settings SET value = 'seu-codigo-secreto' WHERE key = 'admin_unlock_code';

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO app_settings (key, value)
VALUES ('admin_unlock_code', 'troque-este-codigo-admin')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ativar_admin_com_codigo(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_secret text;
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Faça login');
  END IF;

  SELECT value INTO v_secret FROM app_settings WHERE key = 'admin_unlock_code';
  IF v_secret IS NULL OR length(trim(v_secret)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Código mestre ainda não foi definido no banco');
  END IF;
  IF trim(p_code) IS DISTINCT FROM trim(v_secret) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Código inválido');
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);

  INSERT INTO profiles (id, is_admin, is_blocked, onboarding_done, subscription_status)
  VALUES (v_uid, true, false, true, 'active')
  ON CONFLICT (id) DO UPDATE
    SET is_admin = true,
        is_blocked = false,
        onboarding_done = true,
        salon_owner_id = NULL;

  SELECT COALESCE(is_admin, false) INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'O banco impediu promover a admin. Rode o SQL 011 no Supabase.');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON TABLE app_settings FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_admin_com_codigo(text) TO authenticated;
