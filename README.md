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

## Mercado Pago

1. Crie links de assinatura no Mercado Pago
2. Atualize `checkout_url` na tabela `subscription_plans` no Supabase
3. Ou defina `VITE_MERCADOPAGO_CHECKOUT_URL` no `.env` como fallback

## Segurança da agenda pública (fase D)

O visitante anônimo **não** lê nem grava `appointments` / `clients` direto. O site chama:

- `get_agenda_publica` — horários ocupados sem dados da cliente
- `get_perfil_publico` — página `/perfil/:id`
- `get_resumo_agendamento` — convite `/resumo/:id` (sem telefone)
- `criar_agendamento_publico` — cria o pedido com trava no banco (evita dois horários iguais ao mesmo tempo)

## Push notifications

1. Gere par de chaves VAPID (ex: `web-push generate-vapid-keys`)
2. Configure `VITE_VAPID_PUBLIC_KEY` no `.env`
3. Ative em **Configurações → Notificações Push**
4. Instale o app como PWA no celular

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
