# Operação, manutenção e desempenho

Referência: commit `4f7498e`. Não há medição de tempo de produção neste documento. Números abaixo são constantes do código, não tempo observado de request.

## Cache

| Peça | Constante | Efeito |
| --- | --- | --- |
| Financeiro | `CACHE_FINANCEIRO_MS` = 60_000 | Reabre o mês sem nova leitura |
| Sync | `SYNC_FINANCEIRO_MS` = 10 minutos | Não regrava a conferência a cada troca de mês |
| Geração | `geracoes` em `financeiroCache.js` | Resposta que voltou depois de `invalidarFinanceiro` não grava |
| Sessão | persistida pelo supabase-js | Sobrevive ao refresh |
| PWA | precache do Workbox | A casca do site pode ser a do build anterior até o `autoUpdate` |

Invalidação do financeiro: pagamento, despesa, estorno, comissão e troca de usuário (`limparCacheFinanceiro` em `App.jsx`). Se uma tela nova gravar dinheiro e não chamar `invalidarFinanceiro` nem `marcarFinanceiroSujo`, a tela pode mostrar o minuto anterior.

## Carga

`financeiroLoad.js` separa consulta principal e secundária. A principal pinta o resumo. A secundária preenche auditoria, estoque, equipe, caixa de hoje, meta e clientes anteriores. Gráficos são `React.lazy` em `FinanceGraficos.jsx` e `FinanceOverview.jsx`.

A Agenda não usa esse cache. Cada visita à data busca de novo.

Índices pedidos pela `041`: agenda por usuário e início, concluídos por cliente, transações por usuário e data, receitas sem `charge_id`. Sem `EXPLAIN`, não dá para afirmar que o plano de execução os usa.

## Consultas que já quebraram

Pedir `staff_id` em `transactions` gera HTTP 400. A coluna não existe nas migrations. O select atual está em `COLUNAS.transacao`. O teste “não pede staff_id” trava a regressão.

RPC ausente (`PGRST202` ou schema cache) é tratada como opcional em vários pontos. A tela segue e a cobrança pode não nascer. O sintoma é agenda concluída sem linha em `financial_charges`.

## Monitoramento e log

Não há Sentry, Datadog nem OpenTelemetry no `package.json`.

O que existe:

- `console.error` se faltam as variáveis do Supabase.
- `financeiroTiming.js` mede `financeiro:total` e etapas com `console.time` no browser.
- Edge Functions usam `console.error` com JSON em `logSafe` no webhook, sem o token.
- `notification_attempts` e `admin_fila_saude` para a fila.
- `financial_audit_log` para dinheiro.

## Falha e recuperação

| Falha | O que o código faz |
| --- | --- |
| Sync financeiro falha | Aviso na tela. A leitura segue com o que já foi buscado |
| Despesas não voltam | Aviso de que o caixa pode estar incompleto |
| Gateway WhatsApp fora | Item `pending` / `no_connection`. Agenda abre |
| Mercado Pago API fora | Webhook responde 503 |
| Item `sending` parado | Volta a `pending` depois de `STUCK_SENDING_MS` |
| Função de conclusão ausente | Status do horário muda mesmo assim |

Não há retry genérico de escrita do browser.

## Backup e restauração

O procedimento está no README e em [Instalação](07-instalacao-deploy.md): backup do painel ou `pg_dump`, restore em outro projeto. Não há job de backup neste repositório. A retenção depende do plano Supabase. Isso não foi lido no painel.

## Como investigar lentidão sem mudar o sistema

1. Abrir o financeiro com o console e ler os tempos `financeiro:` de `financeiroTiming.js`.
2. Ver se o aviso “Conferindo lançamentos novos…” fica na tela. Isso é a RPC `sincronizar_financeiro_existente`, que reprocessa conclusões. Ela não deveria bloquear a primeira pintura, exceto no caso sujo.
3. No SQL Editor de um banco de teste, `EXPLAIN` das consultas de `appointments` e `transactions` do mês. Não rodar `EXPLAIN ANALYZE` pesado em produção no horário de pico sem janela.
4. Confirmar se a `041` está aplicada. Sem ela, a consulta ainda funciona. Só não tem esses índices.
5. Separar lentidão de rede (PostgREST) de lentidão de render (gráficos). Os gráficos são chunk à parte.

## Como investigar uma falha

1. Reproduzir em homologação.
2. Anotar rota, perfil (dona, profissional, anônimo) e o corpo do erro do PostgREST.
3. Se for 400 em `transactions`, comparar a lista de colunas com `financeiroLoad.js` e com `information_schema.columns` num banco de teste.
4. Se for PGRST202, a migration da função não está no projeto.
5. Se o dinheiro não bate, ler `financial_charges`, `financial_payments` e `financial_audit_log` daquele `appointment_id`. Não atualizar essas tabelas para “corrigir na mão” sem entender a idempotência.
6. Fila: `notifications.status`, `error_message`, `notification_attempts`.

## Limitações operacionais

- O cron não está no git. Ambiente novo nasce mudo.
- Não há schema base. Não dá para criar o banco só com esta pasta.
- O lint não bloqueia o CI.
- Duas funções de push podem coexistir.
- Cache de financeiro é por aba. Duas abas não se invalidam entre si, só quando cada uma grava ou troca de usuário.
- Service worker pode servir JS antigo até o autoUpdate completar.
