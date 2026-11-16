---
description: Retrospectiva do modo-deus — transforma bloqueios, alertas e reprovações em melhorias medidas do kit
argument-hint: [--sessao <id>] [--desde AAAA-MM-DD]
model: opus
effort: medium
---
Use a skill retrospectiva e conduza a retro do modo-deus com estes filtros: $ARGUMENTS

- Comece pela coleta: `node "${CLAUDE_PLUGIN_ROOT}/hooks/src/retro.mjs" coletar $ARGUMENTS`.
- Sem filtro e com `.modo-deus/retro/PENDENTE.json`, olhe primeiro a sessão que ele aponta.
- Propostas em `.modo-deus/retro/`, uma por causa, com o trecho da telemetria que a justifica.
- Nada muda no kit nem no `REGRAS.md` sem eval antes/depois e sem o seu sim. Sem melhora, descarta.
- Ao terminar, rode `node "${CLAUDE_PLUGIN_ROOT}/hooks/src/retro.mjs" concluir`.
