-- Auditoria: fecha leitura pública de bloqueios, isola financeiro da profissional,
-- cupom atômico e pedido LGPD de exclusão.
-- Cole no SQL Editor DEPOIS da 042.
-- As duas migrations 029 (mp_billing_idempotency e workspace_followup_portfolio)
-- precisam constar em schema_migrations — esta migration não as recria.

-- 1) Policy pública de bloqueio (001) — SELECT era USING (true) e somava com OR.
DROP POLICY IF EXISTS "blocked_slots_public_read" ON blocked_slots;
DROP POLICY IF EXISTS blocked_slots_public_read ON blocked_slots;

-- 2) Identidade da profissional no JWT
CREATE OR REPLACE FUNCTION public.current_staff_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sm.id
  FROM public.staff_members sm
  WHERE sm.auth_user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_staff_member_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_staff_member_id() TO authenticated;

-- 3) RLS financeiro alinhado a filtrarVisaoFinanceira (dona vê tudo; staff só o próprio)
DROP POLICY IF EXISTS financial_charges_own ON financial_charges;
CREATE POLICY financial_charges_owner ON financial_charges
  FOR ALL
  USING (user_id = public.workspace_id() AND public.my_salon_owner_id() IS NULL)
  WITH CHECK (user_id = public.workspace_id() AND public.my_salon_owner_id() IS NULL);

CREATE POLICY financial_charges_staff_select ON financial_charges
  FOR SELECT
  USING (
    user_id = public.workspace_id()
    AND public.my_salon_owner_id() IS NOT NULL
    AND staff_id IS NOT NULL
    AND staff_id = public.current_staff_member_id()
  );

DROP POLICY IF EXISTS financial_payments_own ON financial_payments;
CREATE POLICY financial_payments_owner ON financial_payments
  FOR ALL
  USING (user_id = public.workspace_id() AND public.my_salon_owner_id() IS NULL)
  WITH CHECK (user_id = public.workspace_id() AND public.my_salon_owner_id() IS NULL);

CREATE POLICY financial_payments_staff_select ON financial_payments
  FOR SELECT
  USING (
    user_id = public.workspace_id()
    AND public.my_salon_owner_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.financial_charges c
      WHERE c.id = charge_id
        AND c.user_id = public.workspace_id()
        AND c.staff_id IS NOT NULL
        AND c.staff_id = public.current_staff_member_id()
    )
  );

DROP POLICY IF EXISTS commission_entries_own ON commission_entries;
CREATE POLICY commission_entries_owner ON commission_entries
  FOR ALL
  USING (user_id = public.workspace_id() AND public.my_salon_owner_id() IS NULL)
  WITH CHECK (user_id = public.workspace_id() AND public.my_salon_owner_id() IS NULL);

CREATE POLICY commission_entries_staff_select ON commission_entries
  FOR SELECT
  USING (
    user_id = public.workspace_id()
    AND public.my_salon_owner_id() IS NOT NULL
    AND staff_id IS NOT NULL
    AND staff_id = public.current_staff_member_id()
  );

DROP POLICY IF EXISTS financial_charge_items_own ON financial_charge_items;
CREATE POLICY financial_charge_items_owner ON financial_charge_items
  FOR ALL
  USING (
    public.my_salon_owner_id() IS NULL
    AND EXISTS (
      SELECT 1 FROM public.financial_charges c
      WHERE c.id = charge_id AND c.user_id = public.workspace_id()
    )
  )
  WITH CHECK (
    public.my_salon_owner_id() IS NULL
    AND EXISTS (
      SELECT 1 FROM public.financial_charges c
      WHERE c.id = charge_id AND c.user_id = public.workspace_id()
    )
  );

CREATE POLICY financial_charge_items_staff_select ON financial_charge_items
  FOR SELECT
  USING (
    public.my_salon_owner_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.financial_charges c
      WHERE c.id = charge_id
        AND c.user_id = public.workspace_id()
        AND c.staff_id IS NOT NULL
        AND c.staff_id = public.current_staff_member_id()
    )
  );

DROP POLICY IF EXISTS financial_audit_log_read ON financial_audit_log;
CREATE POLICY financial_audit_log_owner ON financial_audit_log
  FOR SELECT
  USING (user_id = public.workspace_id() AND public.my_salon_owner_id() IS NULL);

DROP POLICY IF EXISTS transactions_own ON transactions;
CREATE POLICY transactions_owner ON transactions
  FOR ALL
  USING (user_id = public.workspace_id() AND public.my_salon_owner_id() IS NULL)
  WITH CHECK (user_id = public.workspace_id() AND public.my_salon_owner_id() IS NULL);

CREATE POLICY transactions_staff_select ON transactions
  FOR SELECT
  USING (
    user_id = public.workspace_id()
    AND public.my_salon_owner_id() IS NOT NULL
    AND type IS DISTINCT FROM 'DESPESA'
  );

-- 4) Cupom atômico para o painel (mesmo critério da agenda pública)
CREATE OR REPLACE FUNCTION public.consumir_cupom(p_coupon_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Não autenticado');
  END IF;

  IF p_coupon_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cupom inválido.');
  END IF;

  UPDATE public.coupons
  SET uses_count = COALESCE(uses_count, 0) + 1
  WHERE id = p_coupon_id
    AND user_id = public.workspace_id()
    AND COALESCE(active, true) = true
    AND (max_uses IS NULL OR COALESCE(uses_count, 0) < max_uses);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cupom esgotado ou inválido.');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_cupom(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consumir_cupom(uuid) TO authenticated;

-- 5) Pedido LGPD de exclusão da conta (sem purge automático)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
