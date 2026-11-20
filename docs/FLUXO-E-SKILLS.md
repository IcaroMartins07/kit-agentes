# Fluxo dos agentes, skills e o requisito de padrões e qualidade

Análise feita em 2026-11-18 sobre o kit `modo-deus` 0.2.0 (este repositório). As lacunas da seção 4 foram corrigidas na 0.3.0; o que mudou está na seção 5. Cada afirmação aponta o arquivo de onde saiu. Os caminhos são relativos à raiz do kit.

**O requisito analisado:** o kit deve sempre analisar os padrões do projeto e as regras vigentes, para manter a consistência do código. Também deve analisar as linguagens, tecnologias e integrações do projeto, seguindo os padrões dele. Ao desenvolver, testar e revisar, deve garantir segurança, qualidade, desempenho e clean code.

---

## 1. Fluxo de trabalho dos agentes

### 1.1 Quem existe

São 16 agentes, definidos em `kit.json` (chave `agentes`) e em `agents/`.

| Time | Agente | Modelo / esforço | Edita? | Arquivo |
|---|---|---|---|---|
| Maestro | `maestro` | opus / medium | só `.modo-deus/` | `agents/maestro/maestro.md` |
| Dev | `dev-front`, `dev-back`, `dev-db`, `dev-devops` | sonnet / medium (high se complexa) | só o próprio território, numa worktree | `agents/dev/*.md` |
| Dev sob demanda | `dev-mobile`, `dev-dados`, `dev-docs` | igual | igual; só entram se o projeto tiver sinais deles (`kit.json` → `sinais_sob_demanda`) | `agents/dev/*.md` |
| QA | `qa-unit`, `qa-integracao`, `qa-e2e`, `qa-ui`, `qa-regressao` | sonnet / medium (high se complexa) | só o território `testes` | `agents/qa/*.md` |
| Revisão | `revisor`, `revisor-seguranca` | sonnet / high | não (somente leitura) | `agents/review/*.md` |
| Revisão | `auditor-de-fatos` | haiku | não | `agents/review/auditor-de-fatos.md` |

### 1.2 Ordem: o pipeline de 7 passos

O pipeline está em `skills/proprias/modo-deus/SKILL.md`, na tabela "Pipeline" e nas seções 1 a 7.

1. **Spec** (Maestro e usuário): objetivo, critérios de aceite verificáveis (CA1, CA2…) e o que fica fora de escopo.
2. **Plano** (Maestro): o `.modo-deus/plano.json`, com tarefas por time, escopo de arquivos, classe (simples ou complexa) e esforço. O escopo sai de `graphify query/affected`. O plano é validado por `hooks/src/plano.mjs`. **Parada 1: o usuário aprova o plano.**
3. **Execução** (Dev e QA em paralelo): Dev implementa com TDD na branch `<feature>-T<n>`, cada um na sua worktree. QA escreve os testes de aceite a partir dos critérios, sem ler a implementação.
4. **Integração** (Maestro): junta as branches das tarefas na branch da feature e roda a suíte do `REGRAS.md`.
5. **Regressão** (`qa-regressao`): roda todas as suítes. Só segue com resultado verde.
6. **Revisão**: `revisor` e `revisor-seguranca` em paralelo sobre o diff. Depois, o `auditor-de-fatos` confere o relatório final. Cada tarefa tem no máximo 2 rodadas de revisão; na 3ª, o plano vira `escalado`.
7. **PR** (Maestro): descrição passada pela skill `humanizer`. Commit, push e PR só no perfil `deus` ou se o usuário pedir. **Parada 2: o merge é do usuário.**

Há duas formas de entrar no fluxo:

- `/deus <pedido>` (`commands/deus.md`), ou `claude --agent modo-deus:maestro` para a sessão inteira (`README.md`, seção "Usar").
- O fluxo manual, passo a passo: `/spec` → `/plan` → `/build` → `/review` → `/ship` (`commands/*.md`).

### 1.3 Como os agentes passam o trabalho adiante

- **Do Maestro para os times:** um prompt completo por tarefa (`modo-deus/SKILL.md`, seção 3 · Despacho). Ele leva:
  - a raiz do projeto e a branch da feature;
  - o id da tarefa e os critérios de aceite;
  - o escopo, o `pronto_quando` e o `como_testar`;
  - os comandos do `REGRAS.md`.

  O prompt de QA não leva detalhes da implementação.
