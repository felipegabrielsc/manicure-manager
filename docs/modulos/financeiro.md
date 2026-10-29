# Financeiro

## A. Objetivo

Separar faturamento, caixa, contas a receber, despesas, mensalidades e comissões.

## B. Arquitetura interna

```text
Financeiro.jsx
  financeiroSync.js      decide se chama a RPC de sincronização
  financeiroLoad.js      consultas paralelas
  financeiroCache.js     60 segundos por salão e mês
  financeiroService.js   RPCs e gravações
  domain/financeiro.js   cálculo puro
  FinanceResumo.jsx      números
  FinanceGraficos.jsx    recharts, lazy
  FinanceOverview.jsx    painel, lazy
```

## C. Arquivos

Os da árvore acima, mais `src/application/mensalidade.js`, `src/application/financeiroView.js`, `src/application/financeiroTiming.js`, `src/utils/financeInsights.js`, `src/utils/exportReport.js`, `src/components/pagamentoLabels.js`.

## D. Fluxo

Abrir a página não espera a sincronização, exceto quando `decidirSincronizacao` devolve `bloquearLeitura: true` (sync forçado ou livro sujo). A carga principal traz agenda e transações do mês. A secundária traz auditoria, estoque, equipe, caixa de hoje, meta e clientes. Gráficos entram depois, em chunk separado.

Se `financial_charges` não existe, o serviço marca a origem como derivada e `derivarLivro` monta cobranças na memória.

## E. Banco

`transactions`, `financial_charges`, `financial_charge_items`, `financial_payments`, `commission_entries`, `financial_audit_log`, `financial_goals`. RPCs da `040`. Índices da `041`.

`COLUNAS.transacao` em `financeiroLoad.js` não inclui `staff_id`.

## F. Regras

Todas as fórmulas estão em [Regras de negócio](../05-regras-de-negocio.md). Status: `PENDENTE`, `PARCIAL`, `PAGO`, `ESTORNADO`, `CANCELADO`. Comissão nasce na conclusão. Resultado de caixa não é resultado operacional.

Abas: Visão geral, Movimentações, A receber, A pagar, Mensalidades, Comissões, Relatórios. A profissional não vê Relatórios, meta nem lançamento manual.

## G. Dependências

Agenda (conclusão), clientes (mensalidade), equipe (comissão), estoque (venda). `App.jsx` limpa o cache quando o usuário da sessão muda.

## H. Segurança

RLS por workspace. Auditoria é leitura. A profissional recebe a lista já filtrada em `filtrarVisaoFinanceira`, no cliente. Quem chamar a API ainda lê as linhas do salão inteiro se a RLS for a da `009`.

## I. Erros

`erroPrincipal` com botão Tentar de novo. Aviso se a sincronização falha. Aviso se as despesas não voltam. Aviso amarelo se a `040` não foi aplicada, dizendo para rodar o SQL. Texto em `Financeiro.jsx` por volta do bloco `!persistido`.

## J. Testes

`src/domain/financeiro.test.js`, `src/application/financeiroLoad.test.js`, `src/application/mensalidade.test.js`, `src/utils/financeInsights.test.js`, `src/utils/salonReports.test.js`.

Não coberto: render da página, RPC real, corrida de dois recebimentos no banco.

## K. Impacto

Qualquer mudança em `roundMoney`, status ou na lista de colunas de `transactions` precisa dos testes de domínio e de carga. Não editar a `040` já aplicada. Função nova vai em `042`. Não reintroduzir `staff_id` no select.
