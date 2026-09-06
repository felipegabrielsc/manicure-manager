-- Fase E: convites, assinatura e trava de plano
-- Execute no SQL Editor DEPOIS de 004.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ajustar o trigger ANTES de qualquer UPDATE em profiles.
-- No SQL Editor auth.uid() não é o dono da linha → a 004 barrava o UPDATE em massa.
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

  -- SQL Editor / migration: sem JWT de usuário autenticado
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

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mp_last_payment_id text;

ALTER TABLE profiles DISABLE TRIGGER trg_protect_profile_sensitive;
UPDATE profiles
SET trial_ends_at = COALESCE(trial_ends_at, created_at, now()) + interval '14 days'
WHERE trial_ends_at IS NULL
  AND COALESCE(subscription_status, 'trial') = 'trial';
ALTER TABLE profiles ENABLE TRIGGER trg_protect_profile_sensitive;

CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  email text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invites_created_at_idx ON invites (created_at DESC);

CREATE TABLE IF NOT EXISTS billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_payment_id text UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_id uuid,
  status text,
  payload jsonb,
  processed_at timestamptz DEFAULT now()
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invites_admin ON invites;
CREATE POLICY invites_admin ON invites
  FOR ALL USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

REVOKE ALL ON TABLE billing_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.validar_convite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v invites%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Convite inválido');
  END IF;

  SELECT * INTO v FROM invites WHERE token = trim(p_token);

  IF v.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Convite inválido');
  END IF;
  IF v.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Este convite já foi usado');
  END IF;
  IF v.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Este convite expirou');
  END IF;

  RETURN jsonb_build_object('ok', true, 'email', v.email);
END;
$$;

CREATE OR REPLACE FUNCTION public.criar_convite(p_email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_id uuid;
  v_exp timestamptz;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Sem permissão');
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_exp := now() + interval '14 days';

  INSERT INTO invites (token, email, created_by, expires_at)
  VALUES (v_token, NULLIF(trim(p_email), ''), auth.uid(), v_exp)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'token', v_token,
    'expires_at', v_exp
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consumir_convite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Faça login para usar o convite');
  END IF;

  UPDATE invites
  SET used_at = now(), used_by = v_uid
  WHERE token = trim(p_token)
    AND used_at IS NULL
    AND expires_at >= now()
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Convite inválido, expirado ou já usado');
  END IF;

  UPDATE profiles
  SET
    is_blocked = false,
    subscription_status = COALESCE(subscription_status, 'trial'),
    trial_ends_at = COALESCE(trial_ends_at, now() + interval '14 days')
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_convite(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_convite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_convite(text) TO authenticated;
