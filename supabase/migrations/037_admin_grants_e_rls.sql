-- Etapas 2 e 3: admin por convite (não código mestre) e isolamento entre salões.
-- Cole no SQL Editor DEPOIS da 036. Não reescreve 010/011. Não aplica sozinho na Vercel.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Trava campos sensíveis também no INSERT. salon_owner_id e is_admin só com bypass (RPCs).
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

  -- SQL Editor / jobs sem JWT: recuperação manual continua possível.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.id := auth.uid();
    NEW.is_admin := false;
    NEW.salon_owner_id := NULL;
    RETURN NEW;
  END IF;

  -- Nem a dona do salão nem o admin via API PostgREST alteram is_admin / vínculo de equipe.
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    NEW.is_admin := OLD.is_admin;
  END IF;
  IF NEW.salon_owner_id IS DISTINCT FROM OLD.salon_owner_id THEN
    NEW.salon_owner_id := OLD.salon_owner_id;
  END IF;

  IF NOT public.current_user_is_admin() THEN
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
    IF NEW.id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Sem permissão para alterar este perfil';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_sensitive ON profiles;
CREATE TRIGGER trg_protect_profile_sensitive
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.protect_profile_sensitive_fields();

-- 2) Nunca gravar user_id de outro salão quando há JWT.
CREATE OR REPLACE FUNCTION public.force_workspace_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.user_id := public.workspace_id();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointments', 'clients', 'services', 'business_hours', 'blocked_slots',
    'coupons', 'transactions', 'inventory_items', 'locations', 'staff_members',
    'loyalty_settings', 'financial_goals', 'waitlist', 'followup_reminders',
    'portfolio_photos'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_workspace_user ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_workspace_user BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE public.force_workspace_user_id()',
      t
    );
  END LOOP;
END $$;

-- 3) Código mestre deixa de promover. Quem já era admin não é desfeito.
CREATE OR REPLACE FUNCTION public.ativar_admin_com_codigo(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', false,
    'reason', 'O código mestre foi desativado. Peça um convite de admin à dona do sistema.'
  );
END;
$$;

CREATE TABLE IF NOT EXISTS admin_platform_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text UNIQUE NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_platform_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_platform_invites FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.criar_convite_admin()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_hash text;
  v_exp timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Faça login');
  END IF;
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Só quem já é admin gera convite');
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_hash := encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');
  v_exp := now() + interval '2 days';

  INSERT INTO admin_platform_invites (token_hash, created_by, expires_at)
  VALUES (v_hash, auth.uid(), v_exp);

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_exp);
END;
$$;

CREATE OR REPLACE FUNCTION public.ativar_admin_com_convite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v admin_platform_invites%ROWTYPE;
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Faça login');
  END IF;
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Convite inválido');
  END IF;

  v_hash := encode(digest(convert_to(trim(p_token), 'UTF8'), 'sha256'), 'hex');

  SELECT * INTO v FROM admin_platform_invites
  WHERE token_hash = v_hash
  FOR UPDATE;

  IF v.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Convite inválido');
  END IF;
  IF v.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Este convite já foi usado');
  END IF;
  IF v.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Este convite expirou');
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);

  INSERT INTO profiles (id, is_admin, is_blocked, onboarding_done, subscription_status, salon_owner_id)
  VALUES (v_uid, true, false, true, 'active', NULL)
  ON CONFLICT (id) DO UPDATE
    SET is_admin = true,
        is_blocked = false,
        onboarding_done = true,
        salon_owner_id = NULL;

  UPDATE admin_platform_invites
  SET used_at = now(), used_by = v_uid
  WHERE id = v.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Recuperação: só se não existir nenhum admin. Só a conta de salão mais antiga.
CREATE OR REPLACE FUNCTION public.bootstrap_primeiro_admin()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_oldest uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Faça login');
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE is_admin IS TRUE) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Já existe admin. Use um convite.');
  END IF;

  SELECT id INTO v_oldest
  FROM profiles
  WHERE salon_owner_id IS NULL
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1;

  IF v_oldest IS NULL OR v_oldest IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Só a conta original do sistema pode se promover se não houver admin.');
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE profiles
  SET is_admin = true, is_blocked = false, onboarding_done = true, salon_owner_id = NULL
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_convite_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ativar_admin_com_convite(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_primeiro_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ativar_admin_com_codigo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_convite_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_admin_com_convite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_primeiro_admin() TO authenticated;

-- Staff precisa do bypass para vincular salon_owner_id.
CREATE OR REPLACE FUNCTION public.consumir_convite_staff(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v staff_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Faça login para usar o convite');
  END IF;

  SELECT * INTO v FROM staff_invites
  WHERE token = trim(p_token) AND used_at IS NULL AND expires_at >= now();

  IF v.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Convite inválido, expirado ou já usado');
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);

  UPDATE staff_invites SET used_at = now(), used_by = v_uid WHERE id = v.id;
  UPDATE staff_members SET auth_user_id = v_uid WHERE id = v.staff_id AND user_id = v.owner_id;

  INSERT INTO profiles (id, salon_owner_id, onboarding_done, is_blocked, subscription_status, is_admin)
  VALUES (v_uid, v.owner_id, true, false, 'active', false)
  ON CONFLICT (id) DO UPDATE
    SET salon_owner_id = EXCLUDED.salon_owner_id,
        onboarding_done = true,
        is_blocked = false,
        is_admin = false;

  RETURN jsonb_build_object('ok', true, 'kind', 'staff');
END;
$$;

GRANT EXECUTE ON FUNCTION public.consumir_convite_staff(text) TO authenticated;

-- 4) Isolamento: fotos e retornos no workspace; some SELECT público de todas as fotos.
DROP POLICY IF EXISTS coupons_public_read ON coupons;

DROP POLICY IF EXISTS portfolio_select_public ON portfolio_photos;
DROP POLICY IF EXISTS portfolio_write_own ON portfolio_photos;
CREATE POLICY portfolio_select_own ON portfolio_photos
  FOR SELECT USING (user_id = public.workspace_id() OR public.current_user_is_admin());
CREATE POLICY portfolio_write_own ON portfolio_photos
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

REVOKE SELECT ON TABLE portfolio_photos FROM anon;

DROP POLICY IF EXISTS followup_own ON followup_reminders;
CREATE POLICY followup_own ON followup_reminders FOR ALL
  USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

NOTIFY pgrst, 'reload schema';
