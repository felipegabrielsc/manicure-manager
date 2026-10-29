# Agenda Manicure

Sistema de gestão para manicures: agenda, clientes, serviços, financeiro, agendamento público e painel admin.

A documentação técnica, para quem desenvolve, está em [docs/README.md](docs/README.md). O guia visual de uso do salão, quando existir no branch, fica em `docs/manual-usuario/` e não substitui o contrato técnico.

## Requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com)

## Setup local

1. Clone o repositório e instale dependências:

```bash
npm install
```

2. Copie as variáveis de ambiente:

```bash
cp .env.example .env
```

3. Preencha `.env`:

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anon/public |
| `VITE_MERCADOPAGO_CHECKOUT_URL` | Link de checkout Mercado Pago (planos) |
| `VITE_VAPID_PUBLIC_KEY` | Chave pública VAPID para push (opcional) |
| `VITE_PUBLIC_APP_URL` | URL pública do site (reset de senha; ex. `https://manicure-manager-ebon.vercel.app`) |

4. Execute as migrations SQL no Supabase (SQL Editor), **nesta ordem**:

```
supabase/migrations/001_phase1_phase2.sql
supabase/migrations/002_phase3_phase4.sql
supabase/migrations/003_phase_b_financeiro.sql
supabase/migrations/004_phase_d_rls_booking.sql
supabase/migrations/005_phase_e_invite_billing.sql
supabase/migrations/006_phase_f_push_staff.sql
supabase/migrations/007_mensalidade_vencimento.sql
supabase/migrations/008_fix_incrementar_fidelidade.sql
supabase/migrations/009_phase_g_ops.sql
supabase/migrations/010_admin_unlock_code.sql
supabase/migrations/011_admin_unlock_bypass.sql
supabase/migrations/012_admin_clear_staff_link.sql
supabase/migrations/013_fix_profiles_select_rls.sql
supabase/migrations/014_criar_convite_e_horarios.sql
supabase/migrations/015_invites_table_grants.sql
supabase/migrations/016_public_booking_service_and_lunch.sql
supabase/migrations/017_fix_validar_horario_overload.sql
supabase/migrations/018_criar_agendamento_publico_bigint.sql
supabase/migrations/019_solicitar_horario_publico.sql
supabase/migrations/020_fix_appointments_service_id_type.sql
supabase/migrations/021_fix_service_id_join_and_column.sql
supabase/migrations/022_marcar_horario_site.sql
supabase/migrations/023_marcar_horario_sem_validar.sql
supabase/migrations/024_diagnostico_agendamento.sql
supabase/migrations/025_pedir_horario_sem_id.sql
supabase/migrations/026_fix_appointment_id_bigint.sql
supabase/migrations/027_planos_preco_e_galeria.sql
supabase/migrations/028_perfil_planos_pacote_retorno.sql
supabase/migrations/029_mp_billing_idempotency.sql
supabase/migrations/029_workspace_followup_portfolio.sql
supabase/migrations/030_notifications.sql
supabase/migrations/031_whatsapp_connections.sql
supabase/migrations/032_notification_automations.sql
supabase/migrations/033_fix_enqueue_client_id.sql
supabase/migrations/034_assistant_and_observability.sql
supabase/migrations/035_skip_past_reminders.sql
supabase/migrations/036_public_booking_rate_limit.sql
supabase/migrations/037_admin_grants_e_rls.sql
supabase/migrations/038_notification_claim.sql
supabase/migrations/039_sinal_pix_e_inativas.sql
supabase/migrations/040_financeiro_recebimentos.sql
supabase/migrations/041_financeiro_indices.sql
supabase/migrations/042_fidelidade_mensagens_financeiro.sql
```

