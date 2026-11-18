---
description: Critério com Dev e QA em paralelo ganha contrato com ids de teste e API.
expected_outcome: O plano tem contrato (ids_teste e/ou api) nos critérios que dev-front e qa-e2e dividem.
tags: [modo-deus, contrato, smoke]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Estou usando o modo deus num app Next.js com Cypress. Só quero o plano, sem implementar nem gravar arquivo.

Pedido: na tela de pedidos, um botão "Cancelar pedido" que chama a API, some da tela quando o pedido é cancelado e mostra um aviso de sucesso. Quero E2E cobrindo isso.

Mostre a spec com os critérios de aceite e as tarefas do plano em JSON, no formato do plano.json do modo deus.
