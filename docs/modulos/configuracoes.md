# Configurações

## A. Objetivo

Dados do salão, expediente, link público, sinal PIX, lembretes, push, bloqueios e exportação de clientes.

## B. Arquitetura interna

Uma página longa, `src/pages/Configuracoes.jsx`. O primeiro preenchimento também ocorre em `src/pages/Onboarding.jsx`, que grava perfil, `business_hours` e o primeiro serviço.

## C. Arquivos

`src/pages/Configuracoes.jsx`, `src/pages/Onboarding.jsx`, `src/components/WhatsAppStatus.jsx`, `src/components/PortfolioEditor.jsx`, `src/utils/notifications.js`.

## D. Fluxo

Carrega `profiles`, `business_hours` e bloqueios. **Salvar Dados & Horários** grava perfil e expediente. Copiar link, bloquear agenda e adicionar bloqueio disparam a ação do próprio botão, sem esperar o salvar geral. Push chama `subscribeToPush` no browser e grava `push_subscriptions`.

## E. Banco

`profiles`, `business_hours`, `blocked_slots`, `push_subscriptions`, `portfolio_photos`, storage `portfolio`.

## F. Regras

`booking_active` true mostra Agenda Aberta. False mostra Bloqueada e a página pública recusa pedido. Expediente com domingo fechado é o padrão do onboarding, não uma trava permanente. Sinal: modo, valor e `pix_key`. Lembretes: 12, 24 ou 48 horas. CSV de clientes inclui nome, WhatsApp, tipo e fidelidade.

## G. Dependências

Agenda pública, novo agendamento (slots), notificações, planos (a dona entra aqui mesmo com plano vencido).

## H. Segurança

Profissional não tem rota. `pix_key` e WhatsApp são dados pessoais do salão. O CSV é download local. Não enviar para analytics.

## I. Erros

Falha ao copiar: toast para selecionar o texto. Push indisponível desabilita o botão. Coluna `ai_enabled` ausente esconde o atendimento automático e mostra o aviso da página.

## J. Testes

Nenhum da página. `notifications` do browser não tem teste de integração.

## K. Impacto

Gravar expediente vazio fecha a agenda pública e os slots. `booking_active = false` não apaga horários já aceitos.
