# Baseline da v1 (fluxo-agentes)

Medido em 2026-11-15, Windows 11, Git Bash, antes de qualquer mudança.

## Origem

- Fonte: `C:\Users\ALMA\Claude\fluxo-agentes`.
- `~/.claude/kits/fluxo-agentes` é uma cópia **idêntica** (`diff -rq` sem diferenças fora de `_legado/`), não um link. Na F7 a cópia passa a apontar para a v2.

## Testes

| Suíte | Cenários | Resultado | Tempo total |
|---|---|---|---|
| `testes/testar-trava.sh hooks/exigir-skill.sh` | 32 | TODOS OK | 7,6 s |
| `testes/testar-instalador.sh` | 10 | TODOS OK | 11,3 s |

Estes 42 cenários são o piso da v2: a porta dos hooks para node (F2) e o novo instalador (F1) precisam passar em todos eles.

## Desempenho da trava (do README da v1)

| Caso | Tempo |
|---|---|
| `ls` | ~40 ms |
| edição de `.ts` | ~130 ms |
| commit | ~300 ms |

Meta da F2: caso comum ≤ 60 ms.

## Estado do ambiente

- Skills globais da v1 instaladas em `~/.claude/skills` (manifesto em `~/.claude/fluxo-skills.txt`).
- Plugins de usuário: `claude-code-setup`, `frontend-design`, `claude-security`, `superpowers`; Playwright sincronizado do claude.ai.
- `agent-browser` 0.43.0 global (npm).
- Hooks do Orca em todos os eventos do `~/.claude/settings.json`; os do kit precisarão conviver (F7).

## O que não veio da v1

- `_legado/` inteiro (duplicatas de skills, strix, security-audit, ai-memory, playwright-cli, ponytail completo). Continua disponível no `fluxo-agentes`.
- Exceções guardadas como referência: `modelos/settings.deny.v1.json` (deny-list) e `docs/referencia/AGENTS.v1.md` (base do `CLAUDE.md` da F1).
