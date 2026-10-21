-- Etapa financeira: separa atendimento, cobrança e recebimento.
-- Rode no SQL Editor DEPOIS da 039.
--
-- Antes de aplicar em produção, gere um backup no painel do Supabase
-- (Database → Backups) e teste a restauração em outro projeto.
-- Esta migration não apaga appointments nem transactions.
--
-- Mapa do que existe hoje:
--   appointments.status = CONCLUIDO + agreed_price era tratado como receita,
--   mesmo sem um recebimento gravado. payment_method PIX/DINHEIRO/CARTAO
--   significa que o salão marcou o valor como recebido na conclusão.
--   MENSALIDADE e PACOTE não são caixa da visita.
--   transactions RECEITA/DESPESA é o caixa manual (mensalidade, produto, despesa).
--   staff_members.commission_percent é o percentual vivo — comissões antigas
--   não tinham foto. O backfill grava o percentual vigente nesta data;
--   mudanças futuras não recalculam a linha.
--
-- Regra da comissão: nasce na conclusão do atendimento, com o percentual
-- do profissional naquele instante. Fica PENDENTE até o salão pagar.
-- Estorno da conclusão cancela a comissão sem alterar a base nem o valor.

-- 1. Cobranças
DO $$
DECLARE
  client_type text;
BEGIN
  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO client_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'clients'
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  IF client_type IS NULL THEN
    RAISE EXCEPTION 'Tabela clients não encontrada';
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS financial_charges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('ATENDIMENTO', 'MENSALIDADE', 'VENDA', 'MANUAL')),
      appointment_id bigint UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
      client_id %s REFERENCES clients(id) ON DELETE SET NULL,
      staff_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
      service_name text,
      description text,
      competence_date date NOT NULL,
      due_date date,
      original_amount numeric(12,2) NOT NULL CHECK (original_amount >= 0),
      discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
      recognizes_revenue boolean NOT NULL DEFAULT true,
      status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'PARCIAL', 'PAGO', 'ESTORNADO', 'CANCELADO')),
      source_key text NOT NULL,
      visit_count integer NOT NULL DEFAULT 0,
      cancelled_at timestamptz,
      cancelled_manually boolean NOT NULL DEFAULT false,
      cancel_reason text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, source_key)
    )
  $sql$, client_type);
END $$;

CREATE INDEX IF NOT EXISTS financial_charges_user_competence_idx
  ON financial_charges (user_id, competence_date);

CREATE INDEX IF NOT EXISTS financial_charges_user_due_idx
  ON financial_charges (user_id, due_date);

CREATE TABLE IF NOT EXISTS financial_charge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL REFERENCES financial_charges(id) ON DELETE CASCADE,
  appointment_id bigint UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Recebimentos. Estorno é outra linha, para o mês do caixa não reescrever o mês original.
CREATE TABLE IF NOT EXISTS financial_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  charge_id uuid REFERENCES financial_charges(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text,
  reference text,
  received_at timestamptz NOT NULL,
  received_by uuid,
  entry_type text NOT NULL DEFAULT 'RECEBIMENTO' CHECK (entry_type IN ('RECEBIMENTO', 'ESTORNO')),
  reversal_of uuid REFERENCES financial_payments(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (reversal_of)
);

CREATE INDEX IF NOT EXISTS financial_payments_charge_idx ON financial_payments (charge_id);
CREATE INDEX IF NOT EXISTS financial_payments_received_idx ON financial_payments (user_id, received_at);

-- 3. Comissão histórica. Base, percentual e valor não mudam depois de gravados.
CREATE TABLE IF NOT EXISTS commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id bigint NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  staff_name text,
  percent_applied numeric(8,2) NOT NULL,
  base_amount numeric(12,2) NOT NULL,
  amount_due numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'PAGO', 'CANCELADO')),
  recognized_at date NOT NULL,
  paid_at date,
  paid_ledger_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commission_entries_user_idx ON commission_entries (user_id, recognized_at);

-- 4. Auditoria: quem alterou e quando.
CREATE TABLE IF NOT EXISTS financial_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  actor_id uuid,
  entity text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS financial_audit_log_user_idx ON financial_audit_log (user_id, created_at DESC);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS charge_id uuid REFERENCES financial_charges(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES financial_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS appointment_id bigint,
  ADD COLUMN IF NOT EXISTS commission_entry_id uuid REFERENCES commission_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS competence_date date;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_idempotency_uidx
  ON transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 5. RLS e workspace
ALTER TABLE financial_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_charge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_charges_own ON financial_charges;
CREATE POLICY financial_charges_own ON financial_charges
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS financial_payments_own ON financial_payments;
CREATE POLICY financial_payments_own ON financial_payments
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS commission_entries_own ON commission_entries;
CREATE POLICY commission_entries_own ON commission_entries
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS financial_charge_items_own ON financial_charge_items;
CREATE POLICY financial_charge_items_own ON financial_charge_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM financial_charges c
      WHERE c.id = charge_id AND c.user_id = public.workspace_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM financial_charges c
      WHERE c.id = charge_id AND c.user_id = public.workspace_id()
    )
  );

