---
name: qa-cypress
description: Padrões de teste E2E e de componente com Cypress no modo-deus. Use ao escrever, corrigir ou revisar testes Cypress (cypress/e2e, *.cy.ts, component testing), ao configurar o Cypress num projeto, ao testar acessibilidade com cypress-axe ou ao investigar teste E2E instável.
---

# qa-cypress

Testes E2E e de componente que provam critérios de aceite e não quebram à toa.

## Antes de escrever

- O teste nasce do **critério de aceite**, não da implementação. Escreva o que o usuário faz e vê. Não abra o código da tarefa para "ver como ficou".
- Um arquivo por fluxo: `cypress/e2e/<fluxo>.cy.ts`. Um `it` por comportamento, nomeado pelo resultado esperado ("cria a conta e cai no painel").
- Cite o CA no `describe`: `describe("CA2 · login reaproveita usuário existente", ...)`.

## Seletores

1. `data-cy="..."` é o padrão, lido com `cy.dataCy("nome")` (comando dos modelos do kit). Se o elemento não tem, o teste pede: registre no relatório que o Dev precisa adicionar `data-cy` (não edite o componente).
2. Na falta dele: papel e nome acessível (`cy.findByRole("button", { name: "Entrar" })` com `@testing-library/cypress`, se o projeto já usa).
3. Nunca: classe CSS, `nth-child`, texto que muda com tradução, XPath.

## Espera

- **Proibido `cy.wait(<número>)`.** Espere por estado: `cy.get(...).should(...)`, ou por rede: `cy.intercept(...).as("x")` + `cy.wait("@x")`.
- Asserções com `should` repetem até o timeout; não encadeie `then` para checar o que `should` já checa.

## Dados e rede

- Cada teste prepara o próprio estado: `cy.request` para a API de teste, `cy.task` para semear o banco, ou fixture. Nada de depender da ordem dos testes.
- Login uma vez por sessão com `cy.session`.
- Serviço externo (OAuth, pagamento, e-mail): `cy.intercept` com fixture. Nunca chame produção.
- Limpe o que criou, ou use dados com sufixo único por execução.

## Componente

- Component testing (`cypress/component` ou `*.cy.tsx` ao lado do componente) para estados de UI: vazio, carregando, erro, desabilitado, foco.
- Monte com os providers reais do projeto (tema, i18n, roteador), não com mocks deles.

## Acessibilidade (qa-ui)

- `cypress-axe`: `cy.injectAxe()` depois do `visit`/`mount`, `cy.checkA11y()` no estado relevante. Falha de nível `serious` ou `critical` é item para o Dev.
- Navegação por teclado nos fluxos críticos: `Tab` até o controle, `Enter` aciona, foco visível.

## Teste instável

- Falhou e passou sem mudança de código: é instável. Não aumente timeout às cegas; ache a espera errada.
- Não conseguiu estabilizar na tarefa: marque com `it.skip` + comentário `// quarentena: <motivo> (<data>)` e registre no relatório. Quarentena não bloqueia o pipeline sozinha, mas aparece na revisão.

## Rodar

- Um arquivo: `npx cypress run --spec cypress/e2e/<fluxo>.cy.ts`. Componente: `npx cypress run --component`.
- Use o comando de E2E do `REGRAS.md` quando existir.
- Relate o resultado real (passou, falhou com quantos, falhou_esperado quando o teste de aceite foi escrito antes da implementação).

## Configurar num projeto sem Cypress

Instalar dependência pede aprovação do usuário: o Maestro põe a configuração no plano, e a aprovação do plano é a confirmação. São duas tarefas, porque os arquivos do Cypress são do território "testes" e o hook não deixa o Dev gravá-los:

1. **`dev-devops` · instalar**: `npm i -D cypress` (e `cypress-axe axe-core` se houver tarefa de UI) com o gerenciador do projeto; scripts no `package.json`: `"test:e2e": "cypress run"`, `"test:component": "cypress run --component"`; job de E2E no CI, se o projeto tiver CI. Devolve os comandos novos em `observacoes`.
2. **`qa-e2e` · configurar** (`depende_de` a tarefa 1): copia de `${CLAUDE_PLUGIN_ROOT}/skills/proprias/qa-cypress/modelos/cypress/` o `cypress.config.ts`, `cypress/support/e2e.ts` e `cypress/support/component.ts`, ajusta `baseUrl` e o `devServer`, e escreve o primeiro teste real.
3. **Maestro**: atualiza a linha E2E da tabela de comandos do `REGRAS.md` com o que o `dev-devops` devolveu.

Mobile nativo não usa Cypress: use o runner do projeto (Detox ou Maestro).