- **Dos times para o Maestro:** um bloco JSON de entrega no fim da resposta: `{tarefa, status: pronta|bloqueada, branch, commits, arquivos, testes, observacoes}`. Exemplo em `agents/dev/dev-back.md`, seção "Entrega". O hook não deixa o agente terminar sem esse bloco (`hooks/src/evento.mjs`, SubagentStop).
  - `bloqueada` com `BUG:` vira item para o time Dev.
  - Um pedido a outro time (um `data-cy`, uma migração) vira tarefa nova.
- **Da revisão para o Maestro:** `{veredito, itens[]}`, e os itens vão para `itens_revisao` no plano (`agents/review/revisor.md`).
- **Do auditor para o Maestro:** `{afirmacoes[]}`, cada uma `confirmada`, `nao_confirmada` ou `falsa`, com a evidência (`agents/review/auditor-de-fatos.md`).
- **Memória compartilhada:** `.modo-deus/plano.json` guarda o status do plano e das tarefas. `.modo-deus/telemetria/*.jsonl` guarda o que cada agente rodou e é usado pelo auditor e pela retro.

### 1.4 Guardrails: os hooks que vigiam o fluxo

Os hooks estão ligados em `hooks/hooks.json`. Só agem em projetos com `.modo-deus/config.json`.

| Momento | Hook | O que faz |
|---|---|---|
| Início da sessão | `hooks/src/sessao.mjs` | Injeta `docs/modelos/CLAUDE.md` (regras gerais) e o `.modo-deus/REGRAS.md`, avisa campos sem preencher e reconstrói o grafo |
| Antes de cada ferramenta | `hooks/src/pre.mjs` | Na ordem: cerca (V9, `cerca.mjs`), território (V2, `territorio.mjs`), trava de fase (`trava.mjs`), contrato do plano e monitor (V1, V3, V7, V8, V10, V11, `vigia.mjs`) |
| Falha, início ou fim de subagente | `hooks/src/evento.mjs` | Telemetria, relógio do V8 e contrato de saída (V5, V6) |

- **Trava de fase** (`hooks/src/trava.mjs`, linhas 1–3, e `kit.json` → `trava`): editar código exige ter invocado uma skill de construção (`incremental-implementation`, `test-driven-development`, `frontend-ui-engineering`, `systematic-debugging`…). Abrir PR exige ter invocado `code-review-and-quality` e `humanizer`.
- **Regras V1–V11 e o que fazer em cada uma:** `skills/proprias/vigia/SKILL.md`, tabela "Por regra".
- **Perfis:** `leve`, `estrito` (o padrão) e `deus`; definem o que só alerta e o que bloqueia (`kit.json` → `perfis` e `monitor`).
- **Depois da sessão:** `/retro` com a skill `retrospectiva` transforma falhas reais em propostas, medidas por eval e aprovadas pelo usuário (`skills/proprias/retrospectiva/SKILL.md`).

---

## 2. Skills: o que fazem, quando e por quem

O que entra no kit está em `kit.json` → `skills.incluidas` e no manifesto `.claude-plugin/plugin.json`. Para cada skill, "Quem carrega" junta duas origens: o frontmatter `skills:` de cada agente (carga automática) e as menções no corpo dos agentes e dos comandos.

### 2.1 Skills do kit (`skills/terceiros/` e `skills/proprias/`)

