# Planos e assinaturas

## A. Objetivo

Mostrar o plano atual e iniciar o pagamento no Mercado Pago.

## B. Arquitetura interna

`src/pages/Planos.jsx` lista `subscription_plans` e chama a Edge Function `mp-create-preference`. O webhook `mp-webhook` grava o efeito. `PlanGate` e `entitlements.js` decidem o que a tela abre. `src/utils/mpBilling.test.js` importa `billingAction`, `computeExpiryIso`, `planPeriodDays`, `reduceBillingEvent`, `replayNotifications` e `resolvePayer` de `supabase/functions/_shared/mpBilling.js`.

## C. Arquivos

`src/pages/Planos.jsx`, `src/utils/entitlements.js`, `src/components/PlanGate.jsx`, `src/components/UnlockAdminForm.jsx`, `supabase/functions/mp-create-preference/index.ts`, `supabase/functions/mp-webhook/index.ts`, `supabase/functions/_shared/mpBilling.js`.

## D. Fluxo

A dona toca em Assinar. A função, com JWT, cria a preferência e devolve a URL. O Mercado Pago chama o webhook. A função busca o pagamento na API, grava `billing_events` e atualiza `profiles`. Até confirmar, `isSubscriptionUsable` pode continuar verdadeiro por causa do trial.

## E. Banco

`subscription_plans`, `profiles.plan_id`, `subscription_status`, `subscription_expires_at`, `trial_ends_at`, `billing_events`. Trial de 14 dias na `005`. Preços e galeria na `027`. Plano anual na `028`. Idempotência na `029_mp_billing_idempotency.sql`.

## F. Regras

Features do plano básico no código, quando o plano não traz lista: Agenda, Clientes, Financeiro. Estoque, Fidelidade e Equipe só se o nome estiver em `features`. Admin ignora feature. Plano vencido manda para `/planos`, mas Configurações e Planos seguem acessíveis. O bloco de convite de admin na página não compra o Pro.

## G. Dependências

Todas as telas passam por `PlanGate`. O menu em `AppLayout.jsx` esconde o item sem feature.

## H. Segurança

`mp-create-preference` exige JWT (`verify_jwt = true`). O webhook não exige JWT do Supabase. Exige conseguir ler o pagamento com `MP_ACCESS_TOKEN`. Não gravar esse token no front. `VITE_MERCADOPAGO_CHECKOUT_URL` é só o link de reserva.

## I. Erros

Botão fica em “Abrindo Mercado Pago...”. Sem a função, o README diz que cai no checkout fixo e o plano não ativa. Webhook com API indisponível responde 503.

## J. Testes

`entitlements.test.js`, `mpBilling.test.js`. Sem teste do webhook HTTP.

## K. Impacto

Incluir um caminho novo em `FEATURE_BY_PATH` sem colocar o nome no plano fecha a tela para todo mundo. Mudar `isSubscriptionUsable` tranca ou abre o salão inteiro.
