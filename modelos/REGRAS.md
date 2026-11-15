# Regras do projeto <nome>

Só o que é específico deste projeto. As regras gerais de trabalho, código, segurança e entrega já vêm do AGENTS.md global; não repita aqui.

## Visão

- O que o projeto faz: <uma ou duas frases>
- Quem usa: <público>
- Fonte de verdade do comportamento: <spec, issue, documento, protótipo>

## Stack

- Linguagem e versão: <ex.: TypeScript 5.x, Node 22>
- Framework: <ex.: Next.js 15>
- Banco: <ex.: PostgreSQL via Supabase>
- Confirme versões em: <package.json, pyproject.toml...>

## Comandos

| Ação | Comando |
|---|---|
| Instalar | `<...>` |
| Rodar local | `<...>` |
| Testes | `<...>` |
| Lint | `<...>` |
| Tipos | `<...>` |
| Build | `<...>` |

## Estrutura

- `<pasta>`: <o que fica lá>
- `<pasta>`: <o que fica lá>

## Convenções do projeto

- Branches: <ex.: feat/<assunto>, fix/<assunto>>
- Commits: <ex.: Conventional Commits>
- Nomes e organização: <o que difere do padrão>

## Telas (se houver interface)

- Design de referência: <Figma, sistema de design, pasta de componentes>
- Validação visual: <ex.: playwright-cli nas telas alteradas>

## Fluxo

`/spec` → `/plan` → `/build` → `/review` → `/ship`. Tarefas pequenas (typo, ajuste de texto) podem ir direto para `/build`.

## Definition of Done

- [ ] Comportamento confere com a fonte de verdade
- [ ] Testes, lint, tipos e build passando (comandos acima)
- [ ] `/review` feito e problemas graves resolvidos
- [ ] Documentação e `.env.example` atualizados, se mudou configuração
- [ ] <critério específico do projeto>

## Não fazer

- <ex.: não alterar a pasta legacy/ sem combinar>
- <ex.: não chamar a API de produção em testes>
