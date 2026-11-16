---
type: llm
weight: 3
focus: { source: file, path: .modo-deus/plano.json }
---

O arquivo é o plano do modo deus. Confira as regras do contrato (as mesmas de `node hooks/src/plano.mjs validar`):

- JSON válido com `versao: 1`, `pedido` preenchido e `status: "rascunho"`.
- `spec.objetivo` preenchido e `spec.criterios_aceite` com pelo menos um item `{ id: "CA1", texto }`, ids CA1, CA2... sem repetição.
- `tarefas` com pelo menos uma tarefa; cada uma tem `id` T1, T2..., `titulo`, `time` entre dev-front, dev-back, dev-db, dev-devops, qa-unit, qa-integracao, qa-e2e, qa-ui, qa-regressao (nunca maestro nem revisor), `classe` simples ou complexa, `esforco` medium para simples e high para complexa, `escopo` com caminhos relativos sem `..`, `criterios` apontando para CAs que existem, `pronto_quando`, `como_testar` e `status` (pendente para um plano novo).
- `depende_de`, se houver, aponta para tarefas existentes, sem ciclo.
- Tarefas sem dependência entre si têm escopos que não se sobrepõem.
- O botão vai para dev-front (escopo em app/pedidos/** ou o arquivo da página) e a rota para dev-back (escopo em src/server/pedidos/**).

PASS se todas as regras acima valem.
FAIL se qualquer uma for violada, se o JSON for inválido ou se o arquivo trouxer código de implementação.
