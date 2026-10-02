# Plano de ação — Manicure Manager

Etapas 1 a 7 estão no código. Cole as migrations `029` a `033` no SQL Editor antes do deploy. A `033` é obrigatória se a `032` já foi aplicada: sem ela, marcar horário responde 404 porque `enqueue_notification` foi criada com `client_id` uuid e o banco usa bigint. O envio de WhatsApp fica desligado até existirem `WA_AKG_URL`, `WA_AKG_API_KEY` e `WHATSAPP_WEBHOOK_SECRET` nos secrets da Edge Function. As etapas 8 e 9 ainda não começaram.

Objetivo: o salão continua funcionando se o WhatsApp cair, e o WhatsApp passa a confirmar, lembrar, avisar cancelamento e pedir retorno sem depender do navegador aberto.

Cada etapa abaixo entra em produção sozinha. A seguinte só começa quando a anterior está no ar e a agenda atual continua igual para a dona do salão.

## Fora deste plano

- Renomear `user_id` para `tenant_id` ou criar a tabela `workspaces` agora.
- Colocar Baileys, sessão ou banco do WA-AKG dentro deste repositório.
- Usar Contact ou ScheduledMessage do WA-AKG como cliente ou agendamento.
- IA antes do envio automático de texto estar estável.
- Subir Vite ou React Router para a versão 8 por causa do GitGuard.
- Tratar como falha de segurança a comparação das duas senhas digitadas em `RedefinirSenha.jsx` e o `{{ .ConfirmationURL }}` do e-mail do Supabase.

## Ordem

1. Workspace consistente
2. Dependências que o app publicado realmente usa
3. Regras da agenda fora da tela
4. Fila de notificações no servidor
5. Conexão WhatsApp e provider
6. Automações do salão
7. CRM em cima dos dados que já existem
8. IA com ferramentas
9. Observabilidade do que já estiver em produção

---

## 1. Workspace consistente

Hoje `user_id` é o id da dona do salão. `workspace_id()` no Postgres já resolve isso, e `src/utils/workspace.js` também, mas quase ninguém chama o helper. Várias telas filtram pelo id de quem está logada. Para a profissional, a consulta volta vazia.

Também há duas tabelas fora dessa regra: `followup_reminders` e `portfolio_photos` usam `auth.uid() = user_id` e não entram no trigger da migration `009`. `push_subscriptions` continua por usuária, porque o celular é dela.

### Fazer

- Migration `029_workspace_followup_portfolio.sql`:
  - política de `followup_reminders` e `portfolio_photos` passa a `user_id = public.workspace_id()`;
  - as duas tabelas entram no trigger `force_workspace_user_id`.
- Trocar filtros `.eq('user_id', user.id)` pelo workspace em:
  - `src/pages/Financeiro.jsx`
  - `src/pages/Equipe.jsx`
  - `src/pages/Configuracoes.jsx`
  - `src/pages/Fidelidade.jsx`
  - `src/pages/Onboarding.jsx`
  - `src/components/PortfolioEditor.jsx`
  - `src/utils/loyalty.js`
  - `src/utils/notifications.js`
  - chamadas de `fetchSchedulingContext` / `fetchWeekAppointments` que recebem o id da sessão em vez do workspace.
- `Agenda.jsx` grava retorno e lembrete com o workspace, não com o id da profissional logada.
- Teste de `workspaceId()` cobrindo dona (sem `salon_owner_id`) e profissional (com `salon_owner_id`).

### Pronto quando

- Dona e profissional veem a mesma agenda, os mesmos clientes, o mesmo financeiro e os mesmos retornos.
- Inserir retorno logada como profissional grava `user_id` da dona.
- Visitante anônimo continua sem ler `appointments` e `clients`.

---

## 2. Dependências

Um upgrade por pacote, na mesma linha principal.

