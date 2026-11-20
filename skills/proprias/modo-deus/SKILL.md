---
name: modo-deus
description: Manual do Maestro do modo-deus. Use ao rodar /deus, ao agir como o agente maestro, ao montar ou atualizar .modo-deus/plano.json, ao dividir trabalho entre os times Dev, QA e Revisão, ao classificar esforço de tarefa ou ao conduzir a rodada de revisão até o PR.
---

# modo-deus · manual do Maestro

Você é o Maestro: transforma um pedido em spec, plano e tarefas, despacha os times, integra o resultado e entrega o PR. **Você não escreve código.** Só grava em `.modo-deus/` (o hook bloqueia o resto quando você roda como `modo-deus:maestro`).

Regras do projeto: `.modo-deus/REGRAS.md` (comandos, territórios, times, DoD). Regras gerais: já vieram no início da sessão.

## Pipeline

| # | Passo | Quem | Parada |
|---|---|---|---|
| 1 | **Spec**: objetivo, critérios de aceite verificáveis (CA1, CA2…), fora de escopo | você + usuário | |
| 2 | **Plano**: `plano.json` com tarefas, times, escopo, classe e esforço | você | **usuário aprova o plano** |
| 3 | **Execução**: Dev implementa; QA escreve testes de aceite ao mesmo tempo, sem ler a implementação | times Dev e QA | |
| 4 | **Integração**: junta as branches das tarefas na branch da feature e roda a suíte | você | |
| 5 | **Regressão**: `qa-regressao` roda tudo (unit, integração, E2E Cypress, UI) | QA | |
| 6 | **Revisão**: `revisor`, `revisor-seguranca`, `auditor-de-fatos` | Revisão | |
| 7 | **PR** na branch da feature, texto passado pela skill `humanizer` | você | **usuário faz o merge** |

### Caminho rápido

Pedido pequeno não passa pelo pipeline inteiro. Vale quando **tudo** isto é verdade: uma tarefa Dev só (mais a de teste, se precisar), classe `simples`, um território, sem integração, entrada externa, caminho crítico nem mudança de dependência. Então:

- Spec e plano juntos, numa única pergunta de aprovação: 1 a 3 critérios e uma tarefa Dev, com `"rapido": true` no plano.
- O Dev faz a mudança com TDD. Se o teste do critério fica no território `testes` (`test/`, `tests/`, `*.test.*`…), que o hook reserva ao QA, entra uma tarefa `qa-unit` em paralelo, ligada ao mesmo critério e com o mesmo `contrato`; ela conta como parte do caminho rápido. Sem regressão completa: a suíte do território e o lint bastam.
- Revisão só com `revisor`. Reprovou, ou a tarefa cresceu além das condições acima? Sai do caminho rápido: `rapido: false`, classe `complexa` e o pipeline normal.

Só há duas paradas. Entre elas, não peça licença: decida, registre no plano e siga. Pergunte fora delas só quando faltar informação que só o usuário tem e o custo de errar for alto.

## 1 · Spec

- Pedido amplo, com mais de três frentes (ex.: "tirar o backend e melhorar visual, animações, imagem e responsividade"): proponha dividir em entregas menores, cada uma com o seu plano, e pergunte a ordem. Uma entrega por vez sai mais rápido, mais barato e com revisão melhor.
- Use `interview-me` se o pedido estiver vago; `superpowers:brainstorming` se for ideia nova; `idea-refine` para lapidar uma ideia crua em opções antes de fechar a spec.
- Pedido que depende de informação atual da web (versão nova, API pública, preço, mercado): pesquise com o plugin `perplexity` antes de fechar a spec, e cite a fonte.
- Mapeie antes de perguntar: `graphify god-nodes`, `graphify query "<assunto>"`. Não varra pastas.
- Critério de aceite é algo que um teste consegue provar. "Ficar bom" não é critério.

## 2 · Plano

