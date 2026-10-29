# Histórico de decisões

Referência: commit `4f7498e`. A justificativa só entra quando o código, o comentário ou o README a registra. O resto fica como desconhecida.

## Workspace em vez do auth.uid da profissional

- Decisão: `user_id` das tabelas de salão é o id da dona. `workspace_id()` e a trigger `force_workspace_user_id` garantem isso.
- Onde: `009_phase_g_ops.sql`, reescrita na `037`, `src/utils/workspace.js`.
- Justificativa registrada: a profissional precisa ver os dados do salão em que entrou. O comentário da `009` e o README de isolamento dizem isso.
- Consequência: RLS não separa o que é “só daquela profissional” dentro do salão. O filtro é na tela.

## Chave anon no browser e regra sensível em RPC

- Decisão: não há backend Node. Visitante usa RPC `SECURITY DEFINER`.
- Onde: `004_phase_d_rls_booking.sql`, `src/supabaseClient.js`.
- Justificativa registrada: o README da fase D diz que o anônimo não lê `appointments` e `clients` direto.
- Consequência: esquecer uma policy aberta, como a de `blocked_slots`, fura o modelo.

## Comissão na conclusão, percentual congelado

- Decisão: `REGRA_COMISSAO = 'CONCLUSAO'`. Trigger impede alterar base, percentual e valor.
- Onde: `src/domain/financeiro.js`, `040_financeiro_recebimentos.sql`.
- Justificativa registrada: comentário no domínio: “Comissão nasce na conclusão do atendimento, com o percentual daquele momento.” Comentário na tabela: “Base, percentual e valor não mudam depois de gravados.”
- Consequência: mudar a porcentagem da profissional não recalcula o passado. Mensalidade e pacote não seguem essa comissão.

## Estorno é outra linha

- Decisão: `financial_payments.entry_type` `ESTORNO`, com `reversal_of` único.
- Onde: `040`.
- Justificativa registrada: comentário “Estorno é outra linha, para o mês do caixa não reescrever o mês original.”
- Consequência: indicador de caixa olha a data do estorno, não apaga o recebimento antigo.

## Derivar o livro se a 040 não existir

- Decisão: o financeiro abre mesmo sem as tabelas novas e calcula em memória.
- Onde: `financeiroLoad.js`, `derivarLivro`.
- Justificativa registrada: comentários de compatibilidade e o aviso na tela para rodar o SQL.
- Consequência: dois modos de verdade. Suporte precisa saber qual está ativo (`persistido`).

## Não selecionar staff_id em transactions

- Decisão: a coluna saiu da lista de select.
- Onde: `src/application/financeiroLoad.js`, teste em `financeiroLoad.test.js`, commit `4f7498e`.
- Justificativa registrada: a mensagem do commit e o teste. A coluna não existe. O select gerava 400 e o aviso de despesas incompletas.
- Consequência: não voltar a coluna ao select sem uma migration que a crie. `mapExpense` não usa o campo.

## Sync financeiro fora da primeira pintura

- Decisão: a primeira sincronização e a expirada não bloqueiam a leitura. A suja bloqueia.
- Onde: `decidirSincronizacao` em `financeiroSync.js`.
- Justificativa registrada: comentário “A conferência grava no banco. Não precisa repetir a cada troca de mês.”
- Consequência: o primeiro número pode chegar antes da RPC terminar. A tela atualiza se a RPC processou horários.

## Cache de 60 segundos com geração

- Decisão: memória por salão e mês, ignorando escrita atrasada.
- Onde: `financeiroCache.js`.
- Justificativa registrada: o mapa `geracoes` existe para uma resposta iniciada antes de `invalidarFinanceiro` não regravar o cache. Isso foi necessário porque invalidar uma chave que ainda não tinha sido gravada não impedia o `gravarSeAtual` seguinte.
- Consequência: duas abas não compartilham o `Map`.

## Admin só por flag e convite

- Decisão: código mestre não promove. UUID no front não promove.
- Onde: `037`, `sessionProfile.js`.
- Justificativa registrada: comentário da `037` e o comentário no topo de `sessionProfile.js`.
- Consequência: recuperação de admin é SQL ou `bootstrap_primeiro_admin`, não um código na tela.

## Fila de notificação com claim

- Decisão: `claim_due_notifications` marca o lote antes do envio. `sending` parado volta para `pending`.
- Onde: `038`, `notification-dispatch`.
- Justificativa registrada: comentário da `038` no README: recuperar mensagens presas e impedir dois workers de enviarem o mesmo item.
- Consequência: deploy da função tem de acompanhar o SQL.

## Agenda pública com lock e sem validação anônima direta

- Decisão: `pg_advisory_xact_lock` por salão dentro de `marcar_horario_site`.
- Onde: `036_public_booking_rate_limit.sql`.
- Justificativa registrada: o lock está no código. O texto de por que advisory em vez de constraint de exclusão não está escrito. Justificativa do desenho: desconhecida além de “evitar dois horários iguais”, que o README da fase D atribui à RPC.
- Consequência: a versão `023`, pelo nome, chegou a marcar sem validar. A função vigente é a última aplicada.

## PKCE e PWA

- Decisão: `flowType: 'pkce'` no cliente. Service worker com `injectManifest`.
- Onde: `src/supabaseClient.js`, `vite.config.js`.
- Justificativa: desconhecida no código. Efeito conhecido: o retorno de e-mail precisa da URL pública certa, e o SW pode servir bundle antigo até atualizar.

## Testes no domínio, não na página

- Decisão: Vitest importa funções puras e clientes falsos.
- Onde: `package.json`, arquivos `*.test.js`.
- Justificativa: desconhecida. Consequência: regra de tela sem função extraída não tem teste.

## Manual de usuário separado

- Decisão desta documentação: `docs/manual-usuario/` continua sendo o guia visual. `docs/01` em diante é a fonte técnica.
- Justificativa: o pedido de não misturar os dois públicos. O manual visual tem capturas pendentes e não descreve SQL.
