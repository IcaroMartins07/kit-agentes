# kit-agentes · modo-deus

Kit v2 de agentes para o Claude Code: Maestro, times de Desenvolvimento, QA e Revisão, guardrails, monitoramento contra fuga e alucinação, e autoaprimoramento das skills.

Status: **F0 a F7 implementadas** (16 agentes, monitor V1–V11, retrospectiva, CI e migração). Falta o uso real: migrar um projeto e rodar o `/deus` de ponta a ponta. Plano completo em [docs/PLANO.md](docs/PLANO.md).

## Instalar

Duas partes: o **plugin** (skills, comandos e, nas próximas fases, agentes e hooks) e a **parte por projeto** (regras, perfil, deny-list), que nunca entra no git.

0. Dependências, uma vez por máquina (plugins `superpowers`, `claude-security`, `frontend-design` e o graphify; nunca o caveman):

   ```bash
   node C:/Users/ALMA/Claude/kit-agentes/instalar.mjs dependencias
   ```

1. Plugin, uma vez por máquina:

   ```bash
   claude plugin marketplace add C:/Users/ALMA/Claude/kit-agentes
   claude plugin install modo-deus@kit-agentes
   ```

2. Em cada projeto:

   ```bash
   node C:/Users/ALMA/Claude/kit-agentes/instalar.mjs /caminho/do/repo --perfil estrito
   ```

   Opções: `--perfil leve|estrito|deus`, `--times dev-mobile=ligado,dev-docs=desligado`, `--sem-grafo`, `--dry-run`.
   Depois revise `.modo-deus/REGRAS.md` (já vem com stack, comandos e territórios detectados).

3. Conferir:

   ```bash
   node C:/Users/ALMA/Claude/kit-agentes/instalar.mjs doctor /caminho/do/repo
   ```

Remover de um projeto: `node instalar.mjs --remover /caminho/do/repo`. O que era seu (REGRAS.md, telemetria, retro) vai para `~/.claude/modo-deus/backups/`.

## O que o instalador faz no projeto

- Cria `.modo-deus/` com `REGRAS.md`, `config.json` (perfil e times sob demanda), `telemetria/` e `retro/`.
- Acrescenta o deny-list de `hooks/settings.deny.json` ao `.claude/settings.local.json`, registrando só o que acrescentou para remover depois sem tocar no que é seu.
- Monta o mapa do projeto em `graphify-out/` com `graphify update .` (só código, por AST, sem LLM). Os agentes consultam o grafo antes de varrer pastas, o que corta boa parte do custo de tokens.
- Põe tudo no `.git/info/exclude` comum, que vale também para worktrees.
- Não mexe em nada que o projeto versiona; JSON inválido aborta sem alterar.

## Estrutura

O kit configura o ambiente de cada projeto sem instalar nada global por padrão. São oito pastas:

| Pasta | Conteúdo |
|---|---|
| `skills/` | `terceiros/` (vendorizadas com commit pinado; `atualizar-terceiros.mjs` compara com a origem) e `proprias/` (`modo-deus`, `qa-cypress` com os modelos do Cypress, `vigia`, `retrospectiva`) |
| `mods/` | mods de terceiros guardados em `M1`–`M6`, o Prompt Master em `M7`, `painel/` (gerador do `/deus-status` e o mod `temas`) e a status line |
| `plugins/` | `conectores.json`: plugins, marketplaces e ferramentas de que o kit depende, instalados por projeto (`--scope local`) |
| `hooks/` | `hooks.json` do plugin, `src/` em node (cerca, território, trava, plano, monitor, telemetria, contexto, retro) e o deny-list `settings.deny.json` |
| `agents/` | `maestro/`, `dev/` (front, back, db, devops, mobile, dados, docs), `qa/` (unit, integração, e2e, ui, regressão) e `review/` (revisor, segurança, auditor de fatos) |
| `docs/` | `PLANO.md`, migração, baseline, desenho do palco, `modelos/` (`CLAUDE.md` base e `REGRAS.md`) e `referencia/` (v1 e legado) |
| `commands/` | `/deus`, `/deus-status`, `/retro`, `/spec`, `/plan`, `/build`, `/review`, `/ship`, `/auditar` |
| `testes/` | `npm test` (`rodar.mjs`, node:test, node 18+) e `evals/` (casos do `claude plugin eval`) |

Na raiz ficam só arquivos: `kit.json` (perfis, agentes, territórios, skills), `instalar.mjs`, `migrar-v1.mjs`, `package.json`, `README.md`, `CHANGELOG.md` e o manifesto do plugin em `.claude-plugin/`.

## Usar

- Pedido pontual: `/deus <o que construir>` na sessão normal.
- Sessão inteira como Maestro (Opus, território valendo): `claude --agent modo-deus:maestro`.
- Fluxo manual, passo a passo: `/spec`, `/plan`, `/build`, `/review`, `/ship`.

## Testes

```bash
npm test
```
