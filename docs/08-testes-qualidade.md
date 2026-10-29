# Testes e qualidade

Referência: commit `4f7498e`. Cobertura percentual não foi medida. Não há número de cobertura neste documento.

## Ferramenta e comandos

Vitest 3, configurado pelo padrão do Vite. Não há `vitest.config` separado.

```bash
npm test
npm run lint
npm run build
```

`npm test` é `vitest run`. O CI (`.github/workflows/ci.yml`) executa `npm ci`, `npm test` e `npm run build` em push na `main` e em todo pull request. O lint roda com `continue-on-error: true`. Falha de lint não fica vermelha no GitHub.

Node do CI: 20.

## Arquivos

Testes ficam ao lado do código, com sufixo `.test.js`. Não há pasta `e2e`. Não há Testing Library. Não há teste de RLS com banco.

| Arquivo | O que exercita |
| --- | --- |
| `src/domain/financeiro.test.js` | status, saldo, comissão congelada, indicadores, filtro de profissional |
| `src/application/financeiroLoad.test.js` | janela de datas, colunas de `transactions` sem `staff_id`, consultas paralelas com cliente falso |
| `src/application/mensalidade.test.js` | vencimento e valor da mensalidade |
| `src/application/appointmentService.test.js` | retornos do serviço de agenda com cliente falso |
| `src/utils/scheduling.test.js` | conflito, duração, expediente |
| `src/utils/salonReports.test.js` | caixa do dia |
| `src/utils/deposit.test.js` | sinal e restante |
| `src/utils/entitlements.test.js` | plano vencido, feature, admin |
| `src/utils/sessionProfile.test.js` | staff não vira admin |
| `src/utils/workspace.test.js` | id do workspace |
| `src/utils/mpBilling.test.js` | efeito do pagamento, idempotência, reembolso |
| `src/utils/financeInsights.test.js` | leituras auxiliares do financeiro |
| `src/utils/clientPortfolio.test.js` | carteira de clientes |
| `src/utils/bookingMessages.test.js` | texto de mensagem |
| `src/application/notificationPlan.test.js` | quando tentar de novo |
| `src/application/notificationService.test.js` | montagem da fila no cliente |
| `src/application/dispatchPolicy.test.js` | limite e classificação de envio |
| `src/application/whatsappFormat.test.js` | texto e horário de São Paulo |
| `src/application/assistant/turn.test.js` | turno do assistente |

## O que não tem teste automatizado

- Páginas React.
- RLS e policies.
- RPCs `marcar_horario_site`, `registrar_recebimento`, `sincronizar_conclusao_atendimento`.
- Edge Functions HTTP (webhook, cron).
- Push no browser e service worker.
- Login, convite e onboarding.
- Estoque, fidelidade como página, equipe, admin, configurações.

O financeiro tem a melhor cobertura de regra pura. O agendamento tem cobertura da validação em memória, não do insert. Permissão tem cobertura do objeto de perfil e do `canOpenPath`, não do Postgres. Notificação tem cobertura da política de envio, não do gateway.

## Como acrescentar um teste

1. Crie `nome.test.js` ao lado do módulo.
2. Importe a função pura. Não suba o Vite inteiro.
3. Se precisar do Supabase, passe um objeto falso com os métodos que a função chama, como `financeiroLoad.test.js` já faz.
4. Não conecte em produção e não leia `.env` de verdade.
5. Rode `npm test` antes de terminar.
6. Se a regra for de dinheiro ou de horário, o teste novo fica no arquivo de domínio correspondente, não só num teste de página que não existe.

## Checklist antes de publicar

- [ ] A mudança de comportamento tem teste no módulo puro, ou está escrito por que não dá para testar sem banco.
- [ ] `npm test` passa.
- [ ] `npm run build` passa.
- [ ] `npm run lint` foi lido. O CI não bloqueia, então o aviso não pode ser ignorado se for no arquivo alterado.
- [ ] Nenhuma migration já aplicada foi editada.
- [ ] SQL novo foi aplicado num projeto de teste antes da produção.
- [ ] Variável nova não coloca segredo em `VITE_`.
- [ ] Select de `transactions` continua sem `staff_id`.
- [ ] Conclusão, estorno, comissão ou plano foram conferidos contra `docs/05-regras-de-negocio.md`.
- [ ] A documentação em `docs/` foi atualizada se o comportamento mudou.
- [ ] O manual de usuário em `docs/manual-usuario/` só entra na conversa se a tela visível mudou.

## Resultado desta análise

Os testes e o build foram executados ao fechar esta documentação. O resultado está no final de `docs/README.md`, na seção de validação, para não duplicar um número que pode envelhecer dentro de cada capítulo.