DROP POLICY IF EXISTS financial_audit_log_read ON financial_audit_log;
CREATE POLICY financial_audit_log_read ON financial_audit_log
  FOR SELECT USING (user_id = public.workspace_id());

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['financial_charges', 'financial_payments', 'commission_entries']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_workspace_user ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_workspace_user BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE public.force_workspace_user_id()',
      t
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON financial_charges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_charge_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON commission_entries TO authenticated;
GRANT SELECT ON financial_audit_log TO authenticated;

-- 6. Auditoria e trava da comissão
CREATE OR REPLACE FUNCTION public.audit_financial_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO financial_audit_log (user_id, actor_id, entity, entity_id, action, before_data, after_data)
    VALUES (OLD.user_id, auth.uid(), TG_TABLE_NAME, OLD.id::text, TG_OP, to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO financial_audit_log (user_id, actor_id, entity, entity_id, action, before_data, after_data)
    VALUES (NEW.user_id, auth.uid(), TG_TABLE_NAME, NEW.id::text, TG_OP, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;

  INSERT INTO financial_audit_log (user_id, actor_id, entity, entity_id, action, before_data, after_data)
  VALUES (NEW.user_id, auth.uid(), TG_TABLE_NAME, NEW.id::text, TG_OP, NULL, to_jsonb(NEW));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_charges ON financial_charges;
CREATE TRIGGER trg_audit_charges
  AFTER INSERT OR UPDATE OR DELETE ON financial_charges
  FOR EACH ROW EXECUTE PROCEDURE public.audit_financial_change();

DROP TRIGGER IF EXISTS trg_audit_payments ON financial_payments;
CREATE TRIGGER trg_audit_payments
  AFTER INSERT OR UPDATE OR DELETE ON financial_payments
  FOR EACH ROW EXECUTE PROCEDURE public.audit_financial_change();

DROP TRIGGER IF EXISTS trg_audit_commissions ON commission_entries;
CREATE TRIGGER trg_audit_commissions
  AFTER INSERT OR UPDATE OR DELETE ON commission_entries
  FOR EACH ROW EXECUTE PROCEDURE public.audit_financial_change();

CREATE OR REPLACE FUNCTION public.protect_commission_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.percent_applied IS DISTINCT FROM OLD.percent_applied
     OR NEW.base_amount IS DISTINCT FROM OLD.base_amount
     OR NEW.amount_due IS DISTINCT FROM OLD.amount_due
     OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
     OR NEW.staff_id IS DISTINCT FROM OLD.staff_id
     OR NEW.recognized_at IS DISTINCT FROM OLD.recognized_at
  THEN
    RAISE EXCEPTION 'Comissão histórica não pode ser recalculada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_commission ON commission_entries;
CREATE TRIGGER trg_protect_commission
  BEFORE UPDATE ON commission_entries
  FOR EACH ROW EXECUTE PROCEDURE public.protect_commission_snapshot();

CREATE OR REPLACE FUNCTION public.bloquear_delete_transaction_vinculada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.payment_id IS NOT NULL OR OLD.commission_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Estorne o recebimento ou a comissão. Este lançamento está vinculado.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_linked_transaction_delete ON transactions;
CREATE TRIGGER trg_block_linked_transaction_delete
  BEFORE DELETE ON transactions
  FOR EACH ROW EXECUTE PROCEDURE public.bloquear_delete_transaction_vinculada();

-- 7. Status da cobrança a partir dos pagamentos
CREATE OR REPLACE FUNCTION public.recalcular_status_cobranca(p_charge_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge financial_charges%ROWTYPE;
  v_received numeric(12,2);
  v_reversed numeric(12,2);
  v_net numeric(12,2);
  v_liquido numeric(12,2);
  v_status text;
BEGIN
  SELECT * INTO v_charge FROM financial_charges WHERE id = p_charge_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_charge.cancelled_at IS NOT NULL OR v_charge.cancelled_manually THEN
    UPDATE financial_charges SET status = 'CANCELADO', updated_at = now() WHERE id = p_charge_id;
    RETURN 'CANCELADO';
  END IF;

  IF NOT v_charge.recognizes_revenue THEN
    UPDATE financial_charges SET status = 'PAGO', updated_at = now() WHERE id = p_charge_id;
    RETURN 'PAGO';
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE entry_type = 'RECEBIMENTO'), 0),
    COALESCE(SUM(amount) FILTER (WHERE entry_type = 'ESTORNO'), 0)
  INTO v_received, v_reversed
  FROM financial_payments
  WHERE charge_id = p_charge_id;

  v_net := round(v_received - v_reversed, 2);
  v_liquido := round(GREATEST(v_charge.original_amount - v_charge.discount_amount, 0), 2);

  IF v_reversed > 0 AND v_net <= 0 AND v_received > 0 THEN
    v_status := 'ESTORNADO';
  ELSIF v_net <= 0 THEN
    v_status := 'PENDENTE';
  ELSIF v_net + 0.001 < v_liquido THEN
    v_status := 'PARCIAL';
  ELSE
    v_status := 'PAGO';
  END IF;

  UPDATE financial_charges SET status = v_status, updated_at = now() WHERE id = p_charge_id;
  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public._inserir_pagamento(
  p_user_id uuid,
  p_charge_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_received_on date,
  p_idempotency_key text,
  p_actor uuid,
  p_entry_type text DEFAULT 'RECEBIMENTO',
  p_reversal_of uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_at timestamptz;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 4 THEN
    RAISE EXCEPTION 'Informe uma chave de idempotência';
  END IF;

  SELECT id INTO v_id
  FROM financial_payments
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  v_at := (p_received_on::text || ' 12:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';

  INSERT INTO financial_payments (
    user_id, charge_id, amount, method, reference, received_at, received_by,
    entry_type, reversal_of, idempotency_key
  ) VALUES (
    p_user_id, p_charge_id, round(p_amount, 2), NULLIF(trim(p_method), ''),
    NULLIF(trim(p_reference), ''), v_at, p_actor, p_entry_type, p_reversal_of, p_idempotency_key
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO v_id
  FROM financial_payments
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_recebimento(
  p_charge_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_received_on date,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_charge financial_charges%ROWTYPE;
  v_existing financial_payments%ROWTYPE;
  v_amount numeric(12,2);
  v_received numeric(12,2);
  v_reversed numeric(12,2);
  v_net numeric(12,2);
  v_liquido numeric(12,2);
  v_payment uuid;
  v_category text;
  v_tx text;
BEGIN
  v_user := public.workspace_id();
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Sessão expirada');
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Informe uma chave de idempotência');
  END IF;

  SELECT * INTO v_existing
  FROM financial_payments
  WHERE user_id = v_user AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicated', true, 'payment_id', v_existing.id, 'charge_id', v_existing.charge_id);
  END IF;

  SELECT * INTO v_charge FROM financial_charges WHERE id = p_charge_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Cobrança não encontrada');
  END IF;
  IF v_charge.status = 'CANCELADO' OR v_charge.cancelled_manually THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Cobrança cancelada');
  END IF;

  v_amount := round(COALESCE(p_amount, 0), 2);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Valor inválido');
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE entry_type = 'RECEBIMENTO'), 0),
    COALESCE(SUM(amount) FILTER (WHERE entry_type = 'ESTORNO'), 0)
  INTO v_received, v_reversed
  FROM financial_payments
  WHERE charge_id = v_charge.id;

  v_net := round(v_received - v_reversed, 2);
  v_liquido := round(GREATEST(v_charge.original_amount - v_charge.discount_amount, 0), 2);
  IF round(v_net + v_amount, 2) > v_liquido THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Valor maior que o saldo da cobrança');
  END IF;

  v_payment := public._inserir_pagamento(
    v_user, v_charge.id, v_amount, p_method, p_reference, p_received_on, p_idempotency_key, auth.uid()
  );

  v_category := CASE v_charge.kind
    WHEN 'MENSALIDADE' THEN 'mensalidade'
    WHEN 'VENDA' THEN 'produto'
    WHEN 'ATENDIMENTO' THEN 'servico'
    ELSE 'receita'
  END;

  INSERT INTO transactions (
    description, amount, type, date, client_id, user_id, category, payment_method,
    charge_id, payment_id, appointment_id, idempotency_key, competence_date
  ) VALUES (
    COALESCE(v_charge.description, 'Recebimento'),
    v_amount,
    'RECEITA',
    (p_received_on::text || ' 12:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo',
    v_charge.client_id,
    v_user,
    v_category,
    NULLIF(trim(p_method), ''),
    v_charge.id,
    v_payment,
    v_charge.appointment_id,
    p_idempotency_key,
    v_charge.competence_date
  )
  ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id::text INTO v_tx;

  PERFORM public.recalcular_status_cobranca(v_charge.id);
  RETURN jsonb_build_object('ok', true, 'duplicated', false, 'payment_id', v_payment, 'charge_id', v_charge.id);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing
  FROM financial_payments
  WHERE user_id = v_user AND idempotency_key = p_idempotency_key;
  RETURN jsonb_build_object('ok', true, 'duplicated', true, 'payment_id', v_existing.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.estornar_recebimento(
  p_payment_id uuid,
  p_received_on date,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_original financial_payments%ROWTYPE;
  v_existing financial_payments%ROWTYPE;
  v_estorno uuid;
BEGIN
  v_user := public.workspace_id();
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Informe uma chave de idempotência');
  END IF;

  SELECT * INTO v_existing
  FROM financial_payments
  WHERE user_id = v_user AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicated', true, 'payment_id', v_existing.id);
  END IF;

  SELECT * INTO v_original
  FROM financial_payments
  WHERE id = p_payment_id AND user_id = v_user
  FOR UPDATE;
  IF NOT FOUND OR v_original.entry_type <> 'RECEBIMENTO' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Recebimento não encontrado');
  END IF;

  SELECT * INTO v_existing FROM financial_payments WHERE reversal_of = v_original.id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicated', true, 'payment_id', v_existing.id);
  END IF;

  v_estorno := public._inserir_pagamento(
    v_user, v_original.charge_id, v_original.amount, v_original.method, 'Estorno',
    p_received_on, p_idempotency_key, auth.uid(), 'ESTORNO', v_original.id
  );

  INSERT INTO transactions (
    description, amount, type, date, client_id, user_id, category, payment_method,
    charge_id, payment_id, idempotency_key
  )
  SELECT
    'Estorno · ' || COALESCE(c.description, 'Recebimento'),
    v_original.amount,
    'DESPESA',
    (p_received_on::text || ' 12:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo',
    c.client_id,
    v_user,
    'estorno',
    v_original.method,
    v_original.charge_id,
    v_estorno,
    p_idempotency_key
  FROM financial_charges c
  WHERE c.id = v_original.charge_id
  ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  PERFORM public.recalcular_status_cobranca(v_original.charge_id);
  RETURN jsonb_build_object('ok', true, 'duplicated', false, 'payment_id', v_estorno);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_cobranca(
  p_charge_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_net numeric(12,2);
BEGIN
  v_user := public.workspace_id();
  SELECT round(COALESCE(SUM(CASE WHEN entry_type = 'ESTORNO' THEN -amount ELSE amount END), 0), 2)
    INTO v_net
  FROM financial_payments
  WHERE charge_id = p_charge_id AND user_id = v_user;

  IF COALESCE(v_net, 0) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Estorne os recebimentos antes de cancelar');
  END IF;

  UPDATE financial_charges
  SET cancelled_at = now(),
      cancelled_manually = true,
      cancel_reason = NULLIF(trim(p_reason), ''),
      status = 'CANCELADO',
      updated_at = now()
  WHERE id = p_charge_id AND user_id = v_user;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Cobrança não encontrada');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.quitar_comissao(
  p_commission_id uuid,
  p_paid_on date,
  p_method text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_row commission_entries%ROWTYPE;
  v_tx text;
BEGIN
  v_user := public.workspace_id();
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Informe uma chave de idempotência');
  END IF;

  SELECT * INTO v_row FROM commission_entries WHERE id = p_commission_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Comissão não encontrada');
  END IF;
  IF v_row.status = 'CANCELADO' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Comissão cancelada');
  END IF;
  IF v_row.status = 'PAGO' THEN
    RETURN jsonb_build_object('ok', true, 'duplicated', true, 'commission_id', v_row.id);
  END IF;

  INSERT INTO transactions (
    description, amount, type, date, user_id, category, payment_method,
    commission_entry_id, idempotency_key
  ) VALUES (
    'Comissão · ' || COALESCE(v_row.staff_name, 'Profissional'),
    v_row.amount_due,
    'DESPESA',
    (p_paid_on::text || ' 12:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo',
    v_user,
    'comissao',
    NULLIF(trim(p_method), ''),
    v_row.id,
    p_idempotency_key
  )
  ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id::text INTO v_tx;

  IF v_tx IS NULL THEN
    SELECT id::text INTO v_tx FROM transactions
    WHERE user_id = v_user AND idempotency_key = p_idempotency_key;
  END IF;

  UPDATE commission_entries
  SET status = 'PAGO', paid_at = p_paid_on, paid_ledger_id = v_tx, updated_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'duplicated', false, 'commission_id', v_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_desconto_cobranca(
  p_charge_id uuid,
  p_discount numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_charge financial_charges%ROWTYPE;
  v_discount numeric(12,2);
  v_net numeric(12,2);
BEGIN
  v_user := public.workspace_id();
  SELECT * INTO v_charge FROM financial_charges WHERE id = p_charge_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Cobrança não encontrada');
  END IF;
  v_discount := round(GREATEST(COALESCE(p_discount, 0), 0), 2);
  IF v_discount > v_charge.original_amount THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Desconto maior que a cobrança');
  END IF;
  SELECT round(COALESCE(SUM(CASE WHEN entry_type = 'ESTORNO' THEN -amount ELSE amount END), 0), 2)
    INTO v_net
  FROM financial_payments WHERE charge_id = v_charge.id;
  IF v_net > round(v_charge.original_amount - v_discount, 2) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Desconto deixaria o saldo negativo');
  END IF;
  UPDATE financial_charges
  SET discount_amount = v_discount, updated_at = now()
  WHERE id = v_charge.id;
  PERFORM public.recalcular_status_cobranca(v_charge.id);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 8. Conclusão do atendimento gera cobrança, recebimento e comissão uma única vez.
CREATE OR REPLACE FUNCTION public._aplicar_conclusao(p_appointment_id bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt appointments%ROWTYPE;
  v_client clients%ROWTYPE;
  v_staff_name text;
  v_percent numeric(8,2);
  v_service text;
  v_price numeric(12,2);
  v_deposit numeric(12,2);
  v_rest numeric(12,2);
  v_when date;
  v_method text;
  v_charge_id uuid;
  v_existing financial_charges%ROWTYPE;
  v_key text;
  v_revenue boolean;
  v_competence date;
  v_due date;
  v_offset integer;
  v_due_month date;
  v_last date;
  v_day integer;
  v_fee numeric(12,2);
  v_visits integer;
BEGIN
  SELECT * INTO v_apt FROM appointments WHERE id = p_appointment_id;
  IF NOT FOUND OR v_apt.status <> 'CONCLUIDO' THEN
    RETURN NULL;
  END IF;

  v_method := COALESCE(NULLIF(trim(v_apt.payment_method), ''), 'PENDENTE');
  v_when := (v_apt.start_time AT TIME ZONE 'America/Sao_Paulo')::date;
  v_price := round(COALESCE(v_apt.agreed_price, 0), 2);
  SELECT name INTO v_service FROM services WHERE id::text = v_apt.service_id::text;
  SELECT * INTO v_client FROM clients WHERE id = v_apt.client_id;
  SELECT name, COALESCE(commission_percent, 0)
    INTO v_staff_name, v_percent
  FROM staff_members WHERE id = v_apt.staff_id;

  IF v_method = 'MENSALIDADE' AND v_apt.client_id IS NOT NULL THEN
    v_competence := date_trunc('month', v_apt.start_time AT TIME ZONE 'America/Sao_Paulo')::date;
    v_key := 'mensalidade:' || v_apt.client_id::text || ':' || to_char(v_competence, 'YYYY-MM');
    v_offset := COALESCE(v_client.monthly_due_offset, 1);
    v_due_month := (v_competence + make_interval(months => v_offset))::date;
    v_last := (date_trunc('month', v_due_month) + interval '1 month - 1 day')::date;
    v_day := LEAST(GREATEST(COALESCE(v_client.monthly_due_day, 10), 1), EXTRACT(day FROM v_last)::int);
    v_due := make_date(EXTRACT(year FROM v_due_month)::int, EXTRACT(month FROM v_due_month)::int, v_day);

    SELECT * INTO v_existing FROM financial_charges
    WHERE user_id = v_apt.user_id AND source_key = v_key;
    IF v_existing.cancelled_manually THEN
      RETURN v_existing.id;
    END IF;

    INSERT INTO financial_charges (
      user_id, kind, client_id, description, competence_date, due_date,
      original_amount, source_key, status, recognizes_revenue
    ) VALUES (
      v_apt.user_id, 'MENSALIDADE', v_apt.client_id,
      'Mensalidade — ' || to_char(v_competence, 'MM/YYYY'),
      v_competence, v_due, 0, v_key, 'PENDENTE', true
    )
    ON CONFLICT (user_id, source_key) DO UPDATE
      SET due_date = EXCLUDED.due_date, updated_at = now()
    RETURNING id INTO v_charge_id;

    INSERT INTO financial_charge_items (charge_id, appointment_id, amount, description)
    VALUES (v_charge_id, v_apt.id, v_price, COALESCE(v_service, 'Visita'))
    ON CONFLICT (appointment_id) DO NOTHING;

    SELECT COUNT(*), COALESCE(SUM(amount), 0)
      INTO v_visits, v_fee
    FROM financial_charge_items WHERE charge_id = v_charge_id;

    IF COALESCE(v_client.monthly_fee, 0) > 0 THEN
      v_fee := round(v_client.monthly_fee, 2);
    ELSE
      v_fee := round(v_fee, 2);
    END IF;

    UPDATE financial_charges
    SET original_amount = v_fee,
        visit_count = v_visits,
        cancelled_at = NULL,
        status = CASE WHEN status = 'CANCELADO' THEN 'PENDENTE' ELSE status END,
        updated_at = now()
    WHERE id = v_charge_id AND NOT cancelled_manually;

    PERFORM public.recalcular_status_cobranca(v_charge_id);
    RETURN v_charge_id;
  END IF;

  v_key := 'atendimento:' || v_apt.id::text;
  v_revenue := v_method <> 'PACOTE';
  v_deposit := 0;
  IF v_apt.deposit_status IN ('paid', 'applied') THEN
    v_deposit := round(LEAST(COALESCE(v_apt.deposit_amount, 0), v_price), 2);
  END IF;

  SELECT * INTO v_existing FROM financial_charges
  WHERE user_id = v_apt.user_id AND source_key = v_key;
  IF v_existing.cancelled_manually THEN
    RETURN v_existing.id;
  END IF;

  INSERT INTO financial_charges (
    user_id, kind, appointment_id, client_id, staff_id, service_name, description,
    competence_date, due_date, original_amount, recognizes_revenue, source_key, status
  ) VALUES (
    v_apt.user_id, 'ATENDIMENTO', v_apt.id, v_apt.client_id, v_apt.staff_id, v_service,
    COALESCE(v_client.name, 'Cliente') || ' — ' || COALESCE(v_service, 'Serviço'),
    v_when, v_when, v_price, v_revenue, v_key, 'PENDENTE'
  )
  ON CONFLICT (user_id, source_key) DO UPDATE SET
    original_amount = EXCLUDED.original_amount,
    recognizes_revenue = EXCLUDED.recognizes_revenue,
    staff_id = EXCLUDED.staff_id,
    service_name = EXCLUDED.service_name,
    description = EXCLUDED.description,
    competence_date = EXCLUDED.competence_date,
    due_date = EXCLUDED.due_date,
    cancelled_at = NULL,
    updated_at = now()
  RETURNING id INTO v_charge_id;

  IF v_deposit > 0 THEN
    PERFORM public._inserir_pagamento(
      v_apt.user_id, v_charge_id, v_deposit, 'PIX', 'Sinal', v_when,
      'deposito:' || v_apt.id::text, NULL
    );
  END IF;

  IF v_revenue AND v_method IN ('PIX', 'DINHEIRO', 'CARTAO', 'OUTRO') THEN
    IF NOT EXISTS (
      SELECT 1 FROM financial_payments
      WHERE charge_id = v_charge_id
        AND entry_type = 'RECEBIMENTO'
        AND idempotency_key IS DISTINCT FROM ('deposito:' || v_apt.id::text)
        AND reversal_of IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM financial_payments e WHERE e.reversal_of = financial_payments.id
        )
    ) THEN
      v_rest := round(v_price - v_deposit, 2);
      IF v_rest > 0 THEN
        PERFORM public._inserir_pagamento(
          v_apt.user_id, v_charge_id, v_rest, v_method, NULL, v_when,
          'quitacao:' || v_apt.id::text || ':' || (
            SELECT COUNT(*) + 1 FROM financial_payments
            WHERE charge_id = v_charge_id AND idempotency_key LIKE 'quitacao:' || v_apt.id::text || ':%'
          ),
          NULL
        );
      END IF;
    END IF;
  END IF;

  IF v_revenue AND v_apt.staff_id IS NOT NULL AND COALESCE(v_percent, 0) > 0 THEN
    INSERT INTO commission_entries (
      user_id, appointment_id, staff_id, staff_name, percent_applied,
      base_amount, amount_due, status, recognized_at
    ) VALUES (
      v_apt.user_id, v_apt.id, v_apt.staff_id, v_staff_name, round(v_percent, 2),
      v_price, round(v_price * (v_percent / 100), 2), 'PENDENTE', v_when
    )
    ON CONFLICT (appointment_id) DO UPDATE
      SET status = CASE
        WHEN commission_entries.status = 'CANCELADO' THEN 'PENDENTE'
        ELSE commission_entries.status
      END,
      updated_at = now();
  END IF;

  PERFORM public.recalcular_status_cobranca(v_charge_id);
  RETURN v_charge_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sincronizar_conclusao_atendimento(p_appointment_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_owner uuid;
  v_id uuid;
BEGIN
  v_user := public.workspace_id();
  SELECT user_id INTO v_owner FROM appointments WHERE id = p_appointment_id;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_user THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Atendimento não encontrado');
  END IF;
  v_id := public._aplicar_conclusao(p_appointment_id);
  RETURN jsonb_build_object('ok', true, 'charge_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reverter_conclusao_atendimento(p_appointment_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_owner uuid;
  v_charge financial_charges%ROWTYPE;
  v_pay financial_payments%ROWTYPE;
  v_item_charge uuid;
  v_today date;
  v_net numeric(12,2);
  v_visits integer;
BEGIN
  v_user := public.workspace_id();
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  SELECT user_id INTO v_owner FROM appointments WHERE id = p_appointment_id;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_user THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Atendimento não encontrado');
  END IF;

  SELECT charge_id INTO v_item_charge FROM financial_charge_items WHERE appointment_id = p_appointment_id;
  IF v_item_charge IS NOT NULL THEN
    DELETE FROM financial_charge_items WHERE appointment_id = p_appointment_id;
    SELECT COUNT(*) INTO v_visits FROM financial_charge_items WHERE charge_id = v_item_charge;
    UPDATE financial_charges
    SET visit_count = v_visits, updated_at = now()
    WHERE id = v_item_charge;
    SELECT round(COALESCE(SUM(CASE WHEN entry_type = 'ESTORNO' THEN -amount ELSE amount END), 0), 2)
      INTO v_net FROM financial_payments WHERE charge_id = v_item_charge;
    IF v_visits = 0 AND COALESCE(v_net, 0) <= 0 THEN
      UPDATE financial_charges
      SET cancelled_at = now(), status = 'CANCELADO', recognizes_revenue = false, updated_at = now()
      WHERE id = v_item_charge AND NOT cancelled_manually;
    ELSE
      PERFORM public.recalcular_status_cobranca(v_item_charge);
    END IF;
  END IF;

  SELECT * INTO v_charge FROM financial_charges
  WHERE user_id = v_user AND source_key = 'atendimento:' || p_appointment_id::text;
  IF FOUND AND NOT v_charge.cancelled_manually THEN
    FOR v_pay IN
      SELECT * FROM financial_payments
      WHERE charge_id = v_charge.id
        AND entry_type = 'RECEBIMENTO'
        AND idempotency_key LIKE 'quitacao:' || p_appointment_id::text || ':%'
    LOOP
      IF NOT EXISTS (SELECT 1 FROM financial_payments WHERE reversal_of = v_pay.id) THEN
        PERFORM public._inserir_pagamento(
          v_user, v_charge.id, v_pay.amount, v_pay.method, 'Reabertura',
          v_today, 'estorno:' || v_pay.id::text, auth.uid(), 'ESTORNO', v_pay.id
        );
      END IF;
    END LOOP;

    SELECT round(COALESCE(SUM(CASE WHEN entry_type = 'ESTORNO' THEN -amount ELSE amount END), 0), 2)
      INTO v_net FROM financial_payments WHERE charge_id = v_charge.id;

    IF COALESCE(v_net, 0) <= 0 THEN
      UPDATE financial_charges
      SET cancelled_at = now(), status = 'CANCELADO', recognizes_revenue = false, updated_at = now()
      WHERE id = v_charge.id;
    ELSE
      UPDATE financial_charges
      SET recognizes_revenue = false, cancelled_at = NULL, updated_at = now()
      WHERE id = v_charge.id;
      PERFORM public.recalcular_status_cobranca(v_charge.id);
    END IF;
  END IF;

  UPDATE commission_entries
  SET status = 'CANCELADO', updated_at = now()
  WHERE appointment_id = p_appointment_id AND user_id = v_user AND status <> 'PAGO';

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public._vincular_receitas(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx record;
  v_charge financial_charges%ROWTYPE;
  v_payment uuid;
  v_day date;
  v_kind text;
  v_key text;
BEGIN
  FOR v_tx IN
    SELECT * FROM transactions
    WHERE user_id = p_user_id
      AND type = 'RECEITA'
      AND charge_id IS NULL
      AND payment_id IS NULL
  LOOP
    IF COALESCE(v_tx.amount, 0) <= 0 THEN
      CONTINUE;
    END IF;
    v_day := (v_tx.date AT TIME ZONE 'America/Sao_Paulo')::date;
    v_charge := NULL;

    IF COALESCE(v_tx.category, '') = 'mensalidade'
       OR COALESCE(v_tx.description, '') ~* '^mensalidade' THEN
      SELECT * INTO v_charge
      FROM financial_charges
      WHERE user_id = p_user_id
        AND kind = 'MENSALIDADE'
        AND client_id = v_tx.client_id
        AND status IN ('PENDENTE', 'PARCIAL')
      ORDER BY due_date
      LIMIT 1;
      IF NOT FOUND THEN
        v_charge := NULL;
      END IF;
    END IF;

    IF v_charge IS NULL AND COALESCE(v_tx.category, '') <> 'mensalidade'
       AND COALESCE(v_tx.description, '') !~* '^mensalidade' THEN
      v_kind := CASE WHEN v_tx.category = 'produto' THEN 'VENDA' ELSE 'MANUAL' END;
      v_key := 'venda:' || v_tx.id::text;
      INSERT INTO financial_charges (
        user_id, kind, client_id, service_name, description, competence_date, due_date,
        original_amount, source_key, status
      ) VALUES (
        p_user_id, v_kind, v_tx.client_id,
        CASE WHEN v_kind = 'VENDA' THEN 'Produto' ELSE NULL END,
        v_tx.description, v_day, v_day, round(v_tx.amount, 2), v_key, 'PENDENTE'
      )
      ON CONFLICT (user_id, source_key) DO UPDATE SET updated_at = now()
      RETURNING * INTO v_charge;
    END IF;

    IF v_charge IS NULL THEN
      CONTINUE;
    END IF;

    v_payment := public._inserir_pagamento(
      p_user_id, v_charge.id, v_tx.amount, v_tx.payment_method, v_tx.description,
      v_day, 'legacy-tx:' || v_tx.id::text, NULL
    );

    UPDATE transactions
    SET charge_id = v_charge.id, payment_id = v_payment, competence_date = v_charge.competence_date
    WHERE id = v_tx.id;

    PERFORM public.recalcular_status_cobranca(v_charge.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.sincronizar_financeiro_existente()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  r record;
  v_count integer := 0;
BEGIN
  v_user := public.workspace_id();
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Sessão expirada');
  END IF;

  FOR r IN
    SELECT a.id
    FROM appointments a
    WHERE a.user_id = v_user
      AND a.status = 'CONCLUIDO'
      AND (
        a.start_time >= now() - interval '120 days'
        OR (
          a.payment_method IS DISTINCT FROM 'MENSALIDADE'
          AND NOT EXISTS (SELECT 1 FROM financial_charges c WHERE c.appointment_id = a.id)
        )
        OR (
          a.payment_method = 'MENSALIDADE'
          AND NOT EXISTS (SELECT 1 FROM financial_charge_items i WHERE i.appointment_id = a.id)
        )
      )
  LOOP
    PERFORM public._aplicar_conclusao(r.id);
    v_count := v_count + 1;
  END LOOP;

  PERFORM public._vincular_receitas(v_user);
  RETURN jsonb_build_object('ok', true, 'appointments', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public._inserir_pagamento(uuid, uuid, numeric, text, text, date, text, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._aplicar_conclusao(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._vincular_receitas(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalcular_status_cobranca(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.registrar_recebimento(uuid, numeric, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_recebimento(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_cobranca(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quitar_comissao(uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_desconto_cobranca(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_conclusao_atendimento(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverter_conclusao_atendimento(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_financeiro_existente() TO authenticated;

-- Backfill. Roda como dono do banco, sem JWT, e pode ser repetido.
DO $$
DECLARE
  r record;
  v_user uuid;
BEGIN
  FOR r IN SELECT id FROM appointments WHERE status = 'CONCLUIDO'
  LOOP
    PERFORM public._aplicar_conclusao(r.id);
  END LOOP;

  FOR v_user IN SELECT DISTINCT user_id FROM transactions WHERE type = 'RECEITA' AND user_id IS NOT NULL
  LOOP
    PERFORM public._vincular_receitas(v_user);
  END LOOP;
END $$;
