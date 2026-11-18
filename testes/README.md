# testes/

## Suíte do kit

```bash
npm test
```

[`rodar.mjs`](rodar.mjs) junta os arquivos `*.test.mjs` e roda com `node:test` (node 18 a 22). Os testes usam repositórios e HOME temporários e não tocam no seu `~/.claude`.

| Arquivo | O que cobre |
|---|---|
| `instalador.test.mjs` | Instalação, remoção, `doctor`, detecção de stack, convenções e integrações, dependências |
| `hooks.test.mjs` | Cerca, território, trava, contexto da sessão e dos subagentes, telemetria |
| `vigia.test.mjs` | Regras V1 a V12, status line e painel do `/deus-status` |
| `maestro.test.mjs` | `plano.json`, contratos Dev/QA, vereditos e auditoria |
| `times.test.mjs` | Agentes: frontmatter, skills pré-carregadas, territórios |
| `uso.test.mjs` | Toda skill, conector, mod e hook declarado é de fato usado |
| `retro.test.mjs` | Retrospectiva: coleta, causas e propostas; estrutura das avaliações |
| `plugin.test.mjs`, `convivencia.test.mjs`, `scripts.test.mjs`, `agents-mode.test.mjs` | Manifesto do plugin, convivência com outros hooks, atualização de terceiros e o `agents-mode` |

Os mods têm testes próprios: `claude plugin test mods/kit/<mod>`.

## Avaliações das skills

[`evals/`](evals) tem casos no formato do `claude plugin eval`, que rodam sessões reais do Claude e custam uso. Como rodar e quanto custa: [evals/README.md](evals/README.md).
