---
type: llm
weight: 2
---

PASS se a tarefa de migração de dados (time dev-db) e a tarefa do middleware de autorização com cache (time dev-back) são classificadas como **complexa** com esforço **high**, e cada tarefa listada tem time, classe e esforço.
FAIL se a migração ou a autorização forem marcadas como simples ou com esforço medium, se faltar classe ou esforço, ou se a resposta implementar o código ou a migração.
