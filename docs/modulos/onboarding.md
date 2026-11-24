# Onboarding

## A. Objetivo

Na primeira entrada da dona, gravar nome, WhatsApp, expediente e o primeiro serviço, e mostrar o link público.

## B. Arquitetura interna

Página única `src/pages/Onboarding.jsx`, fora do `AppLayout`. `AppLayout` redireciona para `/onboarding` quando `onboarding_done === false` e a conta não é staff nem admin.

## C. Arquivos

`src/pages/Onboarding.jsx`, `src/components/AppLayout.jsx`.

## D. Fluxo

Quatro passos locais, sem gravar a cada Continuar. **Começar a usar** grava nome e WhatsApp no perfil, recria `business_hours` dos sete dias (domingo fechado), insere um serviço se a contagem for zero e **só então** marca `booking_active` e `onboarding_done`. Duração desse serviço: 60. Preço: o número digitado ou 50. Nome sugerido: Pé e mão.

## E. Banco

`profiles`, `business_hours`, `services`.

## F. Regras

Nome vazio: “Informe o nome do salão”. WhatsApp com menos de 10 dígitos: “Informe o WhatsApp”. Sessão ausente: “Sessão expirada”. Profissional não vê a página porque o perfil montado força `onboarding_done: true`.

## G. Dependências

Configurações, serviços, agenda pública. O link mostrado é `{origin}/agendar/{workspace}`.

## H. Segurança

Só a dona autenticada. O update filtra `id = user.id`. A trigger de workspace não troca o id do perfil. Ela troca `user_id` das tabelas de salão.

## I. Erros

Cada write confere `error` e interrompe com toast. `onboarding_done` / `booking_active` só depois de expediente (e serviço, se necessário) ok.

## J. Testes

Nenhum.

## K. Impacto

`booking_active: true` abre a agenda pública no fim deste fluxo, mesmo que a dona ainda não tenha revisado o expediente.
