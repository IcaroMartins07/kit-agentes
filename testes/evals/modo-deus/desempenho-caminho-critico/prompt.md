---
description: Listagem grande em caminho crítico vira tarefa complexa com cuidado de desempenho.
expected_outcome: Tarefa complexa, high, citando paginação ou N+1 e a skill performance-optimization.
tags: [modo-deus, desempenho, classificacao]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Modo deus numa API Node com Postgres. Só o plano, sem implementar nem gravar arquivo. A rota GET /pedidos está marcada como caminho crítico no REGRAS.md.

Pedido: a listagem de pedidos passa a mostrar o nome do cliente e os itens de cada pedido. Há 2 milhões de pedidos.

Quebre em tarefas do plano do modo deus com time, classe, esforço e o pronto_quando de cada uma.
