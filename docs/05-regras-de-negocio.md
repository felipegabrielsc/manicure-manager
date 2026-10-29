# Regras de negócio

Referência: commit `4f7498e`. Cada regra abaixo está no código citado. Onde a tela e o SQL podem divergir, isso está dito na própria regra. Inconsistências que não foram “corrigidas” no texto estão em [Problemas conhecidos](11-problemas-conhecidos.md).

Datas de caixa e competência usam o dia civil em `America/Sao_Paulo` (`civilDate` em `src/domain/financeiro.js`). Dinheiro é arredondado ao centavo: `roundMoney` faz `Math.round((abs(n) + 1e-8) * 100) / 100` e devolve o sinal.

## Agenda e horários

### Criar agendamento interno

1. Nome: criar horário pelo painel.
2. Objetivo: gravar um atendimento com cliente, serviço, preço e hora.
3. Condições: cliente, serviço e hora preenchidos. `validateBookingSlot` aceita o intervalo.
4. Dados: `appointments` (`status = AGENDADO`, `agreed_price`, `user_id` do workspace, profissional, unidade, cupom, desconto). Sinal em `deposit_amount` se `computeDeposit` for maior que zero.
5. Arquivos: `src/application/appointmentService.js` (`criarAgendamento`), `src/pages/NovoAgendamento.jsx`, `src/utils/scheduling.js`.
6. Comportamento: valida no browser, chama `validar_horario_agendamento` e, se a RPC recusar, não grava. Se a RPC falhar por assinatura antiga, tenta de novo sem `p_staff_id`. Se a coluna de sinal não existir, grava sem ela. Incrementa `coupons.uses_count` no cliente, sem transação única com o insert. Enfileira notificação se a `030` existir.
7. Exceções: mensalista mostra preço isento na tela. O preço gravado segue o que a página mandou.
8. Dependências: expediente, bloqueios, serviços, clientes, notificações.
9. Testes: `src/utils/scheduling.test.js`, `src/application/appointmentService.test.js`.
10. Risco: mudar a validação só no JS deixa o insert direto passar. O incremento do cupom pode contar uso mesmo se um passo seguinte falhar.

### Conflito de horário

1. Nome: horário ocupado.
2. Objetivo: impedir dois atendimentos no mesmo intervalo.
3. Condições: status `AGENDADO`, `PENDENTE` ou `CONCLUIDO`. Falta e cancelamento não ocupam.
4. Dados: início, duração do serviço (padrão 60), expediente, intervalo de almoço, `blocked_slots`, `staff_id`.
5. Arquivos: `src/utils/scheduling.js` (`staffSlotsConflict`, `overlaps`), SQL `validar_horario_agendamento` (última versão na cadeia `001` → `016` → `017` → `021` → `022`).
6. Comportamento no JS: se os dois horários têm profissional e são profissionais diferentes, não há conflito. Se um dos dois não tem profissional, há conflito. Também recusa dia fechado, fora do expediente e intervalo de almoço.
7. Exceção: a RPC antiga da `001` não recebia `staff_id` e tratava o salão inteiro como uma cadeira. O front ignora a RPC se ela estiver ausente, e obedece se ela devolver `valid: false`.
8. Dependências: equipe e configurações.
9. Testes: `scheduling.test.js`.
10. Risco: JS e SQL divergentes geram horário que a agenda pública recusa, ou o contrário.

### Remarcar, faltar, cancelar, excluir

