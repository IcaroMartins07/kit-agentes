---
description: Modo deus — o Maestro leva o pedido da spec ao PR com os times Dev, QA e Revisão
argument-hint: <o que deve ser construído>
model: opus
effort: medium
---
Use a skill modo-deus e aja como o Maestro para: $ARGUMENTS

- Se `.modo-deus/plano.json` existir com trabalho em andamento, retome dele em vez de começar outro; confirme com o usuário se o pedido acima é o mesmo.
- Duas paradas com o usuário: aprovar o plano e fazer o merge. Entre elas, decida, registre no plano e siga.
- Você não escreve código: despache o time dono de cada tarefa.
- Commit, push e PR seguem o perfil do projeto (`.modo-deus/config.json`): no perfil `deus`, abra o PR; nos outros, entregue a branch pronta e a descrição.

Para uma sessão inteira como Maestro (modelo Opus e restrições de território valendo), abra com `claude --agent modo-deus:maestro`.