- `react-router-dom` de `7.13.0` para `7.18.2`. Conferir login, agenda, agendamento público e reset de senha.
- `overrides` no `package.json` para a correção da mesma major que o lock já resolve: `vite` `7.3.5`, `postcss` `8.5.23`, `ws` `8.20.1` ou a patch indicada pelo advisory, e as linhas corrigidas de `brace-expansion`, `minimatch`, `picomatch`, `nanoid`, `browserslist`, `fast-uri`, `lodash`, `ajv`, `serialize-javascript`, `@babel/core`.
- Em `AgendamentoPublico.jsx`, trocar `Math.random` do código de 4 dígitos por `crypto.getRandomValues`. O código só identifica o pedido no texto do WhatsApp. Não vira senha.

### Pronto quando

- `npm test` e `npm run build` passam.
- O site publicado continua sendo o build estático. Nada de Vite 8.

---

## 3. Regras da agenda fora da tela

`Agenda.jsx` tem 804 linhas e mistura tela, banco, lista de espera, retorno e abertura do `wa.me`. A validação de horário já está em `src/utils/scheduling.js`. Os textos já estão em `src/utils/bookingMessages.js`.

### Fazer

Criar `src/application/appointmentService.js` com as operações que hoje moram na página:

- confirmar e recusar pedido público;
- concluir, falta e cancelamento com motivo;
- remarcar, reusando `validateBookingSlot`;
- marcar retorno em 15, 21 ou 30 dias;
- registrar lembrete de retorno;
- avisar item da lista de espera.

A página chama o serviço e desenha o resultado. O serviço ainda pode abrir o `wa.me` nesta etapa, para o comportamento da manicure não mudar. Na etapa 6 esse envio vira registro na fila.

Não mover o projeto inteiro para `domain/` e `application/` de uma vez.

### Pronto quando

- Confirmar, cancelar, remarcar, retorno e espera funcionam igual na agenda.
- A página não monta mais o `update` do Supabase dessas ações.
- Testes cobrem conflito de horário e o texto de confirmação, lembrete, cancelamento e retorno.

---

## 4. Fila de notificações

O lembrete crítico não pode depender de `checkPendingNotifications` no `App.jsx`. O modelo a copiar é `supabase/functions/push-dispatch`: Edge Function com `CRON_SECRET`, service role e agenda no Supabase.

### Banco — migration `030_notifications.sql`

Tabela `notifications`:

| coluna | uso |
|---|---|
| `id` | uuid |
| `user_id` | workspace, mesma regra das outras tabelas |
| `appointment_id`, `client_id` | opcionais |
| `channel` | `whatsapp`, `push`, `email`, `sms` |
| `type` | os tipos abaixo |
| `scheduled_for` | quando o worker pode enviar |
| `sent_at` | preenchido só depois do envio aceito |
| `status` | `pending`, `sending`, `sent`, `failed`, `cancelled` |
| `attempts`, `next_attempt_at` | retry |
| `provider`, `provider_message_id` | preenchidos na etapa 5 |
| `idempotency_key` | única |
| `payload` | jsonb com o texto já renderizado |
| `error_message` | último erro |
| `created_at`, `updated_at` | |

Tipos desta etapa: `appointment_created`, `appointment_confirmed`, `appointment_cancelled`, `appointment_rescheduled`, `appointment_reminder_24h`, `appointment_reminder_2h`, `appointment_completed`, `client_return_reminder`, `waitlist_available`, `payment_reminder`, `birthday`. `campaign` fica só no enum, sem tela.

Índice único em `idempotency_key`. Chave estável: `workspace + appointment ou client + type + channel + scheduled_for` arredondado ao minuto. O mesmo evento gravado três vezes não cria três linhas.

RLS com `workspace_id()`. O worker usa service role e não depende da sessão da manicure.

Retry: tentativa imediata, depois 30s, 2min e 10min. Na quarta falha, `failed` e `error_message`. WhatsApp sem conexão não entra nesse retry: fica `pending` com `no_connection`.

### Código

- `src/application/notificationService.js`: `enqueue`, `cancelPending`. Não envia WhatsApp daqui.
- `supabase/functions/notification-dispatch`: a cada minuto, pega `pending` com `next_attempt_at <= now()`, marca `sending`, entrega o canal e grava `sent` ou reagenda.
- Nesta etapa o canal `push` reaproveita o envio que já existe em `push-dispatch`. O canal `whatsapp` grava a notificação e, se não houver conexão, deixa `pending` com erro `no_connection`. O `wa.me` manual continua disponível na agenda.
- `email` e `sms` existem no check da coluna e não têm worker.