1. Nome: mudar o estado do horário.
2. Objetivo: atualizar data ou encerrar sem recebimento.
3. Condições: o horário existe no workspace.
4. Dados: `start_time`, `staff_id`, `status` `FALTOU` ou `CANCELADO`, `cancellation_reason`, ou delete.
5. Arquivos: `remarcar`, `marcarAusencia`, `excluirAgendamento` em `appointmentService.js`. A tela está em `src/pages/Agenda.jsx`.
6. Comportamento: remarcar valida de novo e sincroniza a fila. Falta e cancelamento gravam o motivo. Recusar pedido público grava `CANCELADO` com motivo `Recusado` se o texto vier vazio, e chama `enqueueWaitlistAvailable`. Excluir apaga a linha. O quadradinho da Agenda não conclui falta nem cancelamento.
7. Exceção: reabrir um concluído passa por `reverter_conclusao_atendimento` antes de voltar o status para `AGENDADO`. Se a RPC existir e falhar, o status não muda.
8. Dependências: financeiro `040`, fila, lista de espera.
9. Testes: `appointmentService.test.js` cobre parte dos retornos. Não há teste de ponta a ponta com Postgres.
10. Risco: exclusão com cobrança já gerada depende do `ON DELETE CASCADE` da `040` em `financial_charges.appointment_id`. Sem a `040`, só some o horário.

### Pedido da página pública

1. Nome: pedir horário no link.
2. Objetivo: a cliente criar um `PENDENTE` ou, se `auto_confirm_public`, um confirmado.
3. Condições: `profiles.booking_active` diferente de falso. Nome, WhatsApp, serviço e hora. `limite_pedido_publico` aceita o telefone.
4. Dados: RPC `marcar_horario_site` na `036`. Lock de transação `pg_advisory_xact_lock(hashtext(salão))`.
5. Arquivos: `src/pages/AgendamentoPublico.jsx`, migration `036`.
6. Comportamento: agenda fechada devolve `Agenda fechada`. Horário conflitante não grava. Sucesso devolve pedido pendente ou confirmado. A Agenda mostra `PENDENTE` como solicitação, com Aceitar e Recusar.
7. Exceção: versões antigas (`023_marcar_horario_sem_validar.sql`) existiram. A definição que vale é a última aplicada. Se a `036` não rodou, o comportamento antigo permanece.
8. Dependências: serviços, expediente, cupom, sinal PIX da `039`.
9. Testes: não há teste de integração da RPC.
10. Risco: aplicar só o front ou só o SQL quebra o link. O README da fase D já avisava isso para a `004`.

### Sinal PIX

1. Nome: sinal no agendamento.
2. Objetivo: reservar um valor antes do atendimento.
3. Condições: `deposit_mode` `percent` ou `fixed`. `off` ou outro valor devolve 0.
4. Dados: `computeDeposit(preço, modo, valor)` em `src/utils/deposit.js`. Teto é o preço. Não passa de 100% do preço no modo percentual porque usa `min(total, total * raw / 100)`.
5. Arquivos: `deposit.js`, `appointmentService.marcarSinalPago`, `Agenda.jsx`, `039`.
6. Comportamento: status `pending`, `paid` ou `applied`. Na conclusão, `paid` vira `applied`. `remainingDue` desconta o sinal só se o status for `paid` ou `applied`.
7. Exceção: sem a `039`, o insert é refeito sem as colunas e a tela pede o SQL.
8. Dependências: configurações e agenda pública, que mostra a chave PIX em texto. Não gera cobrança PIX no Mercado Pago.
9. Testes: `src/utils/deposit.test.js`.
10. Risco: a chave PIX fica em `profiles.pix_key` e é devolvida no perfil/agenda pública. Não é um segredo de API, mas é dado de pagamento.

## Clientes, serviços e pacote

### Cliente avulsa, mensalista e pacote

1. Nome: tipo de cliente.
2. Objetivo: definir como a visita será cobrada.
3. Condições: nome e WhatsApp obrigatórios na ficha.
4. Dados: `clients.type` `AVULSO` ou `MENSALISTA`, `monthly_fee`, `monthly_due_day`, `monthly_due_offset`, `package_size` 0, 4 ou 6, `package_used`.
5. Arquivos: `src/pages/Clientes.jsx`, migration `007` e `028`.
6. Comportamento: mensalista sem valor fixo faz a soma dos serviços cair na mensalidade (`mensalidade.js`). Pacote só desconta visita se a conclusão usar o método `PACOTE` e `package_used < package_size`.
7. Exceção: concluir com `MENSALIDADE` força `type = MENSALISTA` e, se dia ou offset estiverem nulos, grava dia 10 e offset 1.
8. Dependências: agenda e financeiro.
9. Testes: `src/application/mensalidade.test.js`. O pacote está no serviço de agendamento. Conferir o teste antes de mudar a frase de erro.
10. Risco: reabrir atendimento de pacote decrementa `package_used`, com limite em zero.

