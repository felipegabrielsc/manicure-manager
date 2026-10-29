# Problemas conhecidos

Referência: commit `4f7498e`. Bug confirmado aqui significa que o código ou o SQL do repositório mostra o comportamento. Não significa que ele já ocorreu no banco de produção. Risco não confirmado está separado.

## Confirmados no repositório

### 1. Policy de bloqueio pública não é removida

- Evidência: `supabase/migrations/001_phase1_phase2.sql` cria `"blocked_slots_public_read"` com `USING (true)`. Busca por `DROP POLICY` desse nome não acha outra migration.
- Impacto: se a policy ainda está aplicada, leitura anônima de todos os bloqueios, com o campo `reason`.
- Prioridade sugerida: alta para conferir no banco. A correção, se a policy existir, é uma migration nova. Não editar a `001`.
- Investigação: no SQL Editor, `select polname from pg_policy` ligado a `blocked_slots`, ou `\d+` no psql. Não foi executado.

### 2. Duas migrations com prefixo 029

- Evidência: `029_mp_billing_idempotency.sql` e `029_workspace_followup_portfolio.sql`.
- Impacto: uma ferramenta que versiona só pelo número pode pular a segunda. Falta idempotência de cobrança ou a policy de portfólio.
- Prioridade: alta na hora de auditar `schema_migrations`.
- Investigação: `select version from supabase_migrations.schema_migrations order by version`.

### 3. Não existe schema inicial

- Evidência: a `001` só dá `ALTER TABLE` em `services`, `profiles` e `appointments`.
- Impacto: clonar o repositório não cria um banco utilizável.
- Prioridade: média para quem for abrir ambiente novo.
- Investigação: pedir um dump de estrutura, sem dados, do projeto que já funciona.

### 4. Onboarding ignora erro de gravação

- Evidência: `concluir` em `src/pages/Onboarding.jsx` não lê `error` de `profiles.update`, `business_hours.delete/insert` nem `services.insert`. `onboarding_done` é gravado no primeiro update.
- Impacto: a dona pode entrar na Agenda sem expediente e com a agenda pública já ligada (`booking_active: true`).
- Prioridade: média.
- Investigação: simular falha de RLS em `business_hours` num projeto de teste.

### 5. Cupom conta uso fora da transação do horário

- Evidência: `criarAgendamento` insere o horário e depois atualiza `uses_count`.
- Impacto: horário gravado e contador não atualizado, ou o contrário se o processo morrer no meio. Também não há lock do `max_uses`.
- Prioridade: média.
- Investigação: dois cliques rápidos no mesmo cupom no limite de usos.

### 6. Conclusão da agenda não depende da cobrança

- Evidência: `sincronizarConclusao` em `appointmentService.js` ignora erro de RPC ausente e não devolve falha para a tela.
- Impacto: horário `CONCLUIDO` sem `financial_charges` quando a `040` não está aplicada ou a RPC falha por outro motivo que case com `rpcAusente`. Erro que não casa com esse filtro também é ignorado (`if (error && !rpcAusente(error)) return`), ou seja, a função retorna sem avisar a tela.
- Prioridade: alta para suporte de “concluí e não entrou no financeiro”.
- Investigação: comparar `appointments.status` e `financial_charges.appointment_id`.

### 7. README atrasado em relação ao SQL e ao CI

- Evidência: a lista do README terminava na `039`. Existem `040` e `041`. O texto diz que o CI roda em todo push. `ci.yml` é push na `main` e pull request. O texto pede Node 18+. O CI usa Node 20. A frase do teste de 14 dias inclui Serviços como item de plano. `BASIC_FEATURES` não inclui Serviços, e Serviços também não está em `FEATURE_BY_PATH`.
- Impacto: operador deixa de aplicar a `040` ou espera o CI num branch que não dispara.
- Prioridade: baixa, corrigida na atualização do README desta documentação.
- Investigação: nenhuma além da leitura.

### 8. `docs/plano-de-acao.md` não descreve o sistema atual

- Evidência: o arquivo é um plano anterior. As regras vigentes estão em `src/domain/financeiro.js` e na `040`.
- Impacto: uma alteração guiada por esse plano reimplementa o que já existe ou contradiz a comissão na conclusão.
- Prioridade: baixa se ninguém o usar como especificação.

## Limitações, não bugs

- Plano Pro é só navegação.
- Cache do financeiro não cruza abas.
- Cron e gateway não estão no git.
- Lint não falha o CI.
- Assistente de WhatsApp só existe com `ai_enabled` e gateway. Sem isso, a tela esconde ou avisa.

## Não confirmado

- Se a policy pública de bloqueio está mesmo presente no projeto hospedado.
- Se as duas `029`, a `040` e a `041` foram aplicadas.
- Tempo real das consultas.
- Se `push-dispatch` e `notification-dispatch` estão os dois agendados.
- Divergência byte a byte entre `recalcular_status_cobranca` e `statusFinanceiro`. Os dois existem. Não foi feito um teste que rode os dois com o mesmo vetor de pagamentos. Tratar como risco de divergência até alguém colocar o mesmo caso nos dois lados.
