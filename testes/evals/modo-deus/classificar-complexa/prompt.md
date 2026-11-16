---
description: O Maestro classifica migração de dados com mudança de autorização como complexa com esforço high.
expected_outcome: Tarefas de dev-db e dev-back classe complexa, esforço high; nenhuma tarefa de implementação simples.
tags: [modo-deus, classificacao, smoke]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Estou usando o modo deus numa API Node com Postgres. Preciso só planejar, não implementar nada nem gravar arquivo.

Pedido: hoje cada usuário tem uma coluna "papel" (admin ou comum). Quero trocar por papéis múltiplos numa tabela usuario_papel, migrar os dados existentes sem downtime e fazer o middleware de autorização das rotas /admin passar a ler a tabela nova. Há sessões abertas que guardam o papel em cache por 15 minutos.

Quebre isso em tarefas do plano do modo deus e, para cada tarefa, diga o time, a classe (simples ou complexa) e o esforço. Responda numa tabela curta.
