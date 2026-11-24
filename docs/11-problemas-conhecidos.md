# Problemas conhecidos

Referência: commit `4f7498e` (texto original). Itens corrigidos nesta rodada citam a `043` e o código atual.

## Confirmados no repositório

### 1. Policy de bloqueio pública — corrigido na `043`

- Evidência antiga: `001` criava `"blocked_slots_public_read"` com `USING (true)`.
- Correção: `043_audit_isolamento_e_cupom.sql` dá `DROP POLICY` nesse nome (com e sem aspas).
- Pendência de operação: conferir no banco hospedado se a `043` foi aplicada (`select polname from pg_policy` em `blocked_slots`).

### 2. Duas migrations com prefixo 029

- Evidência: `029_mp_billing_idempotency.sql` e `029_workspace_followup_portfolio.sql`.
- Impacto: uma ferramenta que versiona só pelo número pode pular a segunda. Falta idempotência de cobrança ou a policy de portfólio.
- Prioridade: alta na hora de auditar `schema_migrations`.
- Investigação: `select version from supabase_migrations.schema_migrations order by version`.
- A `043` não recria essas migrations — só documenta a obrigação de as duas constarem no histórico.

### 3. Não existe schema inicial

- Evidência: a `001` só dá `ALTER TABLE` em `services`, `profiles` e `appointments`.
- Impacto: clonar o repositório não cria um banco utilizável.
- Prioridade: média para quem for abrir ambiente novo.
- Investigação: pedir um dump de estrutura, sem dados, do projeto que já funciona. Não inventar `000` sem dump.

### 4. Onboarding ignora erro de gravação — corrigido no front

- Correção: `src/pages/Onboarding.jsx` confere `error` em perfil, expediente e serviço; só grava `onboarding_done` e `booking_active` depois desses passos.

### 5. Cupom fora da transação — mitigado na `043`

- Correção: RPC `consumir_cupom` na `043`. O painel consome o cupom **antes** do insert quando a RPC existe; se a RPC faltar, cai no update legado com aviso.

### 6. Conclusão da agenda sem cobrança — mitigado no front

- Correção: erro real da RPC de sync falha a conclusão e **reverte** status (e pacote). RPC ausente devolve sucesso com `avisoFinanceiro` (toast na Agenda). Ainda depende de a `040` estar aplicada para gravar cobrança.

### 7. README atrasado em relação ao SQL e ao CI

- Prioridade: baixa. Existem `040`–`043`. CI: push na `main` e pull request, Node 20.

### 8. `docs/plano-de-acao.md` — arquivado

- Movido para `docs/arquivo/plano-de-acao.md` com aviso de histórico. Não usar como especificação.

## Limitações, não bugs

- Plano Pro continua só navegação (decisão consciente; ver `docs/12-historico-decisoes.md`).
- Cache do financeiro não cruza abas.
- Cron e gateway não estão no git.
- Lint não falha o CI.
- Assistente de WhatsApp só existe com `ai_enabled` e gateway.
- `derivarLivro` permanece como fallback de leitura se a `040` não existir.
- Pedido LGPD de exclusão grava `profiles.deletion_requested_at`; não há purge automático.

## Não confirmado

- Se a `043` (e as duas `029`, `040`–`042`) foram aplicadas no projeto hospedado.
- Tempo real das consultas.
- Se `push-dispatch` e `notification-dispatch` estão os dois agendados.
- Divergência byte a byte entre `recalcular_status_cobranca` e `statusFinanceiro`.