| Skill | O que faz | Quando | Quem carrega |
|---|---|---|---|
| `modo-deus` (própria) | Manual do Maestro: pipeline, formato do `plano.json`, classificação de esforço, despacho e revisão | Sempre que o Maestro age; `/deus` | `maestro` (frontmatter) |
| `vigia` (própria) | O que fazer em cada alerta V1–V11 | Ao receber um alerta `[modo-deus · V<n>]` | Todos os 16 agentes (seção "Alertas do monitor" de cada `.md`); `/deus-status` |
| `qa-cypress` (própria) | Padrões de E2E e de componente com Cypress, cypress-axe e testes instáveis | Ao escrever, rodar ou configurar Cypress | `qa-e2e`, `qa-ui`, `qa-regressao`, `dev-devops` (frontmatter) |
| `retrospectiva` (própria) | Ciclo coleta → diagnóstico → proposta → eval → aprovação → aplicação | `/retro`, ou quando houver `retro/PENDENTE.json` | Maestro, depois da sessão (`commands/retro.md`) |
| `interview-me` | Entrevista até entender a intenção | Passo 1, pedido vago | Maestro (`modo-deus/SKILL.md`, seção 1) |
| `idea-refine` | Lapida uma ideia crua em opções | Passo 1 | Maestro (idem) |
| `spec-driven-development` | Spec com objetivo, critérios e riscos | Passo 1; `/spec` | `maestro` (frontmatter); `commands/spec.md` |
| `git-workflow-and-versioning` | Branches, commits e PR | Passos 3, 4 e 7 | `maestro` (frontmatter) |
| `incremental-implementation` | Entrega em fatias verificáveis | Passo 3 | `dev-front`, `dev-back`, `dev-db`, `dev-devops`, `dev-mobile`, `dev-dados` (frontmatter); `/build`. Também libera a trava de edição |
| `api-and-interface-design` | Contrato primeiro: entrada, saída, erros, compatibilidade | Passo 3, back | `dev-back` (frontmatter) |
| `security-and-hardening` | Validação na borda, autorização, segredos | Passos 3 e 6 | `dev-back`, `dev-db`, `revisor-seguranca` (frontmatter) |
| `source-driven-development` | Basear a decisão na documentação oficial | Passo 3, biblioteca pouco conhecida | `dev-mobile`, `dev-dados` (frontmatter); citada no corpo de `dev-front` e `dev-back` |
| `frontend-ui-engineering` | UI acessível, com estados e responsiva | Passo 3, front | `dev-front` (frontmatter). Libera a trava |
| `impeccable`, `design-taste-frontend` | Direção visual e polimento | Passo 3, tela nova ou redesenho | `dev-front` (corpo, seção "Foco do front"); `impeccable` também de `qa-ui` em `kit.json` |
| `ci-cd-and-automation` | Pipeline, CI e deploy | Passo 3, devops | `dev-devops` (frontmatter) |
| `documentation-and-adrs` | Docs e ADRs | Passo 3, docs | `dev-docs` (frontmatter) |
| `humanizer` | Tira a cara de IA do texto | Passo 7 (PR); docs | `dev-docs` (frontmatter); Maestro no PR; `/ship`. Exigida pela trava para abrir PR |
| `code-review-and-quality` | Revisão em 5 eixos: correção, legibilidade, arquitetura, segurança e desempenho | Passo 6; `/review` | `revisor` (frontmatter). Exigida pela trava para abrir PR |
| `ponytail-audit` | Auditoria de excesso: o que cortar, juntar ou separar | Passo 6; `/auditar` | `revisor` (frontmatter); `commands/auditar.md` |
| `playwright-skill` | Abrir a tela e reproduzir um bug no navegador | Passo 3, QA antes de escrever o teste | `qa-e2e`, `qa-ui` (corpo, linhas 33 e 37) |
| `shipping-and-launch` | Checklist de lançamento | Passo 7; `/ship` | `commands/ship.md`; `kit.json` diz Maestro e `dev-devops` |

### 2.2 Skills do plugin superpowers (dependência, `kit.json` → `do_superpowers`)

| Skill | Quando | Quem |
|---|---|---|
| `test-driven-development` | Passo 3: teste que falha, código mínimo, refatoração | Dev (frontmatter, menos `dev-devops` e `dev-docs`), `qa-unit`, `qa-integracao`; `/build` |
| `verification-before-completion` | Antes de entregar: rodar testes, lint e tipos depois da última edição | Todos os Dev e QA (frontmatter) |
| `systematic-debugging` | Bug sem causa óbvia, ou alerta V7 (loop) | Corpo de todos os Dev; `vigia`; `/build` |
| `brainstorming` | Passo 1, ideia nova | Maestro |
| `writing-plans` / `executing-plans` | `/plan` e `/build` no fluxo manual | Usuário, pelos comandos |
| `subagent-driven-development`, `using-git-worktrees` | Passo 3, despacho e worktrees | Maestro |
| `writing-skills` | Retro, ao propor uma skill nova | Maestro (retro) |

### 2.3 Plugins e conectores citados no fluxo

- `frontend-design` e `figma`: `dev-front`, seção "Foco do front".
- `claude-security`: varredura profunda, que o `revisor-seguranca` recomenda ao usuário.
- `perplexity`: Maestro, passo 1, quando a informação precisa ser atual da web.
- `agent-browser`: QA, como alternativa ao Playwright.