### Serviço

1. Nome: preço e duração padrão.
2. Objetivo: alimentar horários novos e a página pública.
3. Condições: nome, preço e uma das durações 30, 45, 60, 90 ou 120. Retorno vazio ou 15, 21, 30.
4. Dados: `services`.
5. Arquivos: `src/pages/Servicos.jsx`.
6. Comportamento: o horário copia o preço para `agreed_price` na criação. Alterar o serviço não regrava horários.
7. Exceção: duração ausente vira 60 (`getServiceDuration`).
8. Dependências: slots e retorno automático.
9. Testes: indiretos em `scheduling.test.js`. Não há teste da página.
10. Risco: duração errada muda a lotação de todo o dia.

## Financeiro

### Status da cobrança

1. Nome: status financeiro.
2. Objetivo: dizer se o valor está em aberto, parcial, pago, estornado ou cancelado.
3. Condições: cancelado ganha de qualquer pagamento.
4. Dados: `originalAmount`, `discountAmount`, lista de pagamentos com `entryType`.
5. Arquivo: `statusFinanceiro` em `src/domain/financeiro.js`. A `040` recalcula no banco em `recalcular_status_cobranca`.
6. Fórmula da tela: líquido = max(0, original − desconto). Líquido recebido = recebimentos − estornos. Se houve estorno, o líquido recebido é ≤ 0 e já tinha entrado dinheiro, o status é `ESTORNADO`. Se o líquido recebido é ≤ 0, `PENDENTE`. Se é menor que o líquido da cobrança, `PARCIAL`. Senão `PAGO`.
7. Exceção: `countsAsRevenue === false` fica com líquido 0 e status `PAGO`, ou `CANCELADO` se a cobrança foi cancelada. Usado para o que não deve entrar no faturamento.
8. Dependências: todos os indicadores.
9. Testes: `src/domain/financeiro.test.js`.
10. Risco: alterar a ordem dos `if` muda estorno e pendência. A função SQL precisa ser lida junto. Elas não são o mesmo arquivo.

### Comissão

1. Nome: comissão na conclusão.
2. Objetivo: congelar percentual e valor no dia do atendimento.
3. Condições: constante `REGRA_COMISSAO = 'CONCLUSAO'`. Há profissional e percentual.
4. Dados: `snapshotComissao`. `amountDue = roundMoney(base * (percent / 100))`.
5. Arquivos: `src/domain/financeiro.js`, trigger `protect_commission_snapshot` e `_aplicar_conclusao` na `040`.
6. Comportamento: comissão histórica não é recalculada se o percentual da profissional mudar (`comissaoDevida`). Mensalidade e pacote não geram essa comissão no fluxo da conclusão. O comentário do domínio e o de `_aplicar_conclusao` são a fonte. A tela da Agenda não mostra comissão.
7. Exceção: profissional sem comissão gravada e sem percentual atual não deve inventar valor. `comissaoDevida` sem histórico usa o percentual atual só como estimativa de algo ainda não gravado.
8. Dependências: equipe e financeiro, aba Comissões.
9. Testes: `financeiro.test.js`.
10. Risco: pagar comissão por recebimento, em vez de por conclusão, contradiz `REGRA_COMISSAO` e a trigger.

### Recebimento, parcial e estorno