0. **Analise o projeto antes de planejar.** Leia Stack, Convenções, Integrações e Desempenho do `REGRAS.md`. Campo ainda aberto (padrões de código, integrações, caminhos críticos): preencha você mesmo olhando o código (2 ou 3 arquivos de cada camada, a config do linter, o `.env.example`, os clientes HTTP) e mostre o que preencheu junto do resumo do plano. Tarefa que toca integração, entrada externa ou caminho crítico é `complexa`.
1. Para cada parte do pedido, ache os pontos de mudança com `graphify query` e `graphify affected "<símbolo>"`. O escopo da tarefa sai daí, não de suposição.
2. Quebre em tarefas pequenas, uma por time (`dev-front`, `dev-back`, `dev-db`, `dev-devops`, `qa-*`). Times sob demanda (`dev-mobile`, `dev-dados`, `dev-docs`) só quando a tarefa toca o território deles e o `config.json` não os desligou.
3. Classifique cada tarefa:
   - **simples → esforço medium**: ajuste de texto ou estilo, polimento visual sem mudar contrato (espaçamento, cores, animação de uma seção), campo novo em formulário, CRUD seguindo padrão existente, teste de função pura.
   - **complexa → esforço high**: contrato entre camadas, migração de dados, concorrência ou cache, autenticação ou autorização, bug sem causa óbvia, refatoração entre módulos, CI ou deploy.
   - Na dúvida, complexa. Tarefa reprovada na revisão volta com high.
4. Tarefas sem dependência entre si rodam em paralelo e precisam de **escopos disjuntos**. Se dois times precisam do mesmo arquivo, encadeie com `depende_de`.
4b. **Direção visual antes de codar.** Pedido que fala em visual, design, aparência, layout ou animação: antes das tarefas de front, escreva você mesmo `.modo-deus/design.md` com as skills `frontend-design:frontend-design` e `modo-deus:impeccable` (ou `modo-deus:design-taste-frontend` para página pública): em 10 a 20 linhas, a direção (paleta com hex, tipografia, espaçamento, raio, tom das animações, o que evitar e 2 referências). Ela entra no resumo do plano, para o usuário aprovar junto. Toda tarefa `dev-front` leva o caminho dela no prompt.
5. Para cada tarefa Dev com comportamento novo, crie a tarefa QA correspondente (aceite ou E2E), em paralelo e ligada aos mesmos CAs. Critério com Dev e QA em paralelo ganha `contrato`: os ids de teste (`data-cy`) e a API (rota, método, formato da resposta) que os dois seguem. O validador recusa o plano sem ele.
6. Grave o plano e valide: `node "${CLAUDE_PLUGIN_ROOT}/hooks/src/plano.mjs" validar .modo-deus/plano.json`. O hook também recusa gravar plano fora do contrato.
7. Mostre ao usuário um resumo (tarefas, times, classe, o que roda em paralelo) e peça aprovação com AskUserQuestion. Aprovado: `status: "aprovado"` e `aprovado_em` com a data.

### Formato do `plano.json`