A lista com instalação está em `hooks/conectores.json`.

### 2.4 Excluídas de propósito (`kit.json` → `excluidas`)

| Skill | Coberta por |
|---|---|
| `test-driven-development` (agent-skills) | superpowers |
| `debugging-and-error-recovery` | `superpowers:systematic-debugging` |
| `planning-and-task-breakdown` | `superpowers:writing-plans` |
| `using-agent-skills` | `modo-deus` |
| `caveman` | ponytail |

### 2.5 Skills desta máquina que não fazem parte do kit

Estas estão em `~/.claude/skills` mas o kit não as usa: `orca-cli`, `orca-computer-use`, `orchestration`, `maestri*`, `graphify` e `flow-handoff`.

- `graphify` é usada pelos agentes como **CLI** (`graphify query/affected`), não como skill.
- `flow-handoff` é de outro fluxo, o `.flow/` (Context → Developer → QA → Review), e não é citada em nenhum arquivo do kit.
- As quatro excluídas da seção 2.4 também estão instaladas aí, o que contradiz a exclusão.

---

## 3. Onde o kit já cumpre o requisito

### 3.1 Analisar padrões, regras vigentes, linguagens, tecnologias e integrações

| O que | Onde está definido |
|---|---|
| Regras gerais de convenção: seguir organização, nomes, bibliotecas e estilo existentes; usar o linter e o runner do projeto; não trazer ferramentas concorrentes nem dependências sem necessidade | `docs/modelos/CLAUDE.md`, §2 Convenções e §3 Arquitetura, injetadas na sessão por `hooks/src/sessao.mjs:20` |
| Stack, comandos (teste, lint, tipos) e territórios detectados no projeto e gravados no `REGRAS.md` | `instalar.mjs`, função `detectar` (linhas 152–230); modelo em `docs/modelos/REGRAS.md` (seções Stack, Comandos, Convenções, DoD, Não fazer) |
| Todo Dev e QA lê o `REGRAS.md` antes de tocar no código | Passo 2 "Regras" de cada `agents/dev/*.md` e `agents/qa/*.md` |
| Mapa do projeto antes de editar: `graphify query/affected` para achar o código vizinho e o impacto | `docs/modelos/CLAUDE.md` §13; passo 3 "Mapa" de cada agente; `modo-deus/SKILL.md`, seção 2 |
| Front: usar os componentes, tokens e padrões que o projeto já tem | `agents/dev/dev-front.md:35` |
| Comando inventado vira alerta (só valem os do `REGRAS.md` e do manifesto) | V4 em `skills/proprias/vigia/SKILL.md`; `docs/modelos/REGRAS.md`, seção Comandos |
| Biblioteca desconhecida: consultar a doc oficial | `source-driven-development` (seção 2.1) |
| Reaproveitar o que existe antes de criar | `commands/build.md` (linha "procure o que já existe") |

### 3.2 Segurança

| Etapa | Onde |
|---|---|
| Regras gerais: segredos, entrada e saída, autenticação, dependências | `docs/modelos/CLAUDE.md` §6 |
| Desenvolvimento | `security-and-hardening` em `dev-back` e `dev-db`; "Foco do back" em `dev-back.md` (validar na borda, autorização por recurso, segredo por variável de ambiente); segredos em `dev-devops.md:30` |
| Teste | Caminho negativo obrigatório (entrada inválida, acesso negado, recurso de outro usuário) em `docs/modelos/CLAUDE.md` §8; acessibilidade com cypress-axe em `qa-ui` |
| Revisão | `agents/review/revisor-seguranca.md` (injeção, IDOR, mass assignment, segredo e dado pessoal em log, CSRF/CORS, upload, dependência suspeita); eixo de segurança do `code-review-and-quality` |
| Bloqueio duro | Cerca V9 (push forçado, deploy, segredo) em `hooks/src/cerca.mjs`; deny-list `hooks/settings.deny.json` |

### 3.3 Qualidade e clean code

