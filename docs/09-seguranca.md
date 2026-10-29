# Segurança e proteção de dados

Referência: commit `4f7498e`. Não houve teste invasivo, varredura de produção nem tentativa de login. O que está marcado como implementado foi lido no código. O que está marcado como risco é uma leitura do que esse código permite, não um incidente observado.

## Implementado

### Autenticação

Supabase Auth, senha, PKCE, recuperação por e-mail. Cadastro só com convite. Senha mínima de 6 caracteres no formulário de cadastro. A política de senha do projeto Auth, no painel, não está no repositório.

### Autorização

`is_admin` só no banco. `assembleSessionProfile` força falso para profissional. `ativar_admin_com_codigo` recusa depois da `037`. Convite de admin é uso único.

`PlanGate` e o menu escondem módulo. Isso não é autorização de dados.

### RLS e isolamento

Policies `user_id = workspace_id()` nas tabelas de salão, a partir da `009`. Trigger da `037` reescreve `user_id` em insert e update para o workspace, exceto service role e sessão sem usuário.

`profiles_select_own_or_admin` permite a própria linha, o admin, a dona da profissional e as profissionais da dona.

A `004` liga RLS nas tabelas base e tira o acesso anônimo direto, segundo o comentário e os `ENABLE ROW LEVEL SECURITY`. O efeito depende de não existir policy `USING (true)` esquecida.

### Webhooks e cron

Mercado Pago: o status vem da API com o token, não do JSON cru. WhatsApp: secret do webhook. Cron: `CRON_SECRET` ou service role. `mp-create-preference` exige JWT.

### Campos sensíveis de perfil

`protect_profile_sensitive_fields` impede o usuário comum de se promover. A versão vigente é a da `037`, que também desliga o código mestre. A função é trigger em `profiles`.

### Comissão e auditoria

`financial_audit_log` grava mudança de cobrança, pagamento e comissão. A comissão gravada não muda de valor. Transação ligada a pagamento não é apagada pela trigger `bloquear_delete_transaction_vinculada`.

### LGPD na tela

Configurações oferece **Baixar CSV das clientes** com nome, WhatsApp, tipo e fidelidade. Não há, neste repositório, fluxo de exclusão de conta nem de anonimização. Pendência de produto, não um botão escondido.

### Entrada

Formulários usam `required` e checagens pontuais (senha, WhatsApp com 10 dígitos, pacote esgotado). Não há biblioteca de schema. A RPC de agenda pública limita pedido por telefone (`036`).

## Riscos encontrados no código

1. **Policy pública de bloqueio.** `001` cria `"blocked_slots_public_read"` com `USING (true)`. Nenhuma migration posterior remove essa policy. Se ela estiver no banco, qualquer papel que passe no RLS lê todos os bloqueios, inclusive o motivo. A agenda pública atual não precisa desse select.

2. **Plano só no frontend.** Estoque, fidelidade e equipe continuam legíveis pelo JWT do workspace quando o plano não inclui o módulo.

3. **Profissional vê o financeiro do salão na API.** A tela filtra. A policy não filtra por `staff_id`.

4. **Chave anon no bundle.** Esperado. Service role no bundle não é esperado e não foi encontrada em `VITE_`.

5. **`SECURITY DEFINER`.** Várias RPCs rodam com o dono da função e ignoram RLS por dentro. A segurança é o corpo da função. Uma função nova sem checagem de workspace lê outro salão.

6. **`verify_jwt = false`** em webhook, cron e WhatsApp. O controle está no código da função. Um deploy que apague a checagem do secret abre o endpoint.

7. **Cupom incrementado fora de transação** com o insert do horário. Não é vazamento, é consistência.

8. **Onboarding não confere erro** dos writes. Pode marcar `onboarding_done` e falhar o expediente.

9. **PIX em texto** na página pública. A chave não é senha, mas é dado de cobrança da manicure.

10. **Dois arquivos `029`.** Se um não rodou, a idempotência do Mercado Pago ou a policy de portfólio pode faltar.

## Recomendações futuras

Não foram implementadas nesta tarefa.

- Dropar `"blocked_slots_public_read"` numa migration nova, depois de confirmar que a agenda pública usa só RPC.
- Não tratar o menu como barreira de dados.
- Manter secrets fora de `VITE_` e fora do git. `supabase/.temp/` não deve ser commitado.
- Antes de uma RPC `SECURITY DEFINER`, escrever o teste do caso “usuário do salão A não altera o salão B”, nem que seja revisão manual do `WHERE`.
- Registro de pedido de exclusão de dados, se o produto precisar atender a titular. Hoje só existe exportação.

## O que não foi verificado

- Configuração de Auth (expiração, captcha, provedores) no painel.
- Se as policies antigas ainda estão criadas no banco.
- Logs de acesso e backup automático do plano Supabase contratado.
- Cabeçalhos HTTP da Vercel.
- Rate limit além de `limite_pedido_publico`.
