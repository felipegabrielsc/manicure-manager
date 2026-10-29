# Administração

## A. Objetivo

Operar a plataforma: convite de salão, bloqueio de conta, plano e convite de outro admin.

## B. Arquitetura interna

`src/pages/Admin.jsx` só monta se `profile.is_admin`. `UnlockAdminForm.jsx` chama `ativar_admin_com_convite`. O código mestre não promove mais.

## C. Arquivos

`src/pages/Admin.jsx`, `src/components/UnlockAdminForm.jsx`, `src/utils/siteOwner.js`, migrations `010`, `011`, `012`, `014`, `015`, `037`.

## D. Fluxo

O admin lista perfis com as policies de admin, gera convite e copia o link `/cadastro-vip?token=`. Bloquear grava `is_blocked`. A conta bloqueada vê só `Bloqueado.jsx`.

## E. Banco

`profiles`, `invites`, `admin_platform_invites`, `subscription_plans`. Funções: `criar_convite`, `criar_convite_admin`, `ativar_admin_com_convite`, `bootstrap_primeiro_admin`, `current_user_is_admin`. `ativar_admin_com_codigo` devolve `ok: false`.

## F. Regras

Admin de plataforma não é o plano Pro. Convite de admin dura 2 dias e é uso único, segundo o comentário e a função da `037`. `bootstrap_primeiro_admin` é o caminho documentado no README quando não existe nenhum `is_admin`. Não executar isso como parte de documentação.

## G. Dependências

Cadastro, planos, sessão. Um admin bloqueado não administra.

## H. Segurança

Não há bypass por UUID no front (`sessionProfile.js`). Service role continua capaz de `UPDATE profiles SET is_admin`. Isso fica no SQL Editor, não na tela. Funções `SECURITY DEFINER` de admin precisam checar `current_user_is_admin()` no corpo. Ler a função nova inteira.

## I. Erros

Rota `/admin` sem flag redireciona para `/`. Convite inválido mostra o `reason`.

## J. Testes

`sessionProfile.test.js` garante que o perfil montado não promove admin. Não há teste de `Admin.jsx`.

## K. Impacto

Qualquer RPC nova com service role ou `SECURITY DEFINER` sem checagem de admin atravessa o RLS. Não reativar `ativar_admin_com_codigo`.
