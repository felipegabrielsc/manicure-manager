-- Fase B: financeiro — categoria, pagamento, venda de estoque
-- Execute no SQL Editor do Supabase após a migration 002

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS sale_price numeric(10,2);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity numeric(10,2);

UPDATE transactions
SET category = CASE
  WHEN type = 'DESPESA' THEN 'despesa'
  WHEN client_id IS NOT NULL THEN 'mensalidade'
  ELSE 'receita'
END
WHERE category IS NULL;
