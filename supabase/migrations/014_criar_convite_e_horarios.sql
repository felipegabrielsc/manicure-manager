-- Convites de cadastro (RPC criar_convite) + horários padrão se a agenda pública vier vazia.
-- Cole no SQL Editor e rode. O 404 do criar_convite some depois deste Run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invites_admin ON invites;
CREATE POLICY invites_admin ON invites
  FOR ALL USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

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

INSERT INTO business_hours (user_id, day_of_week, open_time, close_time, is_closed)
SELECT p.id, d.dow, '09:00'::time, '18:00'::time, (d.dow = 0)
FROM profiles p
CROSS JOIN generate_series(0, 6) AS d(dow)
WHERE p.salon_owner_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM business_hours bh WHERE bh.user_id = p.id);

NOTIFY pgrst, 'reload schema';
