-- Preços dos planos + galeria pública (unhas / salão).
-- Cole no SQL Editor. O e-mail de senha NÃO é SQL: use supabase/templates/recovery.html no painel Auth.

UPDATE subscription_plans
SET price = 125,
    description = 'Agenda, clientes e financeiro'
WHERE name = 'Básico';

UPDATE subscription_plans
SET price = 150,
    description = 'Tudo do Básico + fidelidade, estoque e equipe — o mais completo'
WHERE name = 'Pro';

CREATE TABLE IF NOT EXISTS portfolio_photos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_url text NOT NULL,
  storage_path text NOT NULL,
  kind text NOT NULL DEFAULT 'unha' CHECK (kind IN ('unha', 'salao')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_photos_user_idx ON portfolio_photos (user_id, created_at DESC);

ALTER TABLE portfolio_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portfolio_select_public ON portfolio_photos;
CREATE POLICY portfolio_select_public ON portfolio_photos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS portfolio_write_own ON portfolio_photos;
CREATE POLICY portfolio_write_own ON portfolio_photos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT ON TABLE portfolio_photos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE portfolio_photos TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio', 'portfolio', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS portfolio_storage_read ON storage.objects;
CREATE POLICY portfolio_storage_read ON storage.objects
  FOR SELECT USING (bucket_id = 'portfolio');

DROP POLICY IF EXISTS portfolio_storage_insert ON storage.objects;
CREATE POLICY portfolio_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS portfolio_storage_delete ON storage.objects;
CREATE POLICY portfolio_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE OR REPLACE FUNCTION public.get_perfil_publico(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p profiles%ROWTYPE;
  v_services jsonb;
  v_fotos jsonb;
BEGIN
  SELECT * INTO v_p FROM profiles WHERE id = p_user_id;
  IF v_p IS NULL OR v_p.public_profile_active = false THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', s.name,
    'default_price', s.default_price,
    'duration_minutes', COALESCE(s.duration_minutes, 60)
  ) ORDER BY s.name), '[]'::jsonb)
  INTO v_services
  FROM services s WHERE s.user_id = p_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'url', f.public_url,
    'kind', f.kind
  ) ORDER BY f.created_at DESC), '[]'::jsonb)
  INTO v_fotos
  FROM portfolio_photos f
  WHERE f.user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'profile', jsonb_build_object(
      'business_name', v_p.business_name,
      'whatsapp', v_p.whatsapp,
      'bio', v_p.bio,
      'address', v_p.address,
      'instagram', v_p.instagram,
      'booking_active', COALESCE(v_p.booking_active, true),
      'public_profile_active', true
    ),
    'services', v_services,
    'photos', v_fotos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_perfil_publico(uuid) TO anon, authenticated;
