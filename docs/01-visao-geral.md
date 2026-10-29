# Visão geral

Referência do código: commit `4f7498e` (`4f7498e055aece0d4476a810ff544d83e2e8a6c3`), 29 de outubro de 2026. O banco de produção não foi consultado. O esquema descrito é o que as migrations deste repositório constroem em cima de tabelas que já existiam antes da `001`.

O produto na interface chama-se **Agenda Manicure**. O pacote npm chama-se `manicure-app`. O repositório é `manicure-manager`.

O manual visual para quem usa o salão fica em `docs/manual-usuario/` e não faz parte desta documentação técnica.

## O que o sistema faz

É um painel web para um salão de manicure:

- agenda do dia e da semana, com conclusão e forma de pagamento;
- clientes, serviços, estoque, fidelidade, equipe e configurações;
- financeiro com cobrança, recebimento, estorno, mensalidade e comissão;
- página pública para a cliente pedir horário;
- assinatura do software via Mercado Pago;
- fila de lembretes por WhatsApp e Web Push.

## Tecnologias

| Camada | O que o repositório usa |
| --- | --- |
| Interface | React 19, React Router 7.18.2. O `package.json` pede Vite 7.3.5. O build executado nesta documentação reportou Vite 7.3.1. |
| Estilo | CSS em `src/index.css` e estilos inline nas páginas. Não há Tailwind nem CSS Modules. |
| Estado | `useState` nas páginas. O único contexto é `SessionProfileContext` em `src/context/SessionProfile.jsx`. |
| Backend de dados e auth | Supabase: Postgres, Auth com PKCE, RLS, RPC e Storage de portfólio |
| Funções de servidor | Edge Functions em Deno, em `supabase/functions/` |
| Testes | Vitest 3, sem Testing Library e sem browser |
| Qualidade | ESLint 9. O CI roda o lint com `continue-on-error: true` |
| Publicação do front | Vercel, citada no README e em `VITE_PUBLIC_APP_URL`. Não há `vercel.json` neste repositório |
| PWA | `vite-plugin-pwa` com `src/sw.js` (`injectManifest`) |
| Gráficos | `recharts`, carregado só no financeiro |
| Tutoriais na tela | `driver.js` |

Dependências diretas estão em `package.json`. Há `overrides` de segurança para `vite`, `react-router`, `postcss`, `ws` e outras transitivas.

## Como o código está organizado

```
src/main.jsx                 entra no React
src/App.jsx                  sessão, perfil e rotas
src/pages/                   uma tela por arquivo
src/components/              layout, portões e blocos visuais
src/application/             casos de uso que falam com o Supabase
src/domain/financeiro.js     cálculo financeiro puro, sem I/O
src/utils/                   agenda, planos, datas, mensagens
src/context/                 perfil da sessão
supabase/migrations/         SQL incremental, 001 a 041
supabase/functions/          Mercado Pago, fila, push e WhatsApp
supabase/templates/          e-mail de recuperação de senha
```

Não existe camada HTTP própria. O browser fala com o Supabase usando a chave anon. Operações privilegiadas passam por RPC `SECURITY DEFINER` ou por Edge Function com service role.

## Inventário de módulos

