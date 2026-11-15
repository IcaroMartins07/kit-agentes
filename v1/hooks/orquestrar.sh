#!/usr/bin/env bash
# UserPromptSubmit: a cada mensagem, lembra de invocar a skill da fase antes de agir.
# Curto de propósito: entra no contexto a cada mensagem. A tabela completa já vem no
# início da sessão (checar-skills.sh). Só builtins, sem abrir processo.
IFS= read -r -d '' _ || true
printf '%s\n' '[fluxo-agentes] Tarefa de código? Invoque antes a skill da fase (tabela em using-agent-skills). Pergunta ou conversa: responda direto.'
exit 0