**Site novo:** rode **001–028**, depois **029_mp_billing**, **029_workspace**, **030–039**, a **040**, a **041** e a **042**. A **040** cria cobrança, pagamento, comissão e auditoria. A **041** só cria índices. Não reescreva esses arquivos se já tiverem sido aplicados. **Site que já estava no ar:** se o pedido pelo link falhar, rode pelo menos **017, 020–023 e 026**. Para fotos no perfil e preços R$ 125 / R$ 150, rode a **027**. A **028** entra com planos anuais, capa/logo, confirmação automática, pacote de visitas, antes/depois e lembrete de retorno. A **029_mp** evita renovação duplicada no Mercado Pago. A **030** cria a fila de notificações. A **037** desativa o código mestre de admin. A **038** recupera mensagens presas em `sending` e trava a fila para dois workers não enviarem o mesmo item. A **039** liga o sinal PIX, a chave PIX no site e a janela de inativas (30/45/60). A **040** grava cobrança, pagamento, estorno e comissão. A **041** cria os índices do financeiro. A **042** desliga a fidelidade por padrão, permite desativar as mensagens do bot por cliente e corrige mensalidade e “ainda não recebi”. Depois faça o deploy de `mp-webhook` e `push-dispatch`. O SQL **não** roda na Vercel — cole no **Supabase → SQL Editor**.

Não commite `.env` nem `supabase/.temp/`.

**Importante (004):** essa migration fecha o acesso anônimo direto às tabelas (`appointments`, `clients`, `profiles`, etc.) e passa o agendamento público para funções RPC. Rode o SQL **antes** (ou junto) do deploy do front. Sem a 004, a agenda pública deixa de funcionar. Com a 004 e o front antigo, também quebra — os dois precisam ir juntos.

5. Inicie o projeto:

```bash
npm run dev
```

O GitHub Actions (`.github/workflows/ci.yml`) roda `npm test` e `npm run build` em push na `main` e em pull request, com Node 20. O lint roda com `continue-on-error` e não bloqueia o check. Não reescreva migrations já aplicadas; correção nova vai em arquivo com o próximo número.

**Homologação e backup:** publique o front na Vercel em preview; SQL só no SQL Editor de um projeto Supabase de teste. Backup: Dashboard → Database → Backups, ou `pg_dump` do connection string. Restaure só em projeto de teste. Não rode `supabase db reset` em produção.

**Fila (038):** faça o deploy de `notification-dispatch` depois de colar a 038. O cron continua com `x-cron-secret`.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run preview` | Preview do build |
| `npm run lint` | ESLint |
| `npm test` | Testes (agenda, plano, pagamentos, notificações, permissões) |

## Rotas principais

| Rota | Descrição |
|------|-----------|
| `/` | Agenda |
| `/financeiro` | Financeiro, metas e exportação |
| `/fidelidade` | Programa de fidelidade e cupons |
| `/estoque` | Controle de estoque |
| `/equipe` | Unidades e profissionais |
| `/planos` | Assinatura SaaS |
| `/agendar/:userId` | Agendamento público |
| `/perfil/:userId` | Página pública da manicure |
| `/admin` | Painel administrador |
| `/onboarding` | Primeiros passos após o cadastro |

## Funcionalidades (Fases 1–4)

- **Agenda:** diária/semanal, lembretes WhatsApp, validação de horários
- **Financeiro:** metas mensais, exportar CSV, imprimir/PDF
- **Fidelidade:** cartão de visitas, cupons de desconto
- **Estoque:** alertas de estoque baixo
- **Equipe:** múltiplas unidades e profissionais
- **Planos:** assinatura via Mercado Pago (admin atribui planos)
- **Push:** notificações PWA (Configurações)

## Mercado Pago e convites (fase E)

Cadastro aberto (`/cadastro-vip` sem token) não funciona mais. No **Admin**, gere um convite de uso único e envie o link.

1. Rode `005_phase_e_invite_billing.sql` no SQL Editor.
2. Instale o [Supabase CLI](https://supabase.com/docs/guides/cli) e faça login no projeto.
3. Deploy das funções:

```bash
supabase functions deploy mp-create-preference
supabase functions deploy mp-webhook
supabase secrets set MP_ACCESS_TOKEN=APP_USR-seu-token
```

4. No Mercado Pago → Webhooks, cadastre:

`https://SEU_PROJETO.supabase.co/functions/v1/mp-webhook`

