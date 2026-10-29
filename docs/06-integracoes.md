# Integrações externas

Referência: commit `4f7498e`. Nenhum secret real entra neste texto. Os nomes são os que o código lê.

## Supabase

1. Finalidade: Auth, Postgres, Storage, RPC e hospedagem das Edge Functions.
2. Arquivos: `src/supabaseClient.js`, `supabase/migrations/`, `supabase/functions/`, `supabase/config.toml`.
3. Configuração: projeto no Supabase e SQL aplicado na ordem dos arquivos.
4. Variáveis do front: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Nas funções: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, injetadas pela plataforma.
5. Fluxo: o browser usa PostgREST e Auth. A função privilegiada cria um cliente com service role.
6. Segurança: a chave anon é pública. A service role só vive na função. RLS no restante.
7. Erros: mensagem do PostgREST no toast ou no estado da página.
8. Indisponibilidade: a tela fica em carregamento ou mostra o erro. Não há fila local de escrita.
9. Idempotência: não é do cliente Supabase. Cada RPC que precisa define a própria chave.
10. Diagnóstico: aba Network, código HTTP, corpo do PostgREST. SQL Editor para ver se a função existe (`schema cache` / `PGRST202` significa RPC ausente).
11. Teste seguro: projeto Supabase separado. Não apontar o `.env` local para produção se for gravar.

O `config.toml` tem `project_id = "manicure-manager"`. O README cita outro identificador de projeto hospedado na seção de WhatsApp. São nomes de ambientes diferentes. Confirmar qual projeto recebe o `supabase functions deploy` antes de publicar. Pendência de validação: o identificador remoto não foi checado nesta análise.

## Vercel

1. Finalidade: hospedar o build estático do Vite.
2. Arquivos: não há `vercel.json`. O build é `npm run build`. A URL pública de exemplo está em `.env.example` como `VITE_PUBLIC_APP_URL`.
3. Configuração: variáveis `VITE_*` no painel da Vercel. O SQL não sobe com o front.
4. Variáveis: as mesmas do `.env.example`, sem a service role e sem `MP_ACCESS_TOKEN`.
5. Fluxo: push do Git gera o site. O browser fala direto com o Supabase.
6. Segurança: preview e produção precisam de projetos Supabase diferentes se forem gravar dados.
7. Erros: build falho aparece no CI e no log da Vercel. O CI não faz deploy.
8. Indisponibilidade: o site não abre. Os dados continuam no Supabase.
9. Idempotência: não se aplica ao hosting.
10. Diagnóstico: log de build e a lista de env vars. Conferir se `VITE_PUBLIC_APP_URL` é a origem usada no e-mail de senha.
11. Teste: `npm run preview` depois do build, com `.env` de homologação.

## Mercado Pago

1. Finalidade: cobrar a assinatura do software, não o atendimento da cliente.
2. Arquivos: `supabase/functions/mp-create-preference/index.ts`, `supabase/functions/mp-webhook/index.ts`, `supabase/functions/_shared/mpBilling.js`, `src/pages/Planos.jsx`.
3. Configuração: deploy das duas funções, webhook de pagamento apontando para `/functions/v1/mp-webhook`, secret `MP_ACCESS_TOKEN`.
4. Variáveis: `MP_ACCESS_TOKEN` só na função. `VITE_MERCADOPAGO_CHECKOUT_URL` no front, link de reserva.
5. Fluxo: JWT cria a preferência. O webhook recebe o aviso, busca `GET https://api.mercadopago.com/v1/payments/:id` e aplica o efeito.
6. Segurança: o corpo do webhook não é a fonte do status. A API oficial é. `verify_jwt` do webhook é false.
7. Erros: API com status diferente de 404 e de sucesso pede retry. 404 é pagamento ausente.
8. Indisponibilidade: resposta 503 para o Mercado Pago tentar de novo.
9. Idempotência: `billing_events` por `mp_payment_id`. Pagamento duplicado ou `pending` seguido de `approved` não estende duas vezes. Reembolso só cancela se for o último efeito ativo. Testes em `src/utils/mpBilling.test.js`.
10. Diagnóstico: linha em `billing_events` e log da função. Não logar o token.
11. Teste: usuário e plano de homologação, pagamento de teste do Mercado Pago. Não usar o access token de produção no projeto de teste.

