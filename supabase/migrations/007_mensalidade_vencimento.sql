-- Cobrança de mensalidade: dia de vencimento e se cobra no mês seguinte
-- Execute no SQL Editor DEPOIS de 006 (ou após 003, se 006 já rodou).

ALTER TABLE clients ADD COLUMN IF NOT EXISTS monthly_fee numeric(10,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS monthly_due_day integer DEFAULT 10;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS monthly_due_offset integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN clients.monthly_due_day IS 'Dia do vencimento (1-31; 31 = último dia do mês)';
COMMENT ON COLUMN clients.monthly_due_offset IS '0 = mesmo mês dos serviços; 1 = mês seguinte (ex: dia 10)';