Eventos de **pagamento**. Sem a função + token, o botão Assinar cai no link fixo (`checkout_url`) e o plano **não** ativa sozinho.

O webhook **consulta a API oficial** (`GET /v1/payments/:id`) e só aplica o efeito financeiro uma vez por `mp_payment_id`. Notificação duplicada ou `pending` seguido de `approved` não gera duas assinaturas. Reembolso/`charged_back` cancela se aquele pagamento for o último ativo. Falha temporária da API responde **503** para o Mercado Pago tentar de novo. Rode a **029** e faça o deploy de `mp-webhook` de novo.

**Trava de plano:** o teste de 14 dias está na migration `005`. No código, o plano sem lista de features libera Agenda, Clientes e Financeiro. Serviços não está em `FEATURE_BY_PATH`, então abre em qualquer assinatura ainda válida. Estoque, Fidelidade e Equipe só aparecem se o plano trouxer esses nomes. Teste ou assinatura vencidos mandam para `/planos`. Configurações e Planos continuam acessíveis para a dona.

## Admin da plataforma e isolamento (037)

O código em `app_settings.admin_unlock_code` **não promove mais ninguém**. UUID no front também não. Admin é só `profiles.is_admin` no banco.

| Papel | O que pode |
|---|---|
| Dona do salão | Agenda, clientes, financeiro, equipe e config do **próprio** `user_id` / workspace |
| Profissional | Dados do salão em que entrou por convite de equipe; não vira admin; não abre Equipe/Config/Admin |
| Visitante | Só RPCs públicos (perfil, agenda, marcar horário). Sem SELECT em clientes/financeiro/fotos em lote |
| Admin da plataforma | Lista perfis, convites de cadastro, bloquear conta e plano. Gera **convite de admin** (2 dias, uso único) |

**Recuperação** se não houver nenhum `is_admin`: no SQL Editor, `UPDATE profiles SET is_admin = true WHERE id = '…';` (JWT nulo ignora a trava). Ou a conta de salão mais antiga chama `bootstrap_primeiro_admin()` uma vez.

## Segurança da agenda pública (fase D)

O visitante anônimo **não** lê nem grava `appointments` / `clients` direto. O site chama:

- `get_agenda_publica` — horários ocupados sem dados da cliente
- `get_perfil_publico` — página `/perfil/:id`
- `get_resumo_agendamento` — convite `/resumo/:id` (sem telefone)
- `criar_agendamento_publico` — cria o pedido com trava no banco (evita dois horários iguais ao mesmo tempo)

## Push (fase F)

1. Gere o par VAPID: `npx web-push generate-vapid-keys`
2. Pública no `.env` / Vercel: `VITE_VAPID_PUBLIC_KEY`
3. Privada **só** no Supabase (secrets):

```bash
supabase functions deploy push-dispatch
supabase secrets set VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set VAPID_SUBJECT=mailto:seu-email@dominio.com
supabase secrets set CRON_SECRET=uma-senha-longa
```

4. Rode `006_phase_f_push_staff.sql`
5. No Supabase → Edge Functions → `push-dispatch` → **Schedules**, a cada 5 minutos, com header `x-cron-secret: sua-senha`. Ou:

`https://SEU_PROJETO.supabase.co/functions/v1/push-dispatch`

6. Fila da etapa 4, depois de colar a **030**:

```bash
supabase functions deploy notification-dispatch
supabase functions deploy push-dispatch
```

O `notification-dispatch` usa o mesmo `CRON_SECRET`. Agende a cada minuto. Ele manda o push. O WhatsApp sai por ele quando a conexão está `connected`. Sem gateway, a linha fica `pending` com `no_connection` e a agenda abre normalmente. O `push-dispatch` redeployado não repete um push que já está nessa fila.

7. WhatsApp automático, com o gateway fora deste repositório:

```bash
supabase functions deploy whatsapp-connect
supabase functions deploy whatsapp-webhook
supabase functions deploy notification-dispatch
supabase secrets set WA_AKG_URL=https://seu-gateway
supabase secrets set WA_AKG_API_KEY=wag_sua_chave
supabase secrets set WHATSAPP_WEBHOOK_SECRET=uma-senha-longa
```

