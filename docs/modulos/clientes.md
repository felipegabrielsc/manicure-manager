# Clientes

## A. Objetivo

Cadastrar e buscar clientes, definir mensalidade ou pacote e guardar WhatsApp para aviso.

## B. Arquitetura interna

A página `Clientes.jsx` faz o CRUD na tabela. `ClientDetailSheet.jsx` mostra a ficha. Insights e carteira estão em `clientInsights.js` e `clientPortfolio.js`, usados também pelo financeiro.

## C. Arquivos

`src/pages/Clientes.jsx`, `src/components/ClientDetailSheet.jsx`, `src/utils/clientPortfolio.js`, `src/utils/clientInsights.js`, `src/application/mensalidade.js`.

## D. Fluxo

O `+` abre o modal. Salvar faz insert ou update com `user_id` do workspace. A trigger do banco reescreve `user_id` se a `037` estiver aplicada. A busca do novo horário lê a mesma tabela.

## E. Banco

`clients`. Colunas de mensalidade na `007`, pacote na `028`, aniversário na `033`, fidelidade na `002`.

## F. Regras

Tipo `AVULSO` ou `MENSALISTA`. Valor da mensalidade opcional. Vencimento padrão sugerido na tela: dia 10 do mês seguinte ou último dia do mês dos serviços. Pacote 0, 4 ou 6. Exportação CSV em Configurações, não nesta página.

## G. Dependências

Agenda, financeiro, fidelidade, notificações. Apagar cliente pode esvaziar `client_id` de cobranças (`ON DELETE SET NULL` na `040`, se o tipo de `clients.id` for o que a migration detectou).

## H. Segurança

RLS do workspace. A agenda pública não faz select de `clients`. Ela cria ou acha a cliente dentro da RPC.

## I. Erros

Nome e WhatsApp são `required` no formulário. Falha de coluna nova aparece como erro do PostgREST.

## J. Testes

`clientPortfolio.test.js`. Sem teste do modal.

## K. Impacto

Mudar `type`, `monthly_fee` ou o vencimento muda a aba Mensalidades. Mudar `package_used` na mão quebra a contagem da conclusão.
