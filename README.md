# Agenda Manicure

Sistema de gestão para manicures: agenda, clientes, serviços, financeiro, agendamento público e painel admin.

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
```

**Importante (004):** essa migration fecha o acesso anônimo direto às tabelas (`appointments`, `clients`, `profiles`, etc.) e passa o agendamento público para funções RPC. Rode o SQL **antes** (ou junto) do deploy do front. Sem a 004, a agenda pública deixa de funcionar. Com a 004 e o front antigo, também quebra — os dois precisam ir juntos.

5. Inicie o projeto:

```bash
npm run dev
```

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run preview` | Preview do build |
| `npm run lint` | ESLint |
| `npm test` | Testes (horários, plano, datas) |

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

**Trava de plano:** teste 14 dias (Agenda, Clientes, Serviços, Financeiro). Estoque, Fidelidade e Equipe exigem o plano **Pro**. Teste/assinatura vencidos mandam para `/planos`.

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

6. No celular: instale o PWA e ative em **Configurações → Notificações Push**

A agenda mostra o nome da profissional e deixa filtrar. Duas profissionais podem ocupar o mesmo horário; conflito só na mesma pessoa (ou se o horário não tiver profissional).

## Mensalidade

Visita marcada como **Mensalidade** na Agenda **não entra no caixa** na hora. O valor aparece em **Financeiro → Mensalidades a receber** no mês do vencimento.

Padrões no cadastro da cliente:

- **Dia 10 do mês seguinte** (`monthly_due_offset = 1`)
- **Último dia do mês dos serviços** (`monthly_due_day = 31`, offset `0`)

Rode `007_mensalidade_vencimento.sql` no SQL Editor. Em Clientes dá para filtrar pelo método (PIX, dinheiro, cartão, mensalidade).

## Recuperação de senha

Supabase → Authentication → URL Configuration:

- **Site URL:** `http://localhost:5173`
- **Redirect URLs:** `/redefinir-senha`

## Deploy

```bash
npm run build
```

Configure todas as variáveis `VITE_*` no host (Vercel, Netlify, etc.).

## PWA

Instalável no celular. Ícone em `public/carla-icon.svg`.
