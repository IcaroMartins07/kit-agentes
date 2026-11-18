# Comandos

Os comandos do kit ficam em [`commands/`](../commands). No Claude Code aparecem como `/modo-deus:<nome>`, ou só `/<nome>` quando não há outro com o mesmo nome.

| Comando | O que faz | Skill que usa |
|---|---|---|
| [`/deus <pedido>`](../commands/deus.md) | O Maestro leva o pedido da spec ao PR, com duas paradas: aprovar o plano e fazer o merge | `modo-deus` |
| [`/spec <pedido>`](../commands/spec.md) | Especificação: objetivo, critérios de aceite, fora de escopo e riscos | `spec-driven-development` |
| [`/plan`](../commands/plan.md) | Tarefas pequenas, com dependências, arquivos e como testar | `superpowers:writing-plans` |
| [`/build`](../commands/build.md) | Implementa uma tarefa por vez, com TDD | `incremental-implementation`, `superpowers:test-driven-development` |
| [`/review`](../commands/review.md) | Revisa as mudanças atuais | `code-review-and-quality` |
| [`/ship`](../commands/ship.md) | Validação completa, checklist e descrição do PR | `shipping-and-launch`, `humanizer` |
| [`/deus-status`](../commands/deus-status.md) | Situação: tarefas, subagentes, alertas e o painel HTML | `vigia` |
| [`/retro`](../commands/retro.md) | Retrospectiva: falhas da sessão viram melhorias medidas do kit | `retrospectiva` |
| [`/auditar`](../commands/auditar.md) | Auditoria do repositório, só relatório | `ponytail-audit` |

Nenhum comando faz commit, push ou PR sem a sua confirmação, a não ser o `/deus` no perfil `deus`.
