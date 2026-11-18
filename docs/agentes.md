# Agentes

Os agentes do kit ficam em [`agents/`](../agents), um arquivo por agente, no formato de subagente do Claude Code. O plugin `modo-deus` os registra como `modo-deus:<nome>`. Modelo, esforço e território de cada um ficam em [`kit.json`](../kit.json).

| Agente | Time | Modelo | O que faz |
|---|---|---|---|
| [`maestro`](../agents/maestro/maestro.md) | Maestro | opus | Conduz spec e plano com você, despacha os times, integra e entrega o PR. Não escreve código. |
| [`dev-front`](../agents/dev/dev-front.md) | Dev | sonnet | Componentes, páginas e estilos |
| [`dev-back`](../agents/dev/dev-back.md) | Dev | sonnet | Rotas, serviços e lib do servidor |
| [`dev-db`](../agents/dev/dev-db.md) | Dev | sonnet | Migrações e schema, sempre com migração nova |
| [`dev-devops`](../agents/dev/dev-devops.md) | Dev | sonnet | CI, Docker, infraestrutura e configuração do Cypress |
| [`dev-mobile`](../agents/dev/dev-mobile.md) | Dev (sob demanda) | sonnet | Android, iOS, React Native/Expo e Flutter |
| [`dev-dados`](../agents/dev/dev-dados.md) | Dev (sob demanda) | sonnet | Pipelines, ETL, dbt e notebooks |
| [`dev-docs`](../agents/dev/dev-docs.md) | Dev (sob demanda) | sonnet | README, docs, ADR e changelog |
| [`qa-unit`](../agents/qa/qa-unit.md) | QA | sonnet | Testes unitários a partir dos critérios de aceite |
| [`qa-integracao`](../agents/qa/qa-integracao.md) | QA | sonnet | Testes de API, banco e contratos, com o caminho negativo de segurança |
| [`qa-e2e`](../agents/qa/qa-e2e.md) | QA | sonnet | E2E com Cypress |
| [`qa-ui`](../agents/qa/qa-ui.md) | QA | sonnet | Testes de componente e acessibilidade (cypress-axe) |
| [`qa-regressao`](../agents/qa/qa-regressao.md) | QA | sonnet | Roda todas as suítes na feature integrada e diz verde ou vermelho |
| [`revisor`](../agents/review/revisor.md) | Revisão | sonnet | Revisa o diff: critérios, padrões do projeto, desempenho e qualidade |
| [`revisor-seguranca`](../agents/review/revisor-seguranca.md) | Revisão | sonnet | Injeção, autorização, segredos, dependências e integrações |
| [`auditor-de-fatos`](../agents/review/auditor-de-fatos.md) | Revisão | haiku | Confere cada afirmação do relatório contra o código e a telemetria |

**Regras comuns.** Dev e QA trabalham numa worktree própria, na branch `<feature>-T<n>`, e só no território do seu time (o hook bloqueia o resto). Todos leem o `REGRAS.md` do projeto e as regras gerais do kit antes de começar, e terminam com um bloco JSON fixo (entrega, veredito ou auditoria) que o hook confere. Revisão só lê.

O fluxo inteiro, com as skills de cada agente: [FLUXO-E-SKILLS.md](FLUXO-E-SKILLS.md).