| Etapa | Onde |
|---|---|
| Regras gerais | `docs/modelos/CLAUDE.md` §4 Qualidade de código (nomes, funções pequenas, sem código morto, tipagem forte, estados de borda) e §5 Tratamento de erros |
| Desenvolvimento | TDD obrigatório pela trava (`hooks/src/trava.mjs`); `incremental-implementation`; `/build` contra abstração e dependência sem pedido |
| Teste | `verification-before-completion`; V5 ("pronto" sem prova) e V6 (afirmação sem lastro); V10 (teste moldado ao código); DoD do `REGRAS.md` |
| Revisão | `revisor` com `code-review-and-quality` (legibilidade, arquitetura, "segue os padrões existentes?") e `ponytail-audit` (código desnecessário); `auditor-de-fatos` |

### 3.4 Desempenho

| Etapa | Onde |
|---|---|
| Regras gerais | `docs/modelos/CLAUDE.md` §7 Banco de dados e performance (sem N+1, paginação, índices, transações, "meça antes de otimizar") |
| Revisão | Eixo 5 "Performance" de `skills/terceiros/agent-skills/code-review-and-quality/SKILL.md` (linha 77) |

---

## 4. Lacunas encontradas na 0.2.0 (todas corrigidas na 0.3.0, ver seção 5)

Ordenadas por impacto.

| # | Lacuna | Situação | Evidência |
|---|---|---|---|
| L1 | **Os subagentes provavelmente não recebem o `CLAUDE.md` base.** As regras de convenção, qualidade, segurança e desempenho (§2–§8) são injetadas só no `SessionStart` da sessão principal. Os agentes Dev, QA e Revisão leem só o `REGRAS.md`, e o próprio `REGRAS.md` diz "não repita aqui" o que está no base. | Parcial. A confirmar com um teste real: o contexto injetado por hook na sessão principal não costuma passar para o subagente | `hooks/src/sessao.mjs:20`; `hooks/src/evento.mjs:40` (o SubagentStart só liga o relógio do V8); nenhum `agents/*.md` manda ler o `CLAUDE.md`; `docs/modelos/REGRAS.md:3` |
| L2 | **Nenhuma etapa analisa os padrões de verdade do código.** O kit detecta stack e comandos, mas não lê a config do linter e do formatador, não descobre convenções de nomes e pastas, nem padrões de erro, log e camadas. A seção "Convenções do projeto" do `REGRAS.md` fica com placeholders. Nenhum agente tem o passo "leia 2 ou 3 arquivos vizinhos e imite". | Não atende | `instalar.mjs` `detectar` (só stack, comandos, territórios, Cypress, runner); `docs/modelos/REGRAS.md`, seção Convenções |
| L3 | **Integrações não são analisadas.** Nada detecta nem registra serviços externos (APIs, OAuth, filas, pagamento, variáveis de ambiente usadas). Só `dev-back` diz "serviço externo nos testes: simulado". | Não atende | `instalar.mjs` `detectar`; `agents/dev/dev-back.md`, "Foco do back" |
| L4 | **Desempenho não tem dono.** A skill `performance-optimization` está vendorizada em `skills/terceiros/agent-skills/`, mas não está em `kit.json` nem no `plugin.json`. Nenhum agente Dev ou QA a carrega. Não há teste de desempenho, orçamento (bundle, Web Vitals, tempo de query), nem item de desempenho no DoD. Na revisão, só o eixo genérico da skill de review. | Parcial (só regra geral e revisão) | `kit.json` → `skills.incluidas`; `grep` sem resultados de desempenho em `agents/`; `docs/modelos/REGRAS.md`, DoD |
| L5 | **Segurança desigual no desenvolvimento.** `security-and-hardening` só está em `dev-back` e `dev-db`. `dev-front` (XSS, dados no cliente), `dev-mobile` (armazenamento, deep links), `dev-devops` (CI, segredos, imagens) e `dev-dados` não a carregam. Nenhum QA tem a tarefa de escrever testes de segurança (autorização negada, IDOR); isso depende da regra geral da L1. Não há auditoria de dependências (`npm audit` ou similar) em nenhuma etapa. | Parcial | Frontmatter de `agents/dev/*.md` e `agents/qa/*.md`; `docs/modelos/CLAUDE.md` §6 "quando houver ferramenta" |
| L6 | **Clean code só é cobrado na revisão.** `code-simplification` está vendorizada e não incluída. O passo de refatorar do TDD existe, mas nenhum Dev roda uma checagem de simplicidade antes de entregar. QA não tem regra de qualidade do próprio código de teste além do `qa-cypress`. | Parcial | `skills/terceiros/agent-skills/code-simplification`; `kit.json` |
| L7 | **O revisor não confere a consistência com o projeto de forma explícita.** O passo a passo de `revisor.md` olha critérios, testes, lint e excesso. Não pede para comparar o diff com o padrão dos arquivos vizinhos nem com as Convenções do `REGRAS.md`; isso só aparece dentro da skill (linha 55, "Does it follow existing patterns"). | Parcial | `agents/review/revisor.md`, passos 1–5 |
| L8 | **O fluxo manual tem menos proteção que o `/deus`.** `/spec`, `/plan` e `/build` não carregam `security-and-hardening` nem mandam ler as convenções. O `/review` não cita desempenho. | Parcial | `commands/*.md` |
| L9 | **O kit não está instalado nesta máquina.** `modo-deus@kit-agentes` não aparece em `claude plugin list`. Sem ele, nenhum agente, hook ou trava funciona. As skills em `~/.claude/skills` são cópias soltas, inclusive as que o kit exclui (seção 2.5). | Ambiente | `claude plugin list` (2026-11-18); `README.md`, "Status: falta o uso real" |

