# hooks/

Os guardrails do kit: hooks do Claude Code em node, sem dependências. Só agem em projetos com o kit instalado (`.modo-deus/config.json`). A ligação de cada hook está em [`hooks.json`](hooks.json).

| Quando | Script | O que faz |
|---|---|---|
| Início da sessão | [`src/sessao.mjs`](src/sessao.mjs) | Injeta as regras gerais (`docs/modelos/CLAUDE.md`) e o `REGRAS.md` do projeto, grava `.modo-deus/REGRAS-GERAIS.md` para os subagentes e atualiza o grafo |
| A cada mensagem | [`src/prompt.mjs`](src/prompt.mjs) | Uma linha de lembrete: skill da fase e grafo antes de varrer pastas |
| Antes de cada ferramenta | [`src/pre.mjs`](src/pre.mjs) | Na ordem: cerca (V9, [`cerca.mjs`](src/cerca.mjs)), território (V2, [`territorio.mjs`](src/territorio.mjs)), trava de fase ([`trava.mjs`](src/trava.mjs)), contrato do plano ([`plano-hook.mjs`](src/plano-hook.mjs)) e monitor ([`vigia.mjs`](src/vigia.mjs)) |
| Falha, início e fim de subagente, fim da sessão | [`src/evento.mjs`](src/evento.mjs) | Telemetria, regras gerais para o subagente, contrato de saída e as regras V5, V6 e V12 |
| `/retro` | [`src/retro.mjs`](src/retro.mjs) | Coleta e diagnóstico da retrospectiva |

Peças comuns: [`src/comum.mjs`](src/comum.mjs) (projeto, config, telemetria) e [`src/plano.mjs`](src/plano.mjs) (validação do `plano.json` e dos contratos). O deny-list que o instalador aplica no projeto é [`settings.deny.json`](settings.deny.json). O que fazer em cada alerta V1–V12 está na skill [`vigia`](../skills/proprias/vigia/SKILL.md).

## Dependências (`conectores.json`)

[`conectores.json`](conectores.json) é a única lista de plugins, marketplaces e ferramentas de que o kit depende; o `instalar.mjs dependencias` e o `doctor` leem dela. Por padrão instala com `--scope local` (só no projeto).

| Conector | Para que o kit usa | Precisa de você |
|---|---|---|
| superpowers | TDD, debugging, planos, verificação e worktrees; exigidas pela trava | — |
| claude-security | varredura de segurança antes do merge | — |
| frontend-design | direção visual (dev-front) | — |
| claude-code-setup | recomendações de automação do Claude Code | — |
| context7 | documentação atual de bibliotecas | autenticar quando pedir |
| playwright | navegador para explorar telas e reproduzir bugs | navegadores no primeiro uso |
| figma | ler designs e tokens do Figma | login pelo `/mcp` |
| agent-browser | automação rápida de navegador | CLI `agent-browser` |
| ponytail | a solução mais enxuta que funciona | — |
| perplexity | pesquisa na web atual (Maestro, na spec) | `PERPLEXITY_API_KEY` |
| SkillSpector | escanear skills de terceiros antes de instalar | Python 3.12 |
| graphify (`graphifyy` ≥ 0.9.96) | mapa do código, consultado antes de abrir arquivos | Python |

## Ferramentas

| Arquivo | O que faz |
|---|---|
| [`ferramentas/statusline.mjs`](ferramentas/statusline.mjs) | Status line do modo-deus (perfil, fase, tarefas e alertas). Liga com `instalar.mjs <projeto> --statusline`. |
| [`ferramentas/painel-status.mjs`](ferramentas/painel-status.mjs) | Gera o resumo e o painel HTML do `/deus-status` |
| [`ferramentas/prints.mjs`](ferramentas/prints.mjs) | Prints de uma página em 390, 768 e 1440 px com o Chrome ou o Edge da máquina, sem dependências. O `qa-regressao` tira uma vez; o revisor só olha. |
