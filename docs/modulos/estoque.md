# Estoque

## A. Objetivo

Listar materiais, quantidade, unidade e alerta de mínimo. Opcionalmente informar preço de venda.

## B. Arquitetura interna

Tudo em `src/pages/Estoque.jsx`. A venda que baixa estoque pelo financeiro está em `Financeiro.jsx`, não aqui.

## C. Arquivos

`src/pages/Estoque.jsx`. A carga secundária do financeiro também lê `inventory_items` em `financeiroLoad.js`.

## D. Fluxo

Formulário Novo item faz insert. Cada linha tem `+`, `−` e lixeira. `+` e `−` somam ou subtraem 1 pela função `ajustar`.

## E. Banco

`inventory_items` na `002`. `sale_price` na `003`. RLS `inventory_items_own` por `workspace_id()`.

## F. Regras

Unidades na tela: `un`, `ml`, `g`, `pct`. Estoque baixo quando `quantity <= min_quantity`. O texto na linha é `ESTOQUE BAIXO`. Não lança despesa.

## G. Dependências

Menu só com a feature `Estoque`. Venda de produto no financeiro usa o mesmo cadastro e a quantidade.

## H. Segurança

A trava de plano é o `PlanGate`. A tabela continua legível por qualquer JWT do workspace.

## I. Erros

Lista vazia: “Nenhum item cadastrado.” Falha de rede aparece como erro do Supabase na função da página.

## J. Testes

Nenhum arquivo de estoque. A venda aparece só se o financeiro de teste montar transação com `inventory_item_id`. Não há esse caso dedicado.

## K. Impacto

Mudar a unidade não converte quantidade. Apagar item com venda antiga depende do `ON DELETE SET NULL` em `transactions.inventory_item_id`.
