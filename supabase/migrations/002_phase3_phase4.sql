-- Fase 3 + 4: metas, planos, push, fidelidade, cupons, estoque, equipe/unidades
-- Execute no SQL Editor do Supabase após a migration 001

-- ========== FASE 3: METAS FINANCEIRAS ==========
CREATE TABLE IF NOT EXISTS financial_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_amount numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, year, month)
);

-- ========== FASE 3: PLANOS / ASSINATURA ==========
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL DEFAULT 50,
  interval_type text NOT NULL DEFAULT 'monthly',
  checkout_url text,
  features jsonb DEFAULT '[]',
  active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

INSERT INTO subscription_plans (name, description, price, checkout_url, features, sort_order)
SELECT 'Básico', 'Agenda, clientes e financeiro', 49.90, NULL, '["Agenda","Clientes","Financeiro"]', 1
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Básico');

INSERT INTO subscription_plans (name, description, price, checkout_url, features, sort_order)
SELECT 'Pro', 'Tudo do Básico + fidelidade, estoque e equipe', 79.90, NULL, '["Agenda","Clientes","Financeiro","Fidelidade","Estoque","Equipe"]', 2
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Pro');

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES subscription_plans(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trial';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_enabled boolean DEFAULT false;

-- ========== FASE 3: PUSH NOTIFICATIONS ==========
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- ========== FASE 4: FIDELIDADE ==========
CREATE TABLE IF NOT EXISTS loyalty_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  visits_required integer NOT NULL DEFAULT 10,
  reward_description text DEFAULT '1 serviço grátis',
  active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS loyalty_visits integer DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS loyalty_rewards_redeemed integer DEFAULT 0;

-- ========== FASE 4: CUPONS ==========
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_type text NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric(10,2) NOT NULL,
  max_uses integer,
  uses_count integer DEFAULT 0,
  expires_at timestamptz,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, code)
);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES coupons(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS discount_applied numeric(10,2) DEFAULT 0;

-- ========== FASE 4: ESTOQUE ==========
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 0,
  min_quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit text DEFAULT 'un',
  created_at timestamptz DEFAULT now()
);

-- ========== FASE 4: UNIDADES E EQUIPE ==========
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  is_default boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES staff_members(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id);

-- ========== RLS ==========
ALTER TABLE financial_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financial_goals_own" ON financial_goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_subscriptions_own" ON push_subscriptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "loyalty_settings_own" ON loyalty_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "coupons_own" ON coupons FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "inventory_items_own" ON inventory_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "locations_own" ON locations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "staff_members_own" ON staff_members FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Planos: leitura pública, escrita só admin (via service role ou is_admin policy)
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_read_all" ON subscription_plans FOR SELECT USING (true);

-- Cupons: leitura pública por código (para agendamento)
CREATE POLICY "coupons_public_read" ON coupons FOR SELECT USING (active = true);

-- RPC: aplicar cupom
CREATE OR REPLACE FUNCTION validar_cupom(
  p_user_id uuid,
  p_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coupon coupons%ROWTYPE;
BEGIN
  SELECT * INTO v_coupon FROM coupons
  WHERE user_id = p_user_id AND UPPER(code) = UPPER(p_code) AND active = true;

  IF v_coupon IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Cupom inválido');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Cupom expirado');
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.uses_count >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Cupom esgotado');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', v_coupon.id,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value
  );
END;
$$;

-- RPC: incrementar fidelidade ao concluir agendamento
CREATE OR REPLACE FUNCTION incrementar_fidelidade(p_client_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active boolean;
BEGIN
  SELECT active INTO v_active FROM loyalty_settings WHERE user_id = p_user_id;
  IF v_active IS NOT FALSE THEN
    UPDATE clients SET loyalty_visits = COALESCE(loyalty_visits, 0) + 1
    WHERE id = p_client_id AND user_id = p_user_id;
  END IF;
END;
$$;
