-- Tabela de convites + permissão para o painel Admin inserir sem o RPC criar_convite.

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

GRANT SELECT, INSERT, UPDATE ON TABLE invites TO authenticated;

DROP POLICY IF EXISTS invites_admin ON invites;
CREATE POLICY invites_admin ON invites
  FOR ALL USING (
    public.current_user_is_admin()
    OR auth.uid() = '9bcc70ad-16b6-4d91-b64d-28c44ba75795'
  )
  WITH CHECK (
    public.current_user_is_admin()
    OR auth.uid() = '9bcc70ad-16b6-4d91-b64d-28c44ba75795'
  );

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
  WHERE token = trim(p_token) AND used_at IS NULL AND expires_at >= now()
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Convite inválido, expirado ou já usado');
  END IF;
  UPDATE profiles
  SET is_blocked = false,
      subscription_status = COALESCE(subscription_status, 'trial'),
      trial_ends_at = COALESCE(trial_ends_at, now() + interval '14 days')
  WHERE id = v_uid;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_convite(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_convite(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