| Módulo | Arquivos principais | Depende de |
| --- | --- | --- |
| Sessão e rotas | `src/main.jsx`, `src/App.jsx`, `src/components/AppLayout.jsx`, `src/components/PlanGate.jsx`, `src/utils/sessionProfile.js`, `src/utils/entitlements.js`, `src/utils/workspace.js` | Auth, `profiles`, `subscription_plans`, `staff_members` |
| Agenda | `src/pages/Agenda.jsx`, `src/pages/NovoAgendamento.jsx`, `src/components/HomeDayStrip.jsx`, `src/application/appointmentService.js`, `src/utils/scheduling.js` | Clientes, serviços, equipe, financeiro, notificações |
| Clientes | `src/pages/Clientes.jsx`, `src/components/ClientDetailSheet.jsx`, `src/utils/clientPortfolio.js`, `src/utils/clientInsights.js` | Fidelidade, mensalidade, pacote |
| Serviços | `src/pages/Servicos.jsx` | Agenda e página pública |
| Financeiro | `src/pages/Financeiro.jsx`, `src/domain/financeiro.js`, `src/application/financeiro*.js`, `src/components/Finance*.jsx`, `src/application/mensalidade.js` | Agenda, clientes, equipe, estoque |
| Estoque | `src/pages/Estoque.jsx` | Financeiro, na venda de produto |
| Fidelidade | `src/pages/Fidelidade.jsx`, `src/utils/loyalty.js` | Conclusão da agenda e cupom no agendamento |
| Equipe | `src/pages/Equipe.jsx` | Agenda, comissão, convite de login |
| Planos | `src/pages/Planos.jsx`, `supabase/functions/mp-*`, `supabase/functions/_shared/mpBilling.js` | `profiles`, `subscription_plans`, `billing_events` |
| Agenda pública | `src/pages/AgendamentoPublico.jsx`, `src/pages/PerfilPublico.jsx`, `src/pages/ResumoAgendamento.jsx` | RPCs `marcar_horario_site`, `get_agenda_publica`, `get_perfil_publico` |
| Administração | `src/pages/Admin.jsx`, `src/components/UnlockAdminForm.jsx` | Convites, `profiles.is_admin` |
| Configurações | `src/pages/Configuracoes.jsx`, `src/pages/Onboarding.jsx` | Perfil, expediente, sinal, push |
| Notificações | `src/application/notificationService.js`, `src/application/notificationPlan.js`, `src/application/dispatchPolicy.js`, `src/utils/notifications.js`, `src/sw.js`, `supabase/functions/notification-dispatch`, `push-dispatch`, `whatsapp-*` | Agenda, WhatsApp, Web Push |
| Assistente de WhatsApp | `src/application/assistant/turn.js`, RPCs `assistente_cancelar` e `assistente_remarcar` | Só entra se `profiles.ai_enabled` e o gateway existirem |

## Páginas e rotas

Definidas em `src/App.jsx`.

Públicas, com ou sem sessão: `/resumo/:id`, `/agendar/:userId`, `/perfil/:userId`, `/cadastro-vip`, `/redefinir-senha`.

Sem sessão: `/` é a landing, `/login`, `/esqueci-senha`. Qualquer outro caminho volta para `/`.

Com sessão: `/` é a Agenda, `/novo`, `/onboarding`, `/clientes`, `/servicos`, `/financeiro`, `/configuracoes`, `/estoque`, `/fidelidade`, `/equipe`, `/planos`, `/admin`. O restante volta para `/`.

`src/pages/Bloqueado.jsx` não é rota. Substitui o roteador inteiro quando `profiles.is_blocked` é verdadeiro.

Agenda, Novo Agendamento, Login, Landing e as páginas públicas são import estático. As outras páginas usam `React.lazy`.

## Responsabilidades compartilhadas

- **Workspace.** `src/utils/workspace.js` e a função SQL `public.workspace_id()` decidem se a linha pertence à dona ou ao salão da profissional. Quase toda tabela de negócio usa `user_id` com esse valor, não com o id da profissional.
- **Conclusão do atendimento.** `appointmentService.concluirAtendimento` grava o status. A RPC `sincronizar_conclusao_atendimento` cria cobrança e comissão. O domínio em `src/domain/financeiro.js` recalcula saldos na tela.
- **Plano.** O menu esconde Estoque, Fidelidade e Equipe. `PlanGate` redireciona. O banco não impede o `select` dessas tabelas se a pessoa autenticada estiver no workspace. A trava de plano é do frontend, fora o bloqueio de conta e o RLS.
- **Datas civis.** `America/Sao_Paulo` em `src/domain/financeiro.js`, `src/utils/dates.js` e `src/application/mensalidade.js`.
- **Dinheiro.** `roundMoney` arredonda em centavos. Há duas implementações: `src/domain/financeiro.js` e `src/application/mensalidade.js`.

## O que não está neste repositório

- O `CREATE TABLE` original de `profiles`, `appointments`, `clients`, `services`, `business_hours` e `transactions`. A `001` só altera essas tabelas.
- Configuração da Vercel além da menção no README.
- O processo do gateway WhatsApp (`WA_AKG_URL`). O código só chama a URL.
- Percentual de cobertura de testes. Não foi medido.
- O estado real do banco em produção. Duas migrations compartilham o prefixo `029`. Se o histórico do Supabase gravou só o número, a segunda pode não ter sido aplicada. Isso está em [Problemas conhecidos](11-problemas-conhecidos.md).

## Documentação anterior

`README.md` descreve operação e está útil, mas a lista de SQL parava na `039`. `040_financeiro_recebimentos.sql` e `041_financeiro_indices.sql` existem. O README também diz que o CI roda em todo push. O arquivo `.github/workflows/ci.yml` dispara em push na `main` e em pull request.

`docs/plano-de-acao.md` é um plano antigo. Não descreve o código atual e não deve ser usado como especificação.
