# Onboarding

## A. Objetivo

Na primeira entrada da dona, gravar nome, WhatsApp, expediente e o primeiro serviço, e mostrar o link público.

## B. Arquitetura interna

Página única `src/pages/Onboarding.jsx`, fora do `AppLayout`. `AppLayout` redireciona para `/onboarding` quando `onboarding_done === false` e a conta não é staff nem admin.

## C. Arquivos

`src/pages/Onboarding.jsx`, `src/components/AppLayout.jsx`.

## D. Fluxo

Quatro passos locais, sem gravar a cada Continuar. **Começar a usar** atualiza `profiles` (`business_name`, `whatsapp`, `booking_active: true`, `onboarding_done: true`), recria `business_hours` dos sete dias (domingo fechado) e insere um serviço se a contagem for zero. Duração desse serviço: 60. Preço: o número digitado ou 50. Nome sugerido: Pé e mão.

## E. Banco

`profiles`, `business_hours`, `services`.

## F. Regras

Nome vazio: “Informe o nome do salão”. WhatsApp com menos de 10 dígitos: “Informe o WhatsApp”. Sessão ausente: “Sessão expirada”. Profissional não vê a página porque o perfil montado força `onboarding_done: true`.

## G. Dependências

Configurações, serviços, agenda pública. O link mostrado é `{origin}/agendar/{workspace}`.

## H. Segurança

Só a dona autenticada. O update filtra `id = user.id`. A trigger de workspace não troca o id do perfil. Ela troca `user_id` das tabelas de salão.

## I. Erros

Falha de update não tem tratamento além do que o Supabase devolver. O código não checa `error` de cada `update` e `insert` em sequência. Se o expediente falhar, `onboarding_done` pode já ter sido gravado. Ver [Problemas conhecidos](../11-problemas-conhecidos.md).

## J. Testes

Nenhum.

## K. Impacto

`booking_active: true` abre a agenda pública no fim deste fluxo, mesmo que a dona ainda não tenha revisado o expediente.
