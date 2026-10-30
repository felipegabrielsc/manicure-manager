-- Mensalidade sem cliente deixa de ficar em aberto.
-- Cole no SQL Editor DEPOIS da 042.

CREATE OR REPLACE FUNCTION public.encerrar_mensalidades_da_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE financial_charges c
  SET status = 'CANCELADO',
      cancelled_at = now(),
      updated_at = now()
  WHERE c.client_id = OLD.id
    AND c.kind = 'MENSALIDADE'
    AND c.status IN ('PENDENTE', 'PARCIAL', 'PAGO')
    AND c.cancelled_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM financial_payments p
      WHERE p.charge_id = c.id
      GROUP BY p.charge_id
      HAVING COALESCE(SUM(CASE WHEN p.entry_type = 'ESTORNO' THEN -p.amount ELSE p.amount END), 0) > 0
    );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_encerrar_mensalidades_da_cliente ON clients;
CREATE TRIGGER trg_encerrar_mensalidades_da_cliente
  BEFORE DELETE ON clients
  FOR EACH ROW EXECUTE PROCEDURE public.encerrar_mensalidades_da_cliente();

CREATE OR REPLACE FUNCTION public.encerrar_mensalidade_sem_visita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_visits integer;
  v_net numeric;
BEGIN
  SELECT kind INTO v_kind FROM financial_charges WHERE id = OLD.charge_id;
  IF v_kind IS DISTINCT FROM 'MENSALIDADE' THEN
    RETURN OLD;
  END IF;

  SELECT COUNT(*) INTO v_visits FROM financial_charge_items WHERE charge_id = OLD.charge_id;
  SELECT COALESCE(SUM(CASE WHEN entry_type = 'ESTORNO' THEN -amount ELSE amount END), 0)
    INTO v_net
  FROM financial_payments
  WHERE charge_id = OLD.charge_id;

  IF v_visits = 0 AND v_net <= 0 THEN
    UPDATE financial_charges
    SET status = 'CANCELADO',
        cancelled_at = COALESCE(cancelled_at, now()),
        visit_count = 0,
        updated_at = now()
    WHERE id = OLD.charge_id
      AND NOT cancelled_manually
      AND status IS DISTINCT FROM 'CANCELADO';
  ELSE
    UPDATE financial_charges
    SET visit_count = v_visits, updated_at = now()
    WHERE id = OLD.charge_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_encerrar_mensalidade_sem_visita ON financial_charge_items;
CREATE TRIGGER trg_encerrar_mensalidade_sem_visita
  AFTER DELETE ON financial_charge_items
  FOR EACH ROW EXECUTE PROCEDURE public.encerrar_mensalidade_sem_visita();

UPDATE financial_charges c
SET status = 'CANCELADO',
    cancelled_at = now(),
    updated_at = now()
WHERE c.kind = 'MENSALIDADE'
  AND c.client_id IS NULL
  AND c.status IN ('PENDENTE', 'PARCIAL', 'PAGO')
  AND c.cancelled_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM financial_payments p
    WHERE p.charge_id = c.id
    GROUP BY p.charge_id
    HAVING COALESCE(SUM(CASE WHEN p.entry_type = 'ESTORNO' THEN -p.amount ELSE p.amount END), 0) > 0
  );
