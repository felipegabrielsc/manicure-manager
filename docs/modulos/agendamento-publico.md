# Agendamento público

## A. Objetivo

A cliente pede horário sem conta. O salão aceita ou recusa na Agenda.

## B. Arquitetura interna

`AgendamentoPublico.jsx` é o formulário. `PerfilPublico.jsx` é `/perfil/:userId`. `ResumoAgendamento.jsx` é `/resumo/:id`. Nenhuma das três usa `AppLayout`.

## C. Arquivos

As três páginas, `src/utils/bookingMessages.js`, `src/utils/deposit.js` (`pixCopyText`), RPCs nas migrations `016` em diante, versão vigente de `marcar_horario_site` na `036`.

## D. Fluxo

A página chama RPCs para perfil, horários ocupados e o pedido. Não faz `insert` anônimo em `appointments`. O sucesso mostra pedido enviado ou horário confirmado, conforme `auto_confirm_public`. Dia sem vaga oferece `entrar_lista_espera`. Agenda com `booking_active = false` mostra Agenda Fechada.

O salão copia o link em Configurações: `/agendar/` + id do workspace.

## E. Banco

`marcar_horario_site`, `get_agenda_publica`, `get_perfil_publico`, `limite_pedido_publico`, `public_booking_hits`, `waitlist`. A `004` fecha o acesso anônimo direto às tabelas. Front e SQL precisam estar alinhados.

## F. Regras

Lock por salão na transação. Conflito com expediente, almoço, bloqueio e horário ocupado, na função da `036`. Cupom opcional. Sinal PIX é texto com a chave, não um pagamento liquidado. O status inicial padrão no trecho lido é `PENDENTE`, e a função pode trocar se a confirmação automática estiver ligada. Ler o restante da `036` antes de mudar o status.

## G. Dependências

Serviços, expediente, configurações, agenda (aceitar/recusar), notificações e lista de espera.

## H. Segurança

Anon não deve ter policy de insert em `appointments`. A RPC é `SECURITY DEFINER` e por isso ignora RLS por dentro. Ela precisa checar `booking_active` e o limite. Não acrescentar select de telefone de outras clientes no retorno.

A policy `"blocked_slots_public_read"` da `001` não é removida em migration posterior. Se ainda estiver no banco, um select anônimo em `blocked_slots` lê motivo e horário. A página atual usa RPC. A policy sobra é risco, não fluxo.

## I. Erros

Agenda fechada, nenhum horário livre, limite de pedido. Textos da página estão em `AgendamentoPublico.jsx`.

## J. Testes

`bookingMessages.test.js`. Sem teste da RPC nem da página.

## K. Impacto

Alterar a assinatura de `marcar_horario_site` quebra o front na hora. Manter os parâmetros `p_salon`, `p_servico`, `p_quando`, `p_nome`, `p_whatsapp`, `p_cupom` ou versionar a chamada dos dois lados.
