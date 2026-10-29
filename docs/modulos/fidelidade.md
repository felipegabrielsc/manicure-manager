# Fidelidade

## A. Objetivo

Contar visitas e cadastrar cupom de desconto.

## B. Arquitetura interna

`src/pages/Fidelidade.jsx` grava configuração e cupom. O incremento na conclusão está em `src/utils/loyalty.js`, chamado por `concluirAtendimento`. A validação do código no horário usa a RPC `validar_cupom`.

## C. Arquivos

`src/pages/Fidelidade.jsx`, `src/utils/loyalty.js`, `src/pages/NovoAgendamento.jsx`, `src/pages/AgendamentoPublico.jsx`.

## D. Fluxo

Salvar programa grava `loyalty_settings`. O programa abre desligado. Criar cupom insere em `coupons` com o código em maiúsculas. No novo horário, Aplicar chama a validação e mostra o desconto. Na conclusão, `loyalty_visits` sobe 1 só com o programa salvo como ativo e com a feature no plano.

## E. Banco

`loyalty_settings`, `coupons`, colunas `loyalty_visits` e `loyalty_rewards_redeemed` em `clients`. A função `incrementar_fidelidade` existe na `008` e não é chamada pelo front atual.

## F. Regras

`active === true` é o que libera o incremento. Sem linha, ou com a chave desligada, a visita não conta. Plano sem `Fidelidade` também não conta. O prêmio é texto. Não há resgate automático no código da conclusão. Cupom guarda `discount_type` `percent` ou `fixed`, valor e máximo de usos. O uso sobe em `criarAgendamento` com um update separado.

## G. Dependências

Agenda e agenda pública. Feature `Fidelidade` no plano para ver o menu.

## H. Segurança

A policy pública de cupom ativo foi removida na `037` (`DROP POLICY coupons_public_read`). Cupom passa a ser lido pela RPC, não por select anônimo, se essa migration rodou.

## I. Erros

Cupom inválido volta no retorno da RPC e a tela não mostra a linha verde de desconto.

## J. Testes

Não há `loyalty.test.js`. Cupom pode aparecer em teste de agendamento. Verificar `appointmentService.test.js` antes de afirmar cobertura.

## K. Impacto

Trocar o incremento para a RPC antiga muda o critério e pode voltar o 400 que o comentário de `loyalty.js` quis evitar. Zerar `loyalty_visits` no cadastro apaga a contagem sem trilha.
