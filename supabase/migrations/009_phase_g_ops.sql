-- Fase G: espera, staff login, comissão, motivo de falta, onboarding, last_seen, push de mensalidade
-- Execute no SQL Editor DEPOIS de 008.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS monthly_due_push_on date;

ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2) DEFAULT 0;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS salon_owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_done boolean DEFAULT false;

UPDATE profiles SET onboarding_done = true
WHERE onboarding_done IS NOT TRUE
  AND (
    COALESCE(trim(business_name), '') <> ''
    OR salon_owner_id IS NOT NULL
    OR COALESCE(is_admin, false)
  );

DROP TABLE IF EXISTS waitlist;
CREATE TABLE waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  service_id bigint REFERENCES services(id) ON DELETE SET NULL,
  preferred_date date,
  note text,
  status text NOT NULL DEFAULT 'ABERTA',
  notified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waitlist_user_status_idx ON waitlist (user_id, status);

CREATE TABLE IF NOT EXISTS staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  email text,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT salon_owner_id FROM profiles WHERE id = auth.uid()),
    auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.workspace_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.force_workspace_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL OR NEW.user_id = auth.uid() THEN
    NEW.user_id := public.workspace_id();
  END IF;
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
    'loyalty_settings', 'financial_goals', 'waitlist'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_workspace_user ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_workspace_user BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE public.force_workspace_user_id()',
      t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS appointments_own ON appointments;
CREATE POLICY appointments_own ON appointments
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS clients_own ON clients;
CREATE POLICY clients_own ON clients
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS services_own ON services;
CREATE POLICY services_own ON services
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS business_hours_own ON business_hours;
CREATE POLICY business_hours_own ON business_hours
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS blocked_slots_own ON blocked_slots;
CREATE POLICY blocked_slots_own ON blocked_slots
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS coupons_own ON coupons;
CREATE POLICY coupons_own ON coupons
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS transactions_own ON transactions;
CREATE POLICY transactions_own ON transactions
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS "inventory_items_own" ON inventory_items;
CREATE POLICY inventory_items_own ON inventory_items
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS "locations_own" ON locations;
CREATE POLICY locations_own ON locations
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS "staff_members_own" ON staff_members;
CREATE POLICY staff_members_own ON staff_members
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS "loyalty_settings_own" ON loyalty_settings;
CREATE POLICY loyalty_settings_own ON loyalty_settings
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS "financial_goals_own" ON financial_goals;
CREATE POLICY financial_goals_own ON financial_goals
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS waitlist_own ON waitlist;
CREATE POLICY waitlist_own ON waitlist
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

ALTER TABLE staff_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_invites_owner ON staff_invites;
CREATE POLICY staff_invites_owner ON staff_invites
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.my_salon_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.salon_owner_id FROM public.profiles p WHERE p.id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.my_salon_owner_id() TO authenticated;

DROP POLICY IF EXISTS profiles_select_own_or_admin ON profiles;
CREATE POLICY profiles_select_own_or_admin ON profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.current_user_is_admin()
    OR id = public.my_salon_owner_id()
    OR salon_owner_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.entrar_lista_espera(
  p_user_id uuid,
  p_name text,
  p_phone text,
  p_service_id bigint DEFAULT NULL,
  p_preferred_date date DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR length(trim(p_name)) < 2 OR length(regexp_replace(p_phone, '\D', '', 'g')) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Preencha nome e WhatsApp');
  END IF;

  INSERT INTO waitlist (user_id, name, phone, service_id, preferred_date, note, status)
  VALUES (p_user_id, trim(p_name), regexp_replace(p_phone, '\D', '', 'g'), p_service_id, p_preferred_date, NULLIF(trim(p_note), ''), 'ABERTA');

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.criar_convite_staff(p_staff_id uuid, p_email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_exp timestamptz;
  v_staff staff_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Faça login');
  END IF;
  IF (SELECT salon_owner_id FROM profiles WHERE id = auth.uid()) IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Só a dona da conta convida a equipe');
  END IF;

  SELECT * INTO v_staff FROM staff_members WHERE id = p_staff_id AND user_id = auth.uid();
  IF v_staff.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Profissional não encontrada');
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_exp := now() + interval '14 days';

  INSERT INTO staff_invites (token, owner_id, staff_id, email, expires_at)
  VALUES (v_token, auth.uid(), p_staff_id, NULLIF(trim(p_email), ''), v_exp);

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_exp);
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_convite_staff(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v staff_invites%ROWTYPE;
  v_name text;
BEGIN
  SELECT * INTO v FROM staff_invites WHERE token = trim(p_token);
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Convite de equipe inválido');
  END IF;
  IF v.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Este convite já foi usado');
  END IF;
  IF v.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Este convite expirou');
  END IF;
  SELECT name INTO v_name FROM staff_members WHERE id = v.staff_id;
  RETURN jsonb_build_object('ok', true, 'kind', 'staff', 'email', v.email, 'staff_name', v_name);
END;
$$;

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

  UPDATE staff_invites SET used_at = now(), used_by = v_uid WHERE id = v.id;
  UPDATE staff_members SET auth_user_id = v_uid WHERE id = v.staff_id AND user_id = v.owner_id;

  INSERT INTO profiles (id, salon_owner_id, onboarding_done, is_blocked, subscription_status)
  VALUES (v_uid, v.owner_id, true, false, 'active')
  ON CONFLICT (id) DO UPDATE
    SET salon_owner_id = EXCLUDED.salon_owner_id,
        onboarding_done = true,
        is_blocked = false;

  RETURN jsonb_build_object('ok', true, 'kind', 'staff');
END;
$$;

GRANT EXECUTE ON FUNCTION public.entrar_lista_espera(uuid, text, text, bigint, date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_convite_staff(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validar_convite_staff(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_convite_staff(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
