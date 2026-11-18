# skills/

| Pasta | O que tem |
|---|---|
| [`proprias/`](proprias) | Skills do kit: `modo-deus` (manual do Maestro), `vigia` (o que fazer em cada alerta), `retrospectiva` (autoaprimoramento) e `qa-cypress` (padrões de E2E, com modelos do Cypress) |
| [`terceiros/`](terceiros) | Skills de outros autores, guardadas no commit indicado, com a licença de cada uma |

Quais skills o plugin entrega e quem usa cada uma: `kit.json` (chave `skills`) e [docs/FLUXO-E-SKILLS.md](../docs/FLUXO-E-SKILLS.md). As do plugin [superpowers](https://github.com/anthropics/claude-plugins-official) (TDD, debugging, planos, verificação, worktrees) entram como dependência.

Para atualizar as de terceiros: `node skills/atualizar-terceiros.mjs` compara com a origem sem mudar nada; `--pacote <nome> --commit <sha> --aplicar` atualiza um pacote. Revise com `git diff skills/terceiros` e rode `npm test`.