O `config.toml` deixa `verify_jwt = false` nessas três funções. O deploy tem de ser com o CLI, na raiz do repositório, no projeto `fkgmapnuzphaleuyffkq`. Publicar a Vercel não cria função. Se o botão Conectar mostrar *Failed to send a request to the Edge Function* ou *preflight doesn't pass*, a função ainda não existe nesse projeto: o OPTIONS responde 404.

Não coloque `WA_AKG_API_KEY` em variável `VITE_` nem na Vercel do site. Sem esses três secrets o botão Conectar avisa que o gateway não está configurado e nenhum texto automático sai.

8. No celular: instale o PWA e ative em **Configurações → Notificações Push**

A agenda mostra o nome da profissional e deixa filtrar. Duas profissionais podem ocupar o mesmo horário; conflito só na mesma pessoa (ou se o horário não tiver profissional).

## Mensalidade

Visita marcada como **Mensalidade** na Agenda **não entra no caixa** na hora. O valor aparece em **Financeiro → Mensalidades a receber** no mês do vencimento.

Padrões no cadastro da cliente:

- **Dia 10 do mês seguinte** (`monthly_due_offset = 1`)
- **Último dia do mês dos serviços** (`monthly_due_day = 31`, offset `0`)

Rode `007_mensalidade_vencimento.sql` no SQL Editor. Em Clientes dá para filtrar pelo método (PIX, dinheiro, cartão, mensalidade).

## Operação do salão (fase G)

Rode `009_phase_g_ops.sql` e faça o deploy da função `push-dispatch` de novo. Inclui:

- WhatsApp na cobrança de mensalidade e push no dia do vencimento
- Confirmar/recusar pedido público com mensagem; falta/cancelamento com motivo
- Sugerir retorno em 15/21/30 dias
- Lista de espera no agendamento público
- Comissão e login da profissional (Equipe → botão Login)
- Onboarding de 2 minutos após o convite
- Admin: ativas, trials da semana, quem não abriu o app em 7 dias
- CSV das clientes em Configurações (LGPD)

## Admin vs plano Pro

Assinar o **Pro** não abre `/admin`. Admin é só a conta com `is_admin` (a dona do SaaS). A manicure Pro usa Agenda, Estoque, Fidelidade, Equipe etc.

Se a única conta admin for bloqueada, use o **código de liberação** em Configurações (ou na tela de conta bloqueada). Defina o código no SQL:

```sql
UPDATE app_settings SET value = 'seu-codigo-secreto' WHERE key = 'admin_unlock_code';
```

Rode `010_admin_unlock_code.sql` e `011_admin_unlock_bypass.sql` antes. O padrão do arquivo é `troque-este-codigo-admin` — mude isso.

## Recuperação de senha

O e-mail de reset usa o endereço do site publicado. Sem isso, o link cai em `localhost`.

1. Vercel: defina `VITE_PUBLIC_APP_URL=https://manicure-manager-ebon.vercel.app` (ou o domínio real) e faça redeploy.
2. Supabase → Authentication → URL Configuration:

- **Site URL:** `https://manicure-manager-ebon.vercel.app` (não use localhost)
- **Redirect URLs:**
  - `https://manicure-manager-ebon.vercel.app/redefinir-senha`
  - `https://manicure-manager-ebon.vercel.app/**`
  - `http://localhost:5173/redefinir-senha` (só para testar no computador)

Peça um **novo** e-mail de recuperação depois de salvar. Links antigos continuam apontando para localhost.

### Visual do e-mail

O HTML do reset **não** vai no código do site. No Supabase → **Authentication** → **Email Templates** → **Reset password**, cole o arquivo `supabase/templates/recovery.html`. Deixe o assunto algo como: `Sua nova senha · Agenda Manicure`. O botão usa `{{ .ConfirmationURL }}`.

## Deploy

```bash
npm run build
```

Configure todas as variáveis `VITE_*` no host (Vercel, Netlify, etc.).

## PWA

Instalável no celular. Ícone em `public/carla-icon.svg`.
