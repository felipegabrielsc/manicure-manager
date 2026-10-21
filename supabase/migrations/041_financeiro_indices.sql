-- Índices para o carregamento do Financeiro e para a conferência de lançamentos.
-- Rode no SQL Editor depois da 040, com backup já feito.
-- Não apaga appointments, transactions, cobranças nem pagamentos.
--
-- Estes índices seguem os filtros das consultas. Não houve EXPLAIN neste
-- ambiente: confirme o plano numa cópia do banco antes de tratar o ganho
-- como medido.
--
-- appointments (user_id, start_time)
--   A tela filtra a agenda por intervalo de start_time. A RLS restringe
--   user_id = workspace_id(). A conferência também percorre concluídos
--   do salão por start_time.
-- appointments (client_id, start_time) WHERE status = 'CONCLUIDO'
--   "Cliente novo ou recorrente" busca visitas concluídas anteriores
--   de um conjunto de client_id.
-- transactions (user_id, date)
--   Despesas e receitas do período filtram date, com a mesma RLS de user_id.
-- transactions (user_id) WHERE type = 'RECEITA' AND charge_id IS NULL
--   sincronizar_financeiro_existente percorre só a receita ainda sem cobrança.

CREATE INDEX IF NOT EXISTS appointments_user_start_idx
  ON appointments (user_id, start_time);

CREATE INDEX IF NOT EXISTS appointments_concluido_client_start_idx
  ON appointments (client_id, start_time)
  WHERE status = 'CONCLUIDO';

CREATE INDEX IF NOT EXISTS transactions_user_date_idx
  ON transactions (user_id, date);

CREATE INDEX IF NOT EXISTS transactions_receita_aberta_idx
  ON transactions (user_id)
  WHERE type = 'RECEITA' AND charge_id IS NULL;
