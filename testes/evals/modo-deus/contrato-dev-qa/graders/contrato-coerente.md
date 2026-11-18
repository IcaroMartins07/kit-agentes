---
type: llm
weight: 2
---

PASS se os critérios que têm tarefa dev-front e tarefa qa-e2e ao mesmo tempo trazem contrato com ids de teste (data-cy do botão e do aviso) e a API do cancelamento (método e rota), e as tarefas citam esses critérios.
FAIL se faltar contrato num critério dividido entre Dev e QA, se o contrato for vago ("a API certa") ou se a resposta implementar código.