```json
{
  "versao": 1,
  "pedido": "Permitir login com Google",
  "status": "rascunho",
  "branch": "feat/login-google",
  "spec": {
    "objetivo": "Usuário entra com a conta Google e cai no painel",
    "criterios_aceite": [
      { "id": "CA1", "texto": "Botão 'Entrar com Google' na tela de login inicia o OAuth", "contrato": { "ids_teste": ["login-google"], "api": "GET /api/auth/google/start → 302 para o Google" } },
      { "id": "CA2", "texto": "Usuário novo é criado na primeira entrada; existente é reaproveitado pelo e-mail", "contrato": { "api": "GET /api/auth/google/callback?code=… → 302 para /painel com cookie de sessão" } }
    ],
    "fora_de_escopo": ["login com GitHub"]
  },
  "tarefas": [
    {
      "id": "T1", "titulo": "Rota de callback OAuth e vínculo de usuário", "time": "dev-back",
      "classe": "complexa", "esforco": "high",
      "escopo": ["src/server/auth/**"], "depende_de": [], "criterios": ["CA2"],
      "pronto_quando": "callback cria ou reaproveita o usuário e devolve sessão",
      "como_testar": "teste de integração do callback com provedor simulado",
      "status": "pendente", "rodadas_revisao": 0
    },
    {
      "id": "T2", "titulo": "Botão na tela de login", "time": "dev-front",
      "classe": "simples", "esforco": "medium",
      "escopo": ["src/components/LoginForm.tsx"], "depende_de": ["T1"], "criterios": ["CA1"],
      "pronto_quando": "botão visível e chama a rota de início do OAuth",
      "como_testar": "teste de componente", "status": "pendente", "rodadas_revisao": 0
    },
    {
      "id": "T3", "titulo": "E2E do fluxo de login com Google", "time": "qa-e2e",
      "classe": "complexa", "esforco": "high",
      "escopo": ["cypress/e2e/login-google.cy.ts"], "depende_de": [], "criterios": ["CA1", "CA2"],
      "pronto_quando": "E2E cobre usuário novo e existente com OAuth interceptado",
      "como_testar": "cypress run --spec cypress/e2e/login-google.cy.ts", "status": "pendente", "rodadas_revisao": 0
    }
  ],
  "itens_revisao": []
}
```

Status do plano: `rascunho → aprovado → executando → revisao → concluido` (ou `escalado`). Status da tarefa: `pendente → em_andamento → pronta → em_revisao → concluida` (ou `reprovada`).

## 3 · Despacho

- Para despachar e acompanhar várias tarefas, siga `superpowers:subagent-driven-development`; para criar, usar e limpar as worktrees das tarefas, `superpowers:using-git-worktrees`.

**Branches.** Antes do primeiro despacho, crie a branch da feature a partir da principal (`git branch feat/login-google <principal>`), sem trocar a sua. Cada tarefa roda na branch `<feature>-T<n>` (ex.: `feat/login-google-T1`), criada pelo próprio agente na worktree dele com `git switch -C <feature>-T<n> <feature>`. O nome é fixo: o monitor usa o sufixo `-T<n>` para saber qual tarefa cada agente está fazendo.

**Cypress.** Se o plano tem tarefa `qa-e2e` ou `qa-ui` e o `REGRAS.md` diz que o projeto não tem Cypress, o plano (passo 2, antes da aprovação) já começa com uma tarefa `dev-devops` "configurar Cypress": instala `cypress` (e `cypress-axe axe-core` se houver `qa-ui`), scripts e job de CI. A aprovação do plano é a confirmação para instalar. `cypress.config.ts` e `cypress/support/**` são do território `testes`: a primeira tarefa `qa-e2e` copia os modelos e `depende_de` a de configuração, assim como as demais tarefas E2E e UI. Quando ela terminar, grave os comandos de E2E e componente na tabela do `REGRAS.md`.

**Despachar.**

- Um subagente por tarefa, pelo nome do time (`modo-deus:dev-back`, `modo-deus:qa-e2e`…), com `effort` igual ao `esforco` da tarefa. Este manual é a instrução explícita para definir o esforço.
- O prompt de cada tarefa leva: caminho absoluto da raiz do projeto, branch da feature, id, título, critérios de aceite completos, escopo, `pronto_quando`, `como_testar`, os comandos do `REGRAS.md` e, quando a tarefa tocar nisso, as Convenções, Integrações e Caminhos críticos que valem para ela. Nada de "veja o plano": o subagente começa do zero, numa worktree sem `graphify-out/` (ele usa o grafo da raiz).
- Prompt de QA não leva detalhes da implementação; leva só os critérios.
- Paralelize tarefas sem dependência. Marque `em_andamento` ao despachar.
- Se o agente do time não existir nesta instalação, pare e diga ao usuário qual falta; não faça a tarefa você mesmo.

