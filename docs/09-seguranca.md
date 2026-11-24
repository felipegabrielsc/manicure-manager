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

1. **Policy pública de bloqueio.** Mitigado na `043` (`DROP POLICY`). Confirmar aplicação no banco hospedado.

2. **Plano só no frontend.** Decisão consciente: Estoque, fidelidade e equipe continuam legíveis pelo JWT do workspace quando o plano não inclui o módulo. O menu não é barreira de dados. Revalidar `features` no Postgres exigiria redesenho de entitlements.

3. **Profissional e financeiro.** Mitigado na `043`: SELECT de cobranças/comissões só do próprio `staff_id`; despesas e audit log só da dona. Writes de lançamento manual só da dona. RPCs `SECURITY DEFINER` de conclusão/recebimento continuam no servidor.

4. **Chave anon no bundle.** Esperado. Service role no bundle não é esperado e não foi encontrada em `VITE_`.

5. **`SECURITY DEFINER`.** Várias RPCs rodam com o dono da função e ignoram RLS por dentro. A segurança é o corpo da função. Uma função nova sem checagem de workspace lê outro salão.

6. **`verify_jwt = false`** em webhook, cron e WhatsApp. O controle está no código da função. Um deploy que apague a checagem do secret abre o endpoint.

7. **Cupom.** Mitigado com `consumir_cupom` na `043` (consumo antes do insert no painel quando a RPC existe).

8. **Onboarding.** Mitigado no front: erros de write interrompem e `onboarding_done` só depois do expediente.

9. **PIX em texto** na página pública. A chave não é senha, mas é dado de cobrança da manicure.

10. **Dois arquivos `029`.** Se um não rodou, a idempotência do Mercado Pago ou a policy de portfólio pode faltar. Checklist de operação, não recriado na `043`.

## Recomendações futuras

- Manter secrets fora de `VITE_` e fora do git. `supabase/.temp/` não deve ser commitado.
- Antes de uma RPC `SECURITY DEFINER`, escrever o teste do caso “usuário do salão A não altera o salão B”, nem que seja revisão manual do `WHERE`.
- Purge real após `profiles.deletion_requested_at` (hoje só o pedido).

## O que não foi verificado

- Configuração de Auth (expiração, captcha, provedores) no painel.
- Se as policies antigas ainda estão criadas no banco.
- Logs de acesso e backup automático do plano Supabase contratado.
- Cabeçalhos HTTP da Vercel.
- Rate limit além de `limite_pedido_publico`.
