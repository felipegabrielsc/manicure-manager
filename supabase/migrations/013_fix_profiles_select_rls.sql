-- O SELECT em profiles dava 500 (recursão de RLS).
-- A policy 009 lia profiles de novo: (SELECT salon_owner_id FROM profiles ...).
-- Cole este arquivo inteiro no SQL Editor e rode. Depois atualize o site.

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.my_salon_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.salon_owner_id FROM public.profiles p WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_salon_owner_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_salon_owner_id() TO authenticated;

DROP POLICY IF EXISTS profiles_select_own_or_admin ON profiles;
CREATE POLICY profiles_select_own_or_admin ON profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.current_user_is_admin()
    OR id = public.my_salon_owner_id()
    OR salon_owner_id = auth.uid()
  );
