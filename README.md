# kit-agentes · modo-deus

Kit v2 de agentes para o Claude Code: Maestro, times de Desenvolvimento, QA e Revisão, guardrails, monitoramento contra fuga e alucinação, e autoaprimoramento das skills.

Status: **F3 concluída** (Maestro, Revisão, contrato do plano e `/deus`). Times Dev e QA chegam na F4. Plano completo em [modo-deus/PLANO.md](modo-deus/PLANO.md).

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
   Depois revise `.claude/modo-deus/REGRAS.md` (já vem com stack, comandos e territórios detectados).

3. Conferir:

   ```bash
   node C:/Users/ALMA/Claude/kit-agentes/instalar.mjs doctor /caminho/do/repo
   ```

Remover de um projeto: `node instalar.mjs --remover /caminho/do/repo`. O que era seu (REGRAS.md, telemetria, retro) vai para `~/.claude/modo-deus/backups/`.

## O que o instalador faz no projeto

- Cria `.claude/modo-deus/` com `REGRAS.md`, `config.json` (perfil e times sob demanda), `telemetria/` e `retro/`.
- Acrescenta o deny-list de `modelos/settings.deny.json` ao `.claude/settings.local.json`, registrando só o que acrescentou para remover depois sem tocar no que é seu.
- Monta o mapa do projeto em `graphify-out/` com `graphify update .` (só código, por AST, sem LLM). Os agentes consultam o grafo antes de varrer pastas, o que corta boa parte do custo de tokens.
- Põe tudo no `.git/info/exclude` comum, que vale também para worktrees.
- Não mexe em nada que o projeto versiona; JSON inválido aborta sem alterar.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `.claude-plugin/` | `plugin.json` e marketplace local |
| `kit.json` | fonte de verdade: perfis, agentes (modelo e esforço), territórios, skills |
| `skills/terceiros/` | skills vendorizadas com commit pinado |
| `skills/proprias/` | `modo-deus` (manual do Maestro); vigia, retrospectiva e qa-cypress nas próximas fases |
| `agents/` | `maestro`, `revisor`, `revisor-seguranca`, `auditor-de-fatos` (Dev e QA na F4) |
| `commands/` | `/deus`, `/spec`, `/plan`, `/build`, `/review`, `/ship`, `/auditar` |
| `hooks/` | `hooks.json` do plugin e `src/` em node: cerca, território, trava, contexto, telemetria |
| `mods/` | status line e painel (F5) |
| `modelos/` | `CLAUDE.md` base, `REGRAS.md`, deny-list |
| `testes/` | `npm test` (node:test, sem dependências) |
| `v1/` | fluxo-agentes v1, só referência |

## Usar

- Pedido pontual: `/deus <o que construir>` na sessão normal.
- Sessão inteira como Maestro (Opus, território valendo): `claude --agent modo-deus:maestro`.
- Fluxo manual, passo a passo: `/spec`, `/plan`, `/build`, `/review`, `/ship`.

## Testes

```bash
npm test
```