1. Nome: registrar e estornar dinheiro.
2. Objetivo: entrar caixa sem reescrever o mês de competência.
3. Condições: cobrança existente. Idempotência por `user_id` + `idempotency_key`. Estorno é outra linha `ESTORNO`, com `reversal_of` único.
4. Dados: `financial_payments`, `transactions` vinculadas.
5. Arquivos: RPCs `registrar_recebimento` e `estornar_recebimento`. Tela em `src/pages/Financeiro.jsx`. Espelho puro: `aplicarRecebimento` e `estornarRecebimento`.
6. Comportamento: parcial deixa `PARCIAL` enquanto o pendente for maior que zero. Estorno no mês corrente reduz `recebimentos` daquele mês e também reduz `faturamento` se a competência da cobrança for de outro critério — ver o laço de estorno em `indicadoresFinanceiros`: o estorno subtrai do faturamento quando cai no período do caixa, não só no da competência.
7. Exceção: sem a `040`, o financeiro deriva o livro das transações antigas e avisa que parcial, estorno e comissão histórica não ficam gravados.
8. Dependências: agenda, quando a conclusão chama a sincronização.
9. Testes: domínio e `financeiroLoad.test.js`. Não há teste contra o SQL.
10. Risco: duas fórmulas, JS e SQL. Mudar uma só deixa a tela e o banco em estados diferentes até o próximo carregamento.

### Indicadores

Definidos em `indicadoresFinanceiros`:

- Faturamento: soma do líquido das cobranças cuja `competenceDate` está no período, menos estornos cujo `cashDate` está no período.
- Recebimentos: soma dos pagamentos do período, com estorno negativo.
- Contas a receber: pendente das cobranças com competência ou vencimento no período.
- Despesas pagas: despesas do período, exceto categoria `estorno`.
- Resultado de caixa: recebimentos − despesas pagas.
- Resultado operacional: faturamento − despesas operacionais − comissões reconhecidas no período.
- Contas a pagar: comissões `PENDENTE` reconhecidas no período.

`filtrarVisaoFinanceira` zera despesas da profissional e limita cobranças e comissões ao `staffId`.

Caixa do dia na Agenda (`src/utils/salonReports.js`, métodos em `METODOS_CAIXA`): só `PIX`, `DINHEIRO`, `CARTAO` e `OUTRO`. Mensalidade, pacote e pendente ficam de fora.

### Mensalidade

1. Nome: cobrança no vencimento.
2. Objetivo: não lançar caixa no dia da visita.
3. Condições: `payment_method = MENSALIDADE` ou cliente `MENSALISTA`.
4. Dados: `monthlyDueDate(ano, mês do serviço, dia, offset)` em `src/utils/dates.js`. Offset 1 é o mês seguinte. Dia 31 estoura para o último dia do mês alvo, conforme a função. Ler `dates.js` antes de mudar.
5. Arquivos: `src/application/mensalidade.js`, aba Mensalidades do financeiro, `_aplicar_conclusao` para a cobrança `MENSALIDADE`.
6. Valor: `monthly_fee` se for maior que zero. Senão, soma de `agreed_price` das visitas daquele vencimento.
7. Exceção: `ehPagamentoMensalidade` trata categoria `mensalidade` ou descrição que começa com “mensalidade”.
8. Dependências: ficha da cliente.
9. Testes: `mensalidade.test.js`.
10. Risco: a derivação antiga e a cobrança da `040` podem mostrar a mesma mensalidade duas vezes se a sincronização não vincular a transação. `sincronizar_financeiro_existente` existe para isso. Falha dela mostra aviso na tela.

### Despesa e venda de produto

1. Nome: lançamento manual.
2. Objetivo: registrar gasto, receita extra ou baixa de estoque.
3. Condições: só a dona vê o botão. Profissional não.
4. Dados: `transactions` com `type`, `category`, `amount`, `date`, `description`, `payment_method`, e na venda `inventory_item_id` e `quantity`.
5. Arquivos: `src/pages/Financeiro.jsx`, `src/application/financeiroService.js`.
6. Comportamento: a consulta pede as colunas em `COLUNAS.transacao` dentro de `financeiroLoad.js`. Sem `staff_id`.
7. Exceção: venda de produto depende da lista de estoque, que é carga secundária.
8. Dependências: estoque.
9. Testes: `financeiroLoad.test.js` (“não pede staff_id”).
10. Risco: incluir coluna inexistente derruba a lista inteira com 400 e o aviso de despesas.