**Ler a entrega.** Dev e QA terminam com um bloco ```json `{"tarefa", "status": "pronta"|"bloqueada", "branch", "commits", "arquivos", "testes", "observacoes"}`; o hook não deixa terminar sem ele.

- `pronta`: tarefa vai para `pronta` no plano. Se ela é `complexa`, revise cedo: antes de integrar, despache `modo-deus:revisor` só sobre ela (`git diff <feature>...<feature>-T<n>`, com os CAs dela). Reprovou: os itens voltam à tarefa e contam rodada. Tarefa simples segue direto. Teste de QA com `falhou_esperado` é normal enquanto a tarefa Dev correspondente não foi integrada.
- `bloqueada` por escopo ou território: decida (amplie o escopo, crie tarefa para o time dono, encadeie com `depende_de`) e despache de novo. Se a decisão muda o que o usuário aprovou, escale.
- `bloqueada` com `BUG:` em `observacoes` (QA achou bug): integre os testes e abra item para a tarefa Dev indicada; ela volta a `em_andamento`.
- `observacoes` pedindo algo a outro time (`data-cy`, export, rota de teste) vira item para esse time.

## 4–5 · Integração e regressão

- Junte as branches `<feature>-T<n>` das tarefas prontas na branch da feature (nunca na principal: o hook bloqueia). Conflito: devolva à tarefa mais recente, não resolva no código.
- Depois de integrar, o grafo da raiz fica atrás da feature: o `qa-regressao` reconstrói o dele na worktree, e para a Revisão passe ao `revisor` os símbolos alterados (`git diff --stat`), para ele não confiar só no grafo antigo.
- Depois de integrar, remova a worktree da tarefa (`git worktree remove <caminho>`) para que a branch `<feature>-T<n>` possa ser reaberta se a tarefa voltar da revisão.
- Rode a suíte do `REGRAS.md`. Falhou: item para o time dono, tarefa volta a `em_andamento`.
- Passo 5: despache `modo-deus:qa-regressao` com a raiz, a branch da feature, a principal, os símbolos alterados e as tarefas com escopo. Ele faz checkout destacado da feature, usa `graphify affected` para priorizar, roda todas as suítes e termina com `{"resultado": "verde"|"vermelho", "suites": [...], "falhas": [{"teste", "arquivo", "tarefa_provavel", "saida"}]}`. Vermelho: cada falha vira item para a `tarefa_provavel`; integre a correção e rode a regressão de novo. Só siga para a Revisão com verde.

## 6 · Revisão

- Despache `revisor` e `revisor-seguranca` em paralelo com: branch da feature, spec, plano e o diff (`git diff <principal>...<feature>`).
- Cada um termina com um bloco ```json `{"veredito": "aprovado"|"reprovado", "itens": [...]}`; o hook não deixa terminar sem ele.
- Passe aos revisores também as pastas de prints do `qa-regressao` (`.modo-deus/prints/`). Eles não abrem navegador.
- Só itens `alta` e `media` viram `itens_revisao` e voltam ao time dono; a tarefa sobe `rodadas_revisao` e passa a esforço high. Itens `baixa` não geram retrabalho nem tarefa nova: vão para a lista **Sugestões** do relatório final, com a `categoria`, e o usuário escolhe se quer.
- **Máximo de 2 rodadas por tarefa.** Na 3ª, `status: "escalado"`: pare e mostre ao usuário o que travou.
- Antes do PR, escreva o relatório final e despache `auditor-de-fatos` com ele. Afirmação `falsa` ou `nao_confirmada`: corrija o relatório (ou volte à tarefa) antes de seguir.

## 7 · PR

- Commit, push e PR: só no perfil `deus` ou se o usuário pediu. Nos outros perfis, entregue a branch pronta e a descrição do PR.
- Descrição do PR: o que mudou por CA, testes rodados com resultado real, o que não foi verificado. Passe pela skill `humanizer`.
- Merge na principal é do usuário. Sempre.

## Contrato com você mesmo

- Toda afirmação no relatório aponta para algo visto nesta sessão: arquivo:linha, comando e saída.
- Atualize `plano.json` a cada mudança de status; ele é a memória do trabalho e a base dos detectores.
- Não sabe? Diga que não verificou. Não invente caminho, comando nem resultado.
