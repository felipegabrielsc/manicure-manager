# Instalação, ambientes e deploy

Referência: commit `4f7498e`. Nenhum valor de secret é repetido aqui. Use `.env.example` como lista de nomes.

## Pré-requisitos

- Node.js 20, que é o do CI (`.github/workflows/ci.yml`). O README ainda diz 18+. Os dois podem instalar. O CI é a referência do que roda no GitHub.
- npm, com `package-lock.json`.
- Conta Supabase para o ambiente em que você vai gravar.
- Supabase CLI só para deploy de Edge Function. O front sobe sem o CLI.
- Vercel, se for publicar o site.

## Instalação

```bash
npm ci
```

`npm install` também funciona. O CI usa `npm ci`.

Copie `.env.example` para `.env`. Preencha:

| Variável | Onde vale | Segredo |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | browser | não. É a URL do projeto |
| `VITE_SUPABASE_ANON_KEY` | browser | chave pública do projeto. Não é a service role |
| `VITE_PUBLIC_APP_URL` | browser | não |
| `VITE_APP_NAME` | browser | não |
| `VITE_SUPPORT_WHATSAPP` | browser | não é senha. É o telefone de suporte do produto |
| `VITE_MERCADOPAGO_CHECKOUT_URL` | browser | não |
| `VITE_VAPID_PUBLIC_KEY` | browser | só a chave pública |

Não crie `VITE_` para `MP_ACCESS_TOKEN`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `WA_AKG_API_KEY`, `WHATSAPP_WEBHOOK_SECRET` nem service role.

## Local

```bash
npm run dev
```

Sem as duas variáveis do Supabase, o console mostra o erro de `src/supabaseClient.js` e o login não funciona.

`publicAppUrl()` em desenvolvimento usa `window.location.origin`, para o link de senha voltar no Vite.

## Supabase e migrations

Operação perigosa: nunca `supabase db reset` no projeto de produção. Nunca colar uma migration antiga de novo se ela não for idempotente. Várias funções usam `CREATE OR REPLACE`, mas `DROP` de policy e troca de tipo (`020`) não são inócuos.

Ordem: os arquivos em `supabase/migrations` do `001` ao `041`, com as duas `029` na ordem do nome:

1. `029_mp_billing_idempotency.sql`
2. `029_workspace_followup_portfolio.sql`

Site novo: todas, num projeto vazio que já tenha as tabelas base. Essas tabelas base **não são criadas** por estes arquivos. Um Postgres vazio só com Auth não sobe do zero com esta pasta. Pendência: não há script de schema inicial no repositório. Um projeto novo precisa nascer de um backup ou de um SQL anterior que não está aqui.

Site já no ar: não reaplicar do `001`. Aplicar só o que falta, em ordem, com backup antes. A `040` cria tabelas e triggers de dinheiro. A `041` só cria índices.

Backup: painel do Supabase ou `pg_dump`. Restaure em outro projeto. Não restaure por cima da produção para “testar”.

## Edge Functions

Na raiz do repositório, no projeto certo:

```bash
supabase functions deploy mp-create-preference
supabase functions deploy mp-webhook
supabase functions deploy notification-dispatch
supabase functions deploy push-dispatch
supabase functions deploy whatsapp-connect
supabase functions deploy whatsapp-webhook
```

Secrets, sem valores neste guia:

```bash
supabase secrets set MP_ACCESS_TOKEN=...
supabase secrets set CRON_SECRET=...
supabase secrets set VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set VAPID_SUBJECT=mailto:...
supabase secrets set WA_AKG_URL=...
supabase secrets set WA_AKG_API_KEY=...
supabase secrets set WHATSAPP_WEBHOOK_SECRET=...
```

Publicar a Vercel não publica função. `verify_jwt` está em `supabase/config.toml`.

## Build e Vercel

```bash
npm test
npm run build
npm run preview
```

Na Vercel, o comando de build é `npm run build` e a saída é `dist/`. Configure as `VITE_*` antes do build. Elas entram no bundle. Trocar a URL do Supabase exige novo build.

Domínio: `VITE_PUBLIC_APP_URL` e a URL de redirect do Auth no painel do Supabase precisam ser a origem real, inclusive `/redefinir-senha`.

Webhook do Mercado Pago: `https://<ref>.supabase.co/functions/v1/mp-webhook`, eventos de pagamento.

Cron: agendar no painel das funções, com o header `x-cron-secret`. O repositório não versiona esse agendamento.

## Ambientes

| Ambiente | Front | Banco | Função |
| --- | --- | --- | --- |
| Desenvolvimento | `npm run dev` | projeto de teste | opcional |
| Homologação | preview da Vercel | outro projeto Supabase | deploy nesse projeto |
| Produção | domínio principal | projeto de produção | deploy só depois do SQL e do backup |

Não misture a anon key de produção no `.env` da máquina se o teste grava cliente ou pagamento.

## Rollback

- Front: promova o deployment anterior na Vercel. Não há migration automática no deploy do site.
- Função: `supabase functions deploy` da revisão anterior, se ela ainda existir no git. Não há comando de rollback neste repo.
- SQL: não há down migration. Rollback de `040` seria dropar tabelas de dinheiro. Isso apaga recebimento. Não faça isso para desfazer um deploy de front. Se o front novo quebrou e o SQL novo já rodou, volte o front e mantenha o SQL se ele for compatível. O front atual trata RPC ausente. O contrário, SQL novo com front velho, precisa ser lido caso a caso. A `004` com front antigo quebra a agenda pública. O README registra isso.

## O que não fazer em produção

- `supabase db reset`
- `UPDATE` em massa de `profiles.is_admin` sem saber o id
- Reaplicar a `020` (troca o tipo de `service_id`)
- Colar secret em issue, log ou variável `VITE_`
- Rodar `bootstrap_primeiro_admin` se já existe admin
- Apagar `financial_payments` para “limpar teste”
