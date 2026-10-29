# Documentação técnica

Fonte de conhecimento do código em 29 de outubro de 2026, commit `4f7498e` (`4f7498e055aece0d4476a810ff544d83e2e8a6c3`).

O banco de produção não foi consultado. Onde o arquivo SQL e o banco real podem divergir, o texto diz pendência de validação.

O guia para a manicure, se estiver neste branch, fica em [manual-usuario/index.md](manual-usuario/index.md). Ele não descreve SQL nem permissão de banco.

## Índice

- [Visão geral](01-visao-geral.md)
- [Arquitetura](02-arquitetura.md)
- [Banco de dados](03-banco-de-dados.md)
- [Autenticação e permissões](04-autenticacao-permissoes.md)
- [Regras de negócio](05-regras-de-negocio.md)
- [Integrações](06-integracoes.md)
- [Instalação e deploy](07-instalacao-deploy.md)
- [Testes e qualidade](08-testes-qualidade.md)
- [Segurança](09-seguranca.md)
- [Operação e manutenção](10-operacao-manutencao.md)
- [Problemas conhecidos](11-problemas-conhecidos.md)
- [Decisões arquiteturais](12-historico-decisoes.md)
- [AGENTS.md](../AGENTS.md)

## Módulos

- [Agenda](modulos/agenda.md)
- [Clientes](modulos/clientes.md)
- [Serviços](modulos/servicos.md)
- [Financeiro](modulos/financeiro.md)
- [Estoque](modulos/estoque.md)
- [Fidelidade](modulos/fidelidade.md)
- [Equipe](modulos/equipe.md)
- [Planos e assinaturas](modulos/planos.md)
- [Agendamento público](modulos/agendamento-publico.md)
- [Administração](modulos/administracao.md)
- [Configurações](modulos/configuracoes.md)
- [Notificações](modulos/notificacoes.md)
- [Onboarding](modulos/onboarding.md)

## Validação desta versão

Executado em 29 de outubro de 2026, na working tree do commit `4f7498e` mais esta documentação (ainda não commitada).

- `npm test`: 19 arquivos, 117 testes, todos passando.
- `npm run build`: concluiu. O Vite avisou que o chunk principal passa de 500 kB. O service worker foi gerado.
- `npm run lint`: não foi usado como bloqueio. O CI também não bloqueia.
- Banco de produção, cron, webhooks e o painel da Vercel: não acessados.
- Nenhum secret foi escrito nos capítulos. Nomes de variáveis vêm do código e de `.env.example`.

Pendências que continuam abertas: schema original das tabelas anteriores à `001`, conteúdo de `schema_migrations` no projeto hospedado, presença da policy `"blocked_slots_public_read"`, e se as duas migrations `029` foram as duas aplicadas.
