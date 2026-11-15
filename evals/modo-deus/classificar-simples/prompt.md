---
description: O Maestro classifica uma mudança pequena, que segue padrão existente, como simples com esforço medium.
expected_outcome: Uma tarefa dev-front classe simples, esforço medium, sem implementar nada.
tags: [modo-deus, classificacao, smoke]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Estou usando o modo deus num app React. Preciso só planejar, não implementar nada nem gravar arquivo.

Pedido: no formulário de cadastro de cliente (src/components/ClienteForm.tsx) falta o campo "apelido", opcional, texto livre até 40 caracteres. O formulário já tem nome, email e telefone feitos com o mesmo componente <CampoTexto>, e o backend já aceita "apelido".

Quebre isso em tarefas do plano do modo deus e, para cada tarefa, diga o time, a classe (simples ou complexa) e o esforço. Responda numa tabela curta.