### Resumo

| Parte do requisito | Desenvolvimento | Teste | Revisão |
|---|---|---|---|
| Padrões e regras do projeto | Parcial (L1, L2) | Parcial (L1) | Parcial (L7) |
| Linguagens e tecnologias | Atende (detecção da stack, `source-driven`) | Atende | Atende |
| Integrações | Não atende (L3) | Parcial (mock no back) | Não atende (L3) |
| Segurança | Parcial (L5) | Parcial (L5) | Atende |
| Qualidade e clean code | Parcial (L6) | Atende (V5, V6, V10, DoD) | Atende |
| Desempenho | Parcial (L4) | Não atende (L4) | Parcial (L4) |

---

## 5. Correções aplicadas na 0.3.0 (2026-11-18)

| # | O que mudou | Onde |
|---|---|---|
| L1 | As regras gerais chegam aos subagentes por dois caminhos. O `SubagentStart` injeta o `CLAUDE.md` base em todo agente `modo-deus:*`. A sessão grava a mesma base em `.modo-deus/REGRAS-GERAIS.md`, e todo Dev e QA lê esse arquivo no passo "Regras". | `hooks/src/evento.mjs` (bloco "regras gerais do kit para o subagente"); `hooks/src/sessao.mjs`; passo 2 de `agents/dev/*.md` e `agents/qa/*.md`; teste em `testes/hooks.test.mjs` |
| L2 | O instalador detecta as convenções: ESLint, Prettier, Biome, EditorConfig, Ruff, Black, mypy, flake8, golangci-lint, rustfmt, Dart analyzer, Stylelint, TypeScript strict, husky, lint-staged e commitlint. O resultado vai para a seção "Convenções do projeto" do `REGRAS.md`. O `CLAUDE.md` base §2 manda ler 2 ou 3 arquivos vizinhos e imitar. Cada Dev ganhou o passo **Padrões** no passo 3. O Maestro preenche o que ficou aberto (passo 0 do Plano). | `instalar.mjs` (`CONFIGS`, `detectar`); `docs/modelos/REGRAS.md`; `docs/modelos/CLAUDE.md` §2; `skills/proprias/modo-deus/SKILL.md`, seção 2, passo 0 |
| L3 | O instalador detecta SDKs de serviços externos (Node e Python) e os nomes das variáveis do `.env.example`, nunca os valores. Eles vão para a nova seção "Integrações" do `REGRAS.md`. O `CLAUDE.md` base §6 traz a regra de integração: cliente do projeto, credencial por ambiente, timeout e simulação em teste. O `revisor-seguranca` confere integrações novas. | `instalar.mjs` (`INTEGRACOES_NODE`, `INTEGRACOES_PY`); `agents/review/revisor-seguranca.md`, passo 5; teste em `testes/instalador.test.mjs` |
| L4 | A skill `performance-optimization` entrou no kit e foi para `dev-front`, `dev-back`, `dev-db` e `revisor`. O `REGRAS.md` ganhou a seção "Desempenho" (caminhos críticos e orçamentos) e um item no DoD. O `qa-regressao` roda o orçamento quando há comando para ele. O `revisor` tem o passo 6, Desempenho. | `kit.json`; `.claude-plugin/plugin.json`; "Foco" dos agentes Dev; `agents/qa/qa-regressao.md`; `agents/review/revisor.md` |
| L5 | `security-and-hardening` agora está em todos os Dev de código: `dev-front`, `dev-devops`, `dev-mobile` e `dev-dados` foram somados a `dev-back` e `dev-db`, cada um com regras do próprio território. QA de unidade, integração, E2E e UI cobram o caminho negativo de segurança. O comando **Auditoria** de dependências passou a ser detectado e é rodado pelo Dev, pelo `revisor-seguranca` e no `/ship`. Vulnerabilidade alta nova bloqueia. | Frontmatter e "Foco" de `agents/dev/*.md`; seção "Padrões e segurança nos testes" de `agents/qa/*.md`; `agents/review/revisor-seguranca.md`, passo 4; DoD do `REGRAS.md` |
| L6 | A skill `code-simplification` entrou no kit. Todo Dev de código a usa antes de rodar a verificação final, e o `CLAUDE.md` base §4 cobra o mesmo. | Passo 6 de `agents/dev/*.md`; `docs/modelos/CLAUDE.md` §4 |
| L7 | O `revisor` ganhou o passo 5, **Consistência com o projeto**: compara o diff com as Convenções, a config do linter e os arquivos vizinhos, com gravidade definida. | `agents/review/revisor.md` |
| L8 | `/spec`, `/plan`, `/build`, `/review` e `/ship` agora cobram a análise do projeto, segurança, desempenho, simplificação e auditoria. | `commands/*.md` |
| L9 | `modo-deus@kit-agentes` 0.3.0 está instalado nesta máquina (escopo user). As quatro skills soltas que o kit exclui foram movidas para `~/.claude/skills-desativadas`: `debugging-and-error-recovery`, `planning-and-task-breakdown`, `using-agent-skills` e `test-driven-development`. Dá para religar cada uma na aba Skill do painel. | `claude plugin list`; `~/.claude/skills-desativadas/` |

