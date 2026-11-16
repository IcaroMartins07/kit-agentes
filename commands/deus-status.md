---
description: Situação do modo-deus — fases, tarefas por status, subagentes, alertas por regra e o painel HTML
argument-hint: [--todas | --sessao <id>]
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/mods/painel/gerar.mjs" *)
---
Situação atual, gerada pelo kit (não reescreva os números):

!`node "${CLAUDE_PLUGIN_ROOT}/mods/painel/gerar.mjs" "${CLAUDE_PROJECT_DIR}" $ARGUMENTS`

Depois, em até cinco linhas:

- O que está parado ou atrasado (tarefa em `reprovada`, subagente sem "encerrado", agente com muitas chamadas).
- Cada regra com alerta ou bloqueio (V1–V11), com o que fazer segundo a skill `modo-deus:vigia`.
- O caminho do painel HTML (`.modo-deus/painel/index.html`), para eu abrir no navegador.

Não altere arquivos nem o plano: é só leitura. Se o kit não estiver instalado, diga como instalar (`node instalar.mjs <projeto>`).
