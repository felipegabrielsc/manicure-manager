-- O código de liberação (010) marcava is_admin, mas o trigger
-- trg_protect_profile_sensitive desfazia porque a conta ainda não era admin.
-- Rode este arquivo no SQL Editor. Depois use o código de novo no app.
-- Se quiser liberar agora sem o app:
--   UPDATE profiles SET is_admin = true, is_blocked = false, onboarding_done = true, salon_owner_id = NULL
--   WHERE id = 'cole-o-uuid-da-sua-conta';

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_profile_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.current_user_is_admin() THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      NEW.is_admin := OLD.is_admin;
    END IF;
    IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
      NEW.is_blocked := OLD.is_blocked;
    END IF;
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
      NEW.plan_id := OLD.plan_id;
    END IF;
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
      NEW.subscription_status := OLD.subscription_status;
    END IF;
    IF NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at THEN
      NEW.subscription_expires_at := OLD.subscription_expires_at;
    END IF;
    IF NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
      NEW.trial_ends_at := OLD.trial_ends_at;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Sem permissão para alterar este perfil';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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

GRANT EXECUTE ON FUNCTION public.ativar_admin_com_codigo(text) TO authenticated;