## WhatsApp

Há dois caminhos.

**Manual.** `src/utils/whatsapp.js` abre `https://wa.me/{número}`. Não usa secret. O número de suporte do produto está em `VITE_SUPPORT_WHATSAPP`, com fallback em `src/config/app.js`. Não copiar o número para documento novo. É o contato do produto, não o da cliente.

**Fila.** `notification-dispatch` usa `createWhatsAppProvider` (`supabase/functions/_shared/whatsapp/provider.ts`).

1. Finalidade: enviar confirmação e lembrete sem abrir o celular da manicure.
2. Arquivos: `whatsapp-connect`, `whatsapp-webhook`, `notification-dispatch`, `provider.ts`.
3. Configuração: secrets `WA_AKG_URL`, `WA_AKG_API_KEY`, `WHATSAPP_WEBHOOK_SECRET`. Deploy com CLI. O README avisa que a Vercel não cria função.
4. Variáveis: as três acima, mais `CRON_SECRET`. Nenhuma com prefixo `VITE_`.
5. Fluxo: conectar grava `whatsapp_connections`. O cron lê a fila e posta no gateway. Mensagem que entra chega no webhook e pode passar por `assistant/turn.js` se `ai_enabled`.
6. Segurança: webhook confere o secret. A função de conectar valida o JWT no código, apesar de `verify_jwt = false`, para o preflight CORS. Ler `whatsapp-connect/index.ts` antes de mudar essa combinação.
7. Erros: `no_connection` mantém `pending`. Falha classificada por `classifySendResult`.
8. Indisponibilidade: a agenda funciona. O automático não sai. A manicure usa o botão verde.
9. Retentativa: `retryAfterFailure` e `claim_due_notifications`. Item `sending` parado volta a `pending` depois de `STUCK_SENDING_MS`.
10. Diagnóstico: Configurações, fila parada, `notification_attempts`, `admin_fila_saude`.
11. Teste: número e gateway de homologação. Não conectar o WhatsApp de produção num projeto de teste.

## Web Push

1. Finalidade: aviso no celular onde o PWA foi instalado.
2. Arquivos: `src/utils/notifications.js`, `src/sw.js`, `vite.config.js`, `push-dispatch`, e também o ramo de push dentro de `notification-dispatch`.
3. Configuração: par VAPID. Pública no front. Privada só na função.
4. Variáveis: `VITE_VAPID_PUBLIC_KEY`. Secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
5. Fluxo: a dona ativa em Configurações. O browser grava endpoint em `push_subscriptions`. O cron envia com `web-push`.
6. Segurança: a chave privada não entra no bundle. Conferir o build se alguém colocar a privada em `VITE_`.
7. Erros: subscription inválida deve ser removida pelo worker. Ver o tratamento no `notification-dispatch` antes de afirmar que apaga. Pendência: não foi feita uma leitura linha a linha do delete de endpoint expirado nesta passagem. O arquivo é `supabase/functions/notification-dispatch/index.ts`.
8. Indisponibilidade: o lembrete de WhatsApp não depende do push.
9. Idempotência: o README diz que o `push-dispatch` novo não repete item já colocado na fila da `030`. Os dois crons juntos são um risco operacional se os dois enviarem o mesmo tipo.
10. Diagnóstico: `push_enabled` no perfil, linha em `push_subscriptions`, log da função.
11. Teste: aparelho de teste, permissão concedida, cron de homologação.

## Tarefas agendadas

Não há cron no repositório além da instrução do README: agendar no painel do Supabase.

- `notification-dispatch` com header `x-cron-secret`, a cada minuto, segundo o README.
- `push-dispatch` a cada 5 minutos, também segundo o README.

O código não declara o schedule. Se o painel não tiver o job, nada é enviado. Pendência: o schedule real do projeto hospedado não foi lido.

## Webhooks

| Destino | Quem chama | Prova |
| --- | --- | --- |
| `mp-webhook` | Mercado Pago | consulta o pagamento na API |
| `whatsapp-webhook` | gateway | `WHATSAPP_WEBHOOK_SECRET` |

Não há outro webhook no código.
