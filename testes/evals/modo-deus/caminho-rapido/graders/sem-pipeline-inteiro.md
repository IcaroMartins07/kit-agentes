---
type: llm
weight: 2
---

PASS se o plano tem uma única tarefa Dev (dev-front) de classe simples, marca o caminho rápido, não cria regressão completa e prevê só o revisor na revisão. Uma tarefa qa-unit para o teste do critério, em paralelo, é aceitável.
FAIL se criar regressão, E2E, revisor-seguranca ou mais de uma tarefa de QA para essa troca de texto, ou se classificar como complexa.
