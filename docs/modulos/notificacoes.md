# Notificações

## A. Objetivo

Confirmar horário, lembrar a cliente, avisar lista de espera e avisar o celular do salão. Opcionalmente responder WhatsApp quando o assistente está ligado.

## B. Arquitetura interna

O front enfileira e também abre `wa.me`. Quem envia sozinho é a Edge Function no cron.

```text
Agenda ou Configurações
  notificationService.js     enfileira e sincroniza
  notificationPlan.js        calcula a próxima tentativa
  dispatchPolicy.js          limite e classificação do erro
  notification-dispatch      claim, WhatsApp e push
  push-dispatch              cron anterior de push
  whatsapp-connect           pareia a sessão
  whatsapp-webhook           mensagem que entra
  assistant/turn.js          decisão da conversa
```

## C. Arquivos

Os da árvore, mais `src/utils/notifications.js`, `src/utils/bookingMessages.js`, `src/utils/whatsapp.js`, `src/sw.js`, `src/application/whatsappFormat.js`, `supabase/functions/_shared/whatsapp/provider.ts`.

## D. Fluxo

Criar, concluir, remarcar ou cancelar chama `syncAppointmentNotifications`. A função SQL `sync_appointment_notifications` (versão da `035`, se aplicada) grava linhas em `notifications`. O cron manda `claim_due_notifications` (`038`), envia e marca tentativa em `notification_attempts`. Item preso em `sending` além de `STUCK_SENDING_MS` volta para `pending`.

Sem `WA_AKG_URL` ou sem conexão `connected`, o WhatsApp da fila não sai. O botão manual da Agenda continua abrindo o aplicativo.

## E. Banco

`notifications`, `notification_attempts`, `whatsapp_connections`, `whatsapp_inbound`, `assistant_sessions`, `push_subscriptions`, `followup_reminders`.

## F. Regras

Antecedência 12, 24 ou 48 horas. Lembrete de horário já passado não é agendado pela `035`. Rajada limitada por `WHATSAPP_BURST_LIMIT` em `dispatchPolicy.js`. Retentativa usa `retryAfterFailure`. Lista de espera entra por `notify_waitlist` / `enqueueWaitlistAvailable`.

O assistente só grava remarcação ou cancelamento pelas RPCs `assistente_remarcar` e `assistente_cancelar`.

## G. Dependências

Agenda, configurações, agenda pública, equipe (o texto pode citar a profissional).

## H. Segurança

Cron: header `x-cron-secret` ou bearer igual a `CRON_SECRET` ou service role. Webhook: `WHATSAPP_WEBHOOK_SECRET`. `verify_jwt` está false no `config.toml` porque o cron não tem JWT de usuário. A função recusa sem segredo.

`WA_AKG_API_KEY` só no secret da função. Nunca em variável `VITE_`.

## I. Erros

`no_connection` deixa a linha pendente. Fila parada na Configurações reenfileira sem abrir WhatsApp. Push sem permissão do browser não assina.

## J. Testes

`notificationPlan.test.js`, `notificationService.test.js`, `dispatchPolicy.test.js`, `whatsappFormat.test.js`, `bookingMessages.test.js`, `src/application/assistant/turn.test.js`. Sem teste do fetch ao gateway.

## K. Impacto

Mudar o formato do payload quebra o worker e a tela. Mudar `claim_due_notifications` sem deploy da função faz o cron cair no select antigo, que o próprio `notification-dispatch` ainda tem como fallback. Dois workers sem a `038` podem enviar duplicado.
