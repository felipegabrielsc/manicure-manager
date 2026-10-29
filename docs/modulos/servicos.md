# Serviços

## A. Objetivo

Guardar nome, preço padrão, duração e aviso de retorno.

## B. Arquitetura interna

Uma página só: `src/pages/Servicos.jsx`. Não há service layer.

## C. Arquivos

`src/pages/Servicos.jsx`. A duração é lida por `getServiceDuration` em `src/utils/scheduling.js`. O onboarding insere o primeiro serviço se a tabela estiver vazia (`src/pages/Onboarding.jsx`).

## D. Fluxo

O formulário no topo da página faz insert. A lista abaixo edita ou remove, conforme os botões da própria página. O novo horário e a agenda pública leem `name`, `default_price` e `duration_minutes`.

## E. Banco

`services`. `duration_minutes` na `001`. `maintenance_days` na `032`, com check de nulo, 15, 21 ou 30.

## F. Regras

Durações oferecidas na tela: 30, 45, 60, 90, 120. Preço do horário já criado fica em `appointments.agreed_price`.

## G. Dependências

Agenda, agenda pública, slots. Sem serviço, a página pública não tem opção.

## H. Segurança

RLS `services_own`. Visitante não lê a tabela. A RPC de perfil e de agenda devolve o que a função selecionar.

## I. Erros

Erro do Supabase no toast da página. Não há código de erro de domínio próprio.

## J. Testes

Nenhum arquivo dedicado. Duração padrão 60 é coberta de forma indireta em `scheduling.test.js`.

## K. Impacto

Alterar duração muda horários livres futuros, não o intervalo já gravado de um appointment antigo, porque a duração usada no conflito lê o serviço atual. Isso pode fazer um horário antigo “encolher” ou “crescer” na validação. Confirmar em `getBusyIntervals` antes de mudar a duração de um serviço com agenda cheia.
