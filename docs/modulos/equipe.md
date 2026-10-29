# Equipe

## A. Objetivo

Cadastrar unidades e profissionais, definir comissão e gerar o login da profissional.

## B. Arquitetura interna

`src/pages/Equipe.jsx` grava `locations` e `staff_members` e chama `criar_convite_staff`. O filtro da Agenda e o select do novo horário leem `staff_members`.

## C. Arquivos

`src/pages/Equipe.jsx`, `src/pages/Agenda.jsx`, `src/pages/NovoAgendamento.jsx`, `src/utils/sessionProfile.js`.

## D. Fluxo

Unidade: nome, endereço, botão padrão. Profissional: nome, WhatsApp opcional, comissão em percentual, unidade opcional. O botão Login pede o e-mail do convite e a RPC devolve o token. O cadastro da profissional usa `/cadastro-vip?token=`.

## E. Banco

`locations`, `staff_members`, `staff_invites`. `appointments.staff_id` e `location_id` na `002`. `commission_entries.staff_id` na `040`.

## F. Regras

Comissão usada na conclusão fica congelada. Conflito de horário distingue profissionais (`staffSlotsConflict`). Duas profissionais podem ocupar a mesma hora. Horário sem profissional conflita com qualquer um. A profissional logada não abre esta página.

## G. Dependências

Agenda, financeiro (comissões), autenticação (convite). Feature `Equipe` no plano.

## H. Segurança

RLS do workspace. O convite é RPC `SECURITY DEFINER`. Não colocar o token em log de front. A profissional não vira admin.

## I. Erros

Menu ausente: plano sem a feature, ou conta de profissional. Convite inválido na tela de cadastro usa o `reason` da RPC.

## J. Testes

`sessionProfile.test.js` cobre o perfil de staff. Não há teste da página Equipe nem da RPC de convite.

## K. Impacto

Apagar profissional com horário futuro deixa `staff_id` nulo se a FK for `ON DELETE SET NULL` (a `002` cria a FK; confirmar o `ON DELETE` no arquivo antes de documentar cascade). Mudar `commission_percent` não regrava `commission_entries`.