## Fidelidade, estoque, planos

### Fidelidade

Na conclusão, `incrementLoyaltyVisit` soma 1 em `loyalty_visits` se `loyalty_settings.active` não for `false`. Ausência de configuração não bloqueia o incremento: o código só retorna cedo quando `active === false`. Prêmio é descritivo. Não há baixa automática de estoque nem de preço.

Cupom: `validar_cupom` no banco. O front mostra desconto e grava `coupon_id` e `discount_applied`.

### Estoque

Quantidade muda em +1 ou −1 na tela, ou na venda do financeiro. Abaixo ou igual a `min_quantity`, a linha mostra estoque baixo. Não gera despesa sozinha.

### Assinatura do software

1. Nome: ativar plano pelo Mercado Pago.
2. Objetivo: gravar `plan_id`, status e validade uma vez por pagamento.
3. Condições: webhook consulta `GET /v1/payments/:id`. Não confia só no corpo do webhook.
4. Dados: `billing_events.mp_payment_id`, `profiles`.
5. Arquivos: `supabase/functions/mp-webhook/index.ts`, `supabase/functions/_shared/mpBilling.js`, `src/utils/mpBilling.test.js`.
6. Comportamento: `approved` estende a validade pelo período do plano. O mesmo `mp_payment_id` não aplica duas vezes. Reembolso ou chargeback cancela se aquele pagamento for o último efeito ativo. API fora do ar responde 503 para o Mercado Pago tentar de novo.
7. Exceção: sem a função, o botão pode cair no `checkout_url` fixo e o plano não ativa sozinho. O README descreve isso.
8. Dependências: `PlanGate`.
9. Testes: `mpBilling.test.js` e `entitlements.test.js`. Sem teste HTTP do webhook.
10. Risco: deploy da função sem a `029` de idempotência.

## Notificações

1. Nome: lembrete e confirmação.
2. Objetivo: avisar antes do horário, sem mandar lembrete de horário que já passou.
3. Condições: `reminders_enabled` e `reminder_hours_before` 12, 24 ou 48. A `035` pula lembrete vencido.
4. Dados: tabela `notifications`. Claim na `038` para dois workers não pegarem a mesma linha.
5. Arquivos: `notificationPlan.js`, `dispatchPolicy.js`, `notification-dispatch/index.ts`.
6. Comportamento: sem gateway, o item fica pendente com `no_connection` e a agenda abre. Reenvio manual da Agenda usa `wa.me` e também marca a fila quando a função existe.
7. Exceção: `ai_enabled` liga o atendimento automático. O checkbox só aparece se a coluna existir. A RPC `assistente_remarcar` grava horário só depois da escolha. O texto da Configurações diz isso.
8. Dependências: WhatsApp e push.
9. Testes: `notificationPlan.test.js`, `dispatchPolicy.test.js`, `notificationService.test.js`, `whatsappFormat.test.js`, `turn.test.js`.
10. Risco: cron sem `CRON_SECRET` não envia. Dois crons, `push-dispatch` e `notification-dispatch`, podem sobrepor se os dois estiverem agendados para o mesmo push. O README diz que o `push-dispatch` redeployado não repete item que já está na fila. Confirmar no código de `push-dispatch` antes de agendar os dois para o mesmo tipo.

## Administração

Admin lista perfis, cria convite de dona, bloqueia conta e atribui plano. Isso está em `src/pages/Admin.jsx`. A promoção por código não funciona depois da `037`. `bootstrap_primeiro_admin` existe para o caso de nenhum admin. Não foi executada nesta análise.

Isolamento de admin: as RPCs de admin checam `current_user_is_admin()` ou equivalente. Ler a função antes de expor uma nova. O browser admin usa a chave anon com o JWT de quem tem `is_admin`.
