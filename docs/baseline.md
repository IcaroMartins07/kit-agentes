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

## Cobertura dos cenários do instalador v1 na v2 (F1)

| Cenário v1 | Na v2 |
|---|---|
| instalação termina sem erro | `instalação termina e deixa git status limpo` |
| comandos copiados | entregues pelo plugin; `comandos não apontam para caminhos ou skills da v1` |
| skill global copiada | entregue pelo plugin; `plugin.json lista exatamente as skills incluídas` + `cada skill incluída existe` |
| skill do usuário intocada (2×) | o instalador não toca `~/.claude/skills`; o doctor só avisa sobre duplicatas |
| git status limpo | `instalação termina e deixa git status limpo` |
| worktree também ignora | `worktree também ignora os arquivos do kit` |
| skill que saiu da LISTA é removida | atualização do plugin (`claude plugin update`) |
| comando que saiu do kit é removido | idem |
| REGRAS.md preservado na reinstalação | `reinstalação preserva REGRAS.md editado e não duplica deny` |

Os 32 cenários da trava continuam valendo para a porta em node na F2.