### Pronto quando

- Criar um horário gera a confirmação e os dois lembretes com `scheduled_for` calculado no servidor, em `America/Sao_Paulo`.
- Cancelar o horário marca as notificações ainda `pending` como `cancelled`.
- Rodar o worker duas vezes não manda o push duas vezes.
- Fechar o navegador não impede o push. O WhatsApp automático ainda espera a etapa 6.

---

## 5. Conexão WhatsApp

O WA-AKG sobe fora deste repositório: processo contínuo (PM2 ou Docker), banco próprio, Baileys. Edge Function não segura o WebSocket. Uma instância, uma sessão por salão.

### Banco — migration `031_whatsapp_connections.sql`

`whatsapp_connections`: `id`, `user_id` (workspace), `provider` (`wa_akg` agora, `meta` reservado), `provider_session_id`, `phone_number`, `display_name`, `status` (`disconnected`, `connecting`, `connected`, `attention`), `connected_at`, `last_seen_at`, `created_at`, `updated_at`. Uma conexão ativa por workspace.

A chave `X-API-Key` do WA-AKG fica em secret da Edge Function. Nunca em variável `VITE_`.

### Código, só no servidor

- `supabase/functions/_shared/whatsapp/provider.ts`: `connect`, `disconnect`, `getStatus`, `sendText`. `sendImage`, `sendDocument` e `sendTemplate` ficam na interface e retornam não implementado até existir uso.
- `WaAkgProvider` chama `POST /api/messages/{sessionId}/{jid}/send` do WA-AKG.
- `supabase/functions/whatsapp-connect`: cria a sessão, devolve o QR e grava o status.
- `supabase/functions/whatsapp-webhook`: exige segredo próprio no header. Lê `sessionId`, acha o workspace e, nesta etapa, só atualiza status e registra a mensagem recebida. Não responde com IA.
- `notification-dispatch` passa a chamar `sendText` quando `channel = whatsapp` e a conexão está `connected`. Grava `provider_message_id`. Se o gateway cair, a notificação fica `pending` e entra no retry. Agenda, clientes e financeiro não leem essa tabela.

### Tela

Em Configurações, um bloco WhatsApp: conectado, conectando, desconectado, atenção. Ações: conectar (mostra o QR), desconectar, reconectar. A profissional vê o status e não troca a sessão. Quem conecta é a dona.

O telefone da cliente continua em `clients.phone`. Não há coluna obrigatória apontando para o contato do WA-AKG.

### Pronto quando

- Dá para conectar um número de teste, ler o status no painel e enviar um texto manual pelo worker.
- A chave não aparece no bundle (`npm run build` e busca por `WA_AKG` / `X-API-Key` no `dist`).
- Com o gateway desligado, a agenda abre e o único efeito é a notificação permanecer `pending`.

Antes de codar esta etapa, o ambiente do WA-AKG precisa existir: URL interna, banco, `AUTH_SECRET` e a API key. Sem isso, a migration e a tela de status podem entrar, e o envio fica desligado.

---

## 6. Automações

O `appointmentService` deixa de abrir o `wa.me` como caminho principal. Ele grava o fato. O worker envia.

| Fato | Notificações |
|---|---|
| Pedido público criado | `appointment_created` na hora, para a cliente |
| Confirmado | `appointment_confirmed` na hora, mais `appointment_reminder_24h` e `appointment_reminder_2h` |
| Cancelado ou falta | `appointment_cancelled`; cancela lembretes `pending` |
| Remarcado | `appointment_rescheduled`; recalcula os dois lembretes |
| Concluído | `appointment_completed` pedindo avaliação; se o serviço tiver manutenção, `client_return_reminder` em 15, 21 ou 30 dias |
| Horário liberado com alguém na espera | `waitlist_available` para o primeiro item `ABERTA` daquele serviço |
| Mensalidade no dia | `payment_reminder` no canal WhatsApp, além do push que já existe |

