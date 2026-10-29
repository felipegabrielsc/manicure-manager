# Agenda

## A. Objetivo

Mostrar o dia e a semana, criar horário, concluir, remarcar, registrar falta, cancelar, excluir e aceitar pedido público.

## B. Arquitetura interna

`Agenda.jsx` é a tela. `NovoAgendamento.jsx` é o formulário. Os dois chamam `appointmentService.js`. A validação de slot é pura em `scheduling.js`. O resumo do dia é `HomeDayStrip` mais `salonReports.js`.

## C. Arquivos

| Arquivo | Função |
| --- | --- |
| `src/pages/Agenda.jsx` | Lista, modais de pagamento e de gerenciamento |
| `src/pages/NovoAgendamento.jsx` | Formulário |
| `src/pages/ResumoAgendamento.jsx` | Cartão público `/resumo/:id` |
| `src/application/appointmentService.js` | Casos de uso |
| `src/utils/scheduling.js` | Conflito, duração, semana |
| `src/utils/salonReports.js` | Caixa do dia, próximo horário |
| `src/utils/deposit.js` | Sinal e restante |
| `src/components/HomeDayStrip.jsx` | Faixa Caixa / Na agenda / Próximo |

## D. Fluxo

A tela lê `appointments` do workspace com o cliente e o serviço. O quadradinho chama `concluirAtendimento` ou `reabrirAtendimento`. O nome abre remarcar, falta, cancelar ou excluir. O `+` navega para `/novo`, que valida, insere e volta para `/`.

## E. Banco

`appointments`, `clients`, `services`, `business_hours`, `blocked_slots`, `staff_members`, `coupons`, `followup_reminders`, `waitlist`. RPCs: `validar_horario_agendamento`, `sincronizar_conclusao_atendimento`, `reverter_conclusao_atendimento`.

## F. Regras

Ver [Regras de negócio](../05-regras-de-negocio.md): conflito, sinal, pacote, mensalidade, comissão na conclusão. Métodos de pagamento na UI: `PIX`, `DINHEIRO`, `CARTAO`, `MENSALIDADE`, `PACOTE`, `PENDENTE`.

## G. Dependências

Financeiro, fidelidade, notificações, equipe e configurações (expediente e sinal).

## H. Segurança

RLS por `workspace_id()`. A página de resumo deve usar RPC que não devolve telefone. O README cita `get_resumo_agendamento`. Confirmar a função na migration vigente antes de acrescentar campo.

## I. Erros

Toast com `result.error`. Coluna de sinal ou pacote ausente pede o SQL 039 ou 028. WhatsApp sem telefone: “Cliente sem WhatsApp no cadastro” ou “Sem telefone!”.

## J. Testes

`appointmentService.test.js`, `scheduling.test.js`, `salonReports.test.js`, `deposit.test.js`. Sem teste de render da página.

## K. Impacto

Mudar status ou `payment_method` altera caixa, comissão, fidelidade e fila. Mudar o quadradinho sem passar por `concluirAtendimento` deixa a cobrança órfã. Não selecionar `transactions.staff_id` daqui. A agenda não lê essa coluna.
