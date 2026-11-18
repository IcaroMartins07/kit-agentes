---
description: Pedido pequeno vai pelo caminho rápido, sem QA separado nem regressão completa.
expected_outcome: Plano com rapido true, uma tarefa Dev simples e só o revisor na revisão.
tags: [modo-deus, caminho-rapido, smoke]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Modo deus num projeto React. Só o plano, sem implementar nem gravar arquivo.

Pedido: trocar o texto do botão "Enviar" para "Salvar alterações" na tela de perfil.

Diga como o modo deus conduz esse pedido e mostre o plano em JSON.