Textos: reutilizar `src/utils/bookingMessages.js` e completar o que ainda é frase solta na agenda (cancelamento, retorno marcado, espera, pós-atendimento). O lembrete de 2 horas é novo. O de 24 horas respeita `reminder_hours_before` do perfil. Se a manicure desligar `reminders_enabled`, os lembretes nascem `cancelled`.

O botão atual de abrir WhatsApp permanece como reenvio manual e gera notificação `sent` com `provider = manual`, para não disparar de novo pelo worker.

### Pronto quando

- Um horário confirmado produz confirmação, lembrete de 24h e lembrete de 2h, cada um uma vez.
- Cancelar não deixa lembrete futuro sair.
- Lista de espera e retorno disparam sem a manicure clicar.
- O push da dona continua.

---

## 7. CRM

Não é um módulo novo. `summarizeClient` em `src/utils/clientInsights.js` já calcula atendimentos, faturado, ticket e fidelidade. Falta a visão da carteira.

### Fazer

- Uma consulta por workspace, só leitura, com última visita, dias desde a última visita, frequência, valor gasto, ticket médio, faltas e cancelamentos.
- Segmentos na tela de Clientes: novas, frequentes, inativas (sem visita além da janela de retorno do serviço), VIP (maior valor ou acima de um mínimo configurável), sem retorno, aniversariantes do mês, cancelaram, não compareceram.
- Ação de cada segmento: enfileirar uma notificação, não abrir dez `wa.me`. Aniversário usa o tipo `birthday` e o worker da etapa 4.
- Exportação CSV que já existe em Configurações continua sendo o caminho de saída dos dados.

### Pronto quando

- Os números de uma cliente batem com a ficha que `summarizeClient` já mostra.
- Inativa e aniversariante levam a uma notificação `pending`, visível antes do envio.

---

## 8. IA

Só depois da etapa 6 estável: conectar, receber, identificar, enviar e as automações acima sem duplicar mensagem.

Fluxo: webhook do WA-AKG identifica o workspace pela sessão e a cliente pelo telefone. A mensagem fica registrada. O classificador devolve uma intenção. A intenção chama uma ferramenta. A ferramenta chama o `appointmentService` ou uma leitura. A resposta volta pelo `WhatsAppProvider`.

Ferramentas, nesta ordem: `get_business_info`, `get_services`, `get_available_slots`, `get_client`, `create_appointment`. Depois: `cancel_appointment`, `reschedule_appointment` e hand-off para a manicure quando a confiança for baixa ou a cliente pedir pessoa.

A ferramenta de criar horário usa a mesma validação de `validateBookingSlot` e a RPC pública. A IA não recebe a service role nem escreve SQL.

### Pronto quando

- "Quero marcar unha sexta" oferece horários livres e só grava depois da cliente escolher.
- Horário ocupado é recusado pela regra do salão, não pelo texto do modelo.
- Com a IA desligada, as automações da etapa 6 seguem iguais.

---

## 9. Observabilidade

Entra junto com o que já estiver mandando mensagem, não como projeto separado no fim.

- Log do worker: workspace, tipo, canal, status, tentativa, sem corpo completo do telefone em texto aberto.
- Contagem de `failed` e de conexão `attention` visível para a dona do SaaS no Admin.
- Limite de envio por workspace no worker, para um salão não disparar rajada.
- Notificação que esgotou o retry permanece `failed` e pode ser reenfileirada à mão. Isso é a fila morta desta fase.
- Segredo do webhook diferente do `CRON_SECRET` e da chave do Mercado Pago.

Backup, teste de carga e troca automática para a API da Meta ficam para quando houver mais de um salão conectado. A coluna `provider` já deixa essa troca possível.

---

## Como executar

Uma etapa, um pull request, migrations no SQL Editor do Supabase antes do deploy do front que depende delas. Edge Functions desta sequência: `notification-dispatch`, `whatsapp-connect`, `whatsapp-webhook`. `push-dispatch` e `mp-webhook` permanecem.

Critério para passar de etapa: a agenda da dona, o link público `/agendar/:userId` e o financeiro abrem e gravam como antes.
