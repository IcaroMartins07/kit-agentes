---
description: O Maestro grava um plano.json que cumpre o contrato do kit (o mesmo que hooks/src/plano.mjs validar aplica).
expected_outcome: .claude/modo-deus/plano.json em rascunho, com spec, critérios CA1.., tarefas T1.. com time, classe, esforço coerente, escopo, critérios, pronto_quando, como_testar e status.
tags: [modo-deus, plano, contrato]
runs: 3
max_turns: 15
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write]
---

Estou usando o modo deus. O projeto é um app Next.js com front em app/** e src/components/**, API em src/server/** e testes unitários em tests/unit/**.

Pedido: adicionar um botão "Exportar CSV" na página de pedidos (app/pedidos/page.tsx) que baixa os pedidos filtrados. A API precisa de uma rota nova GET /api/pedidos/export em src/server/pedidos/export.ts que gera o CSV com os mesmos filtros da listagem.

Monte só o plano, ainda sem aprovação minha: grave `.claude/modo-deus/plano.json` no formato do modo deus, com status "rascunho". Não implemente nada.