### O que ainda depende de uso real

- O `additionalContext` do `SubagentStart` foi testado no hook (`testes/hooks.test.mjs`), mas não numa sessão real do Claude Code. Se o app ignorar esse campo, o passo "Regras" de cada agente ainda manda ler `.modo-deus/REGRAS-GERAIS.md`.
- A detecção cobre as ferramentas e os SDKs mais comuns. Serviço chamado só por HTTP, sem SDK, não é detectado: fica para o Maestro completar no passo 0 do Plano.
- Orçamento de desempenho só é medido quando o projeto define um comando para ele. Sem comando, o desempenho é cobrado pela revisão e pela entrega, não por medição automática.

---

## 6. Melhorias do fluxo na 0.4.0 (2026-11-18)

| Melhoria | O que mudou | Onde |
|---|---|---|
| Contexto enxuto | Cada agente pré-carrega só as skills que usa sempre. Segurança, desempenho e simplificação são invocadas quando a tarefa pede. O `REGRAS-GERAIS.md` só é lido se as regras gerais não vieram no contexto. | Frontmatter e "Foco" de `agents/dev/*.md` e `agents/review/revisor.md`; passo 2 de Dev e QA |
| Contrato Dev/QA | Critério com Dev e QA em paralelo ganha `contrato: { ids_teste, api }`. O validador recusa o plano sem ele, Dev implementa exatamente o contrato e QA testa por ele. | `hooks/src/plano.mjs`; `skills/proprias/modo-deus/SKILL.md`, Plano passo 5 e exemplo; passo 4 dos Dev; QAs |
| V12 | Entrega `pronta` que muda manifesto ou lockfile sem rodar auditoria: alerta no estrito, bloqueio no deus. | `hooks/src/vigia.mjs`; `kit.json`, `bloqueia_no_deus`; `skills/proprias/vigia/SKILL.md` |
| Segredos e desempenho como comando | A tabela Comandos do `REGRAS.md` ganhou Desempenho e Segredos, detectados pelos scripts do projeto. Quando não são detectados, ficam como `<a definir>`. O `revisor-seguranca` roda Segredos, o `qa-regressao` roda Desempenho e o `/ship` roda os dois. | `instalar.mjs`; `agents/review/revisor-seguranca.md`, passo 4; `agents/qa/qa-regressao.md`; `commands/ship.md` |
| Revisão cedo | Tarefa `complexa` é revisada sozinha, na branch dela, antes da integração. | `skills/proprias/modo-deus/SKILL.md`, "Ler a entrega" |
| Caminho rápido | Uma tarefa simples, num território, sem integração nem dependência, passa por spec e plano numa só aprovação, Dev com TDD e revisor. Ela sai do caminho rápido se crescer ou se for reprovada. | `skills/proprias/modo-deus/SKILL.md`, "Caminho rápido" |
| Grafo da feature | O `qa-regressao` reconstrói o grafo na própria worktree, e o Maestro passa ao revisor os símbolos alterados. | `agents/qa/qa-regressao.md`, passo 3; manual do Maestro, seções 4–5 |
| Convenções em dia | O `doctor` avisa quando o projeto ganhou uma convenção que não está no `REGRAS.md`. | `instalar.mjs`, `doctor` |
| **Autoaprimoramento** | Cada item da Revisão tem uma `categoria` (padrão, segurança, desempenho, correção, teste, escopo ou legibilidade). A retro agrupa os itens por time e categoria. A nova causa `revisao_recorrente` aponta qual skill ou passo deveria ter evitado o problema; por exemplo, padrão leva ao passo Padrões, e desempenho leva a `performance-optimization`. V12 entra em `passo_pulado`. Três evals novos medem antes e depois. | `hooks/src/retro.mjs` (`ALVO_DA_CATEGORIA`, `revisaoPorAlvo`); `skills/proprias/retrospectiva/SKILL.md`; revisores; `testes/evals/modo-deus/{contrato-dev-qa,caminho-rapido,desempenho-caminho-critico}` |
| Skills duplicadas | 14 skills soltas em `~/.claude/skills` que o plugin já traz foram para `~/.claude/skills-desativadas`. Ficaram em `~/.claude/skills` só as de fora do kit: orca, maestri, graphify, flow-handoff e synced. | `node instalar.mjs doctor` sem aviso de duplicadas |

