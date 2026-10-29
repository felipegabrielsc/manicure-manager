# Agentes de IA

Este arquivo orienta quem for alterar o Manicure Manager. A fonte do comportamento é o código. A fonte para não reler o projeto inteiro é `docs/`.

Commit de referência da documentação: `4f7498e`. Se o `HEAD` for outro, leia o diff antes de confiar num parágrafo.

## Antes de editar

1. Leia o documento do mapa abaixo que corresponde à tarefa.
2. Abra os arquivos citados. Se o documento e o código divergirem, o código ganha, e a documentação deve ser corrigida na mesma mudança.
3. Identifique a regra em `docs/05-regras-de-negocio.md`. Comissão, status de cobrança, mensalidade, conflito de horário e plano são as que mais quebram em silêncio.
4. Veja a coluna Dependências do módulo. Conclusão de agenda mexe em financeiro, fidelidade e fila.
5. Preserve o isolamento. `user_id` de dado de salão é o workspace da dona, não o auth id da profissional. Não crie policy com `USING (true)` em tabela de cliente, financeiro ou agendamento.
6. Não edite migration já aplicada. SQL novo é o próximo número livre depois de `041`. Não crie outro arquivo `029`.
7. Não coloque service role, token do Mercado Pago, VAPID privada, `CRON_SECRET` ou chave do WhatsApp em variável `VITE_` nem em markdown.
8. Não peça a coluna `staff_id` em `transactions`.
9. Mudança de comportamento pede teste em `*.test.js` ao lado da função. `npm test` e `npm run build` antes de encerrar. O lint não bloqueia o CI. Ainda assim, não deixe erro novo no arquivo que você tocou.
10. Se a tela que a manicure vê mudou, o manual em `docs/manual-usuario/` fica desatualizado. Diga isso. Não invente captura de tela.
11. Não refatore o que não foi pedido. Não “aproveite” para trocar a fórmula de `roundMoney` ou o momento da comissão.

## Mapa

| Tarefa | Leia primeiro | Código |
| --- | --- | --- |
| Entender o projeto | `docs/01-visao-geral.md`, `docs/02-arquitetura.md` | `src/App.jsx` |
| Banco e RLS | `docs/03-banco-de-dados.md` | `supabase/migrations/` |
| Login, plano, profissional | `docs/04-autenticacao-permissoes.md` | `src/utils/entitlements.js`, `src/utils/sessionProfile.js`, `src/components/PlanGate.jsx` |
| Regra de dinheiro ou agenda | `docs/05-regras-de-negocio.md` | `src/domain/financeiro.js`, `src/application/appointmentService.js` |
| Uma tela | `docs/modulos/` | `src/pages/` |
| Mercado Pago, WhatsApp, push | `docs/06-integracoes.md` | `supabase/functions/` |
| Subir ambiente | `docs/07-instalacao-deploy.md` | `README.md`, `.env.example` |
| Teste | `docs/08-testes-qualidade.md` | `*.test.js` |
| Vazamento ou RLS | `docs/09-seguranca.md` | policies nas migrations |
| Lentidão do financeiro | `docs/10-operacao-manutencao.md` | `src/application/financeiroLoad.js` |
| “Isso é bug?” | `docs/11-problemas-conhecidos.md` | o arquivo citado no item |
| “Por que está assim?” | `docs/12-historico-decisoes.md` | o comentário no código |

`docs/plano-de-acao.md` não é especificação. `docs/manual-usuario/` é o guia da manicure, não o contrato técnico.

## Verificação mínima

- Dinheiro: teste de domínio passa e a `040` não foi editada.
- Agenda: `scheduling.test.js` e `appointmentService.test.js` passam se o slot ou o status mudou.
- Permissão: `entitlements.test.js` e `sessionProfile.test.js` passam se o menu ou o perfil mudou.
- Carga do caixa: `financeiroLoad.test.js` passa.
- Build: `npm run build`.

Se não deu para rodar, diga o comando e o motivo. Não invente que passou.