Os 263 testes passam e a validação estrita do plugin também. O kit 0.4.0 está instalado e passa a valer depois de reiniciar o app.

---

## 7. Mais rápido e mais barato na 0.7.0 (2026-11-19)

O teste real num portfólio levou horas e muitos tokens. A telemetria mostrou para onde foram: 5 rodadas de revisão de 11 a 15 min, cada uma rodando de 13 a 22 scripts de navegador; 13 instalações de dependências e 11 servidores subidos; 11 dos 15 itens de revisão eram "baixa" e mesmo assim geraram retrabalho; 33 bloqueios de território por um plano com arquivo no time errado; e o painel somando a releitura de cache aos tokens.

| Mudança | Onde |
|---|---|
| O revisor não abre navegador: lê o diff e os prints que o `qa-regressao` tira uma vez, em três larguras | `agents/review/revisor.md` (passo 3), `agents/qa/qa-regressao.md` (passo 7), `hooks/ferramentas/prints.mjs` |
| Item `baixa` não reprova nem volta ao Dev: vira Sugestão no relatório final | `agents/review/revisor.md`, `skills/proprias/modo-deus/SKILL.md` (seção 6) |
| Dependências da worktree por link às da raiz; Dev de front sem servidor só para olhar a tela | passo 2 de Dev e QA, "Foco do front"; `node_modules` no exclude do projeto |
| Direção visual antes de codar (`.modo-deus/design.md`, escrita pelo Maestro com as skills de design) e crítica dos prints contra ela | `skills/proprias/modo-deus/SKILL.md` (Plano, passo 4b), `agents/dev/dev-front.md`, `agents/review/revisor.md`; categoria `visual` em `hooks/src/plano.mjs` e `hooks/src/retro.mjs` |
| O validador recusa escopo fora do território do time | `hooks/src/plano.mjs` (`escopoForaDoTerritorio`), `hooks/src/plano-hook.mjs` |
| Pedido amplo vira entregas menores; polimento visual sem mudar contrato é `simples` | `skills/proprias/modo-deus/SKILL.md` (Spec e Plano), `kit.json` |
| Painel com tokens novos e cache separados; skills invocadas na telemetria | `mods/kit/painel-agentes/hooks/register.tsx`, `hooks/hooks.json`, `hooks/src/pre.mjs` |

