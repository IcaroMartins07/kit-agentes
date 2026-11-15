# Plano de implementação: kit-agentes / modo-deus

Versão 0.4 · 2026-11-15 · status: **F0 a F7 implementadas**; pendente só o que exige uso real (seção 9)

Mudanças da 0.1: organização em **times** (Maestro, Desenvolvimento, QA, Revisão) com modelo e esforço por papel, Cypress para E2E, e autonomia, skills, monitoramento e fases reorganizados em torno dos times.

## 1. Objetivo

Transformar o `fluxo-agentes` (v1) num kit completo (v2) em que:

1. um **Maestro** recebe o pedido, planeja e divide o trabalho entre times especializados;
2. os times trabalham com **autonomia alta**, cada um dentro do seu território;
3. guardrails **cercam** essa autonomia sem depender da boa vontade do modelo;
4. um **monitor** acompanha cada agente e subagente para barrar fuga de escopo e alucinação;
5. as skills **se aprimoram** a partir das falhas reais, com sua aprovação;
6. tudo é distribuído como **plugin do Claude Code**, mais um instalador para a parte por projeto.

## 2. Times

```
                         Você
                          │  pedido · aprova o plano · aprova o merge
                          ▼
                ┌───────────────────┐
                │      MAESTRO      │  Opus 5.5 · médio
                │ spec · plano ·    │  não escreve código
                │ divisão · escopo  │
                └─────────┬─────────┘
          ┌───────────────┼────────────────┐
          ▼               ▼                ▼
 ┌────────────────┐ ┌──────────────┐ ┌──────────────────┐
 │ DESENVOLVIMENTO│ │      QA      │ │     REVISÃO      │
 │ Sonnet 5.5     │ │ Sonnet 5.5   │ │ Sonnet 5.5 · alto│
 │ médio | alto   │ │ médio | alto │ │ só leitura       │
 │ front · back · │ │ unit · integ │ │ código · segur.  │
 │ db · devops    │ │ UI · E2E ·   │ │ · fatos          │
 │                │ │ regressão    │ │                  │
 └────────────────┘ └──────────────┘ └──────────────────┘
```

### 2.1 Maestro: Opus 5.5, esforço médio

Roda como **agente principal** da sessão (`claude --agent modo-deus:maestro` ou `/deus`).

- Conduz a spec com você e fecha os critérios de aceite.
- Quebra o trabalho em tarefas pequenas, cada uma com time dono, escopo de arquivos, critério de pronto e **classe de complexidade** (abaixo).
- Grava `plano.json`: tarefas, dependências, escopo, esforço. É a fonte da verdade dos detectores de fuga.
- Despacha os times (em paralelo quando não há dependência), integra os resultados, resolve conflitos entre times e devolve o PR.
- Não edita código. Só escreve em `.claude/modo-deus/`.

**Classe de complexidade → esforço** (o Maestro aplica; a regra fica na skill `modo-deus` e pode ser corrigida pela retro):

| Classe | Exemplos | Esforço Dev/QA |
|---|---|---|
| Simples | ajuste de texto/estilo, campo novo em formulário, endpoint CRUD seguindo padrão existente, teste unitário de função pura | **médio** |
| Complexa | mudança de contrato entre camadas, migração de dados, concorrência/cache, autenticação/autorização, bug sem causa óbvia, refatoração que cruza módulos, pipeline de CI/deploy | **alto** |

Na dúvida, alto. Tarefa que falhou na revisão volta com esforço alto.

### 2.2 Desenvolvimento: Sonnet 5.5, médio ou alto

Um agente por especialidade; cada um só pode editar o território dele (definido no `REGRAS.md` do projeto, com padrão sugerido pelo instalador).

| Agente | Território típico | Skills principais |
|---|---|---|
| `dev-front` | componentes, páginas, estilos, estado de UI | `frontend-ui-engineering`, `impeccable`, `design-taste-frontend`, `frontend-design` |
| `dev-back` | rotas, serviços, regras de negócio, integrações | `incremental-implementation`, `api-and-interface-design`, `source-driven-development` |
| `dev-db` | schema, migrações, seeds, queries, índices | `incremental-implementation`, `security-and-hardening` (RLS, injeção) |
| `dev-devops` | CI/CD, Docker, IaC, scripts de build, variáveis de ambiente | `ci-cd-and-automation`, `shipping-and-launch` |

Comuns a todos: `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `superpowers:verification-before-completion`.

**Times sob demanda.** Também vêm de fábrica, mas ficam dormentes: só entram quando o projeto ou a tarefa precisa deles.

| Agente | Território típico | Acende quando |
|---|---|---|
| `dev-mobile` | app React Native, Flutter, Android, iOS | o projeto tem `android/`, `ios/`, `pubspec.yaml`, `app.json` do Expo e similares, **e** a tarefa toca essas pastas |
| `dev-dados` | pipelines, ETL, notebooks, modelos de ML | o projeto tem `dbt_project.yml`, DAGs do Airflow, `*.ipynb`, `requirements` com pandas, sklearn ou torch, **e** a tarefa toca isso |
| `dev-docs` | README, ADRs, docs de API, changelog | a tarefa muda contrato público, configuração, comando ou comportamento visível |

- O instalador detecta os sinais e registra os times disponíveis no `REGRAS.md`; você pode forçar ligado ou desligado ali.
- O Maestro só despacha um time sob demanda quando uma tarefa do plano cai no território dele. Projeto sem app não carrega `dev-mobile`.
- O QA acompanha: tarefa de `dev-mobile` usa `qa-e2e` com o runner mobile do projeto (Detox/Maestro), já que Cypress não cobre app nativo.

### 2.3 QA: Sonnet 5.5, médio ou alto

| Agente | Tipo de teste | Ferramenta |
|---|---|---|
| `qa-unit` | unitários | o runner do projeto (Vitest, Jest, pytest…) |
| `qa-integracao` | integração entre camadas, API com banco de teste | runner do projeto + contêiner/banco descartável |
| `qa-e2e` | fluxos de ponta a ponta | **Cypress** |
| `qa-ui` | componentes, visual, acessibilidade | Cypress Component Testing + `cypress-axe`; screenshots para comparação |
| `qa-regressao` | suíte completa antes do PR; mantém a suíte de regressão | todos os acima |

- O QA escreve os testes de aceite **a partir dos critérios do Maestro, em paralelo com o Dev**, sem ver a implementação primeiro: o teste não é moldado ao código.
- Cypress é o padrão de E2E. Se o projeto não tiver, o instalador oferece configurar (`cypress.config`, pasta `cypress/`, script `test:e2e`); nunca instala sem você confirmar. `playwright-skill` e `agent-browser` ficam para exploração rápida e reprodução de bug, não para a suíte.
- QA só edita arquivos de teste e fixtures. Achou bug: abre item no `plano.json` para o Dev, não corrige o código.

### 2.4 Revisão: Sonnet 5.5, alto

| Agente | Papel | Modelo |
|---|---|---|
| `revisor` | revisão de código contra spec, plano e DoD; decide aprovar ou devolver | Sonnet 5.5 · alto |
| `revisor-seguranca` | delega ao `claude-security` no diff | Sonnet 5.5 · alto |
| `auditor-de-fatos` | confere toda afirmação do relatório final (arquivo, linha, teste, resultado) contra o repositório e a transcrição | Haiku 5.5 |

Revisão é só leitura. Devolve itens para Dev ou QA via `plano.json`; até 2 rodadas por tarefa, na 3ª o Maestro escala para você.

## 3. Pipeline do `/deus`

1. **Spec**: Maestro conversa com você e fecha critérios de aceite.
2. **Plano**: Maestro gera `plano.json`. **Você aprova** (ponto de parada 1).
3. **Execução** em paralelo, cada tarefa numa worktree: Dev implementa; QA escreve os testes de aceite ao mesmo tempo.
4. **Integração**: Maestro junta as branches das tarefas na branch da feature e roda a suíte.
5. **QA-regressão** roda tudo (unit, integração, E2E Cypress, UI).
6. **Revisão**: revisor, segurança e auditor de fatos. Reprovado → volta ao passo 3 só para os itens apontados.
7. **PR** aberto pelo Maestro, com texto passado pelo `humanizer`. **Você faz o merge** (ponto de parada 2).

## 4. Autonomia

| Pode sem perguntar | Pede você | Bloqueado sempre |
|---|---|---|
| Criar branch/worktree, editar dentro do território, rodar testes, lint, build, Cypress | Aprovar o plano | `push --force`, `reset --hard`, `clean -fd`, apagar fora do repositório |
| Commitar na branch da feature, abrir PR | Merge na branch principal | Ler `.env`, chaves, `.pem`; gravar segredo em arquivo |
| Despachar e reiniciar subagentes | Instalar dependência nova ou ferramenta (ex.: Cypress) | Deploy, publicação, mensagem externa |
| Ampliar escopo **dentro do território do time** | Ampliar escopo para fora do território | Tocar migração já aplicada em produção |

Perfis: `leve` (só trava de fase), `estrito` (v1 + cercas), `deus` (tabela acima + monitor completo).

## 5. Divisão de skills

- **Um dono por fase e por time.** Duplicatas saem: as cópias de TDD, debugging e planning do agent-skills dão lugar às do `superpowers`.
- **Skills por agente, não globais.** Cada agente declara as suas no frontmatter; o contexto de cada um carrega só o que usa. Na sessão principal fica só a orquestradora.
- **Skills próprias do kit:** `modo-deus` (pipeline, regras de divisão e esforço), `vigia` (como reagir aos alertas), `retrospectiva` (autoaprimoramento), `qa-cypress` (padrões de E2E e componente, seletores `data-cy`, sem `wait` fixo, fixtures, interceptação de rede).
- **Plugins obrigatórios:** `superpowers`, `claude-security`, `frontend-design`. Instalados por `node instalar.mjs dependencias`.
- **Ficam de fora:** caveman (coberto pelo ponytail), `claude-code-setup` (por enquanto) e `_legado/` inteiro.

### 5.1 Mapa do projeto: graphify

O graphify é a base de mapeamento de todos os agentes e a principal economia de tokens do kit.

- O instalador monta `graphify-out/` no projeto com `graphify update .`: só código, por AST, sem LLM, em segundos. Fica fora do git (exclude).
- Regra para todos os agentes (`CLAUDE.md` base, seção 13): consultar o grafo (`query`, `explain`, `path`, `affected`, `god-nodes`) **antes** de varrer pastas; ler só o que o grafo apontou; confirmar no código.
- Maestro usa `god-nodes` e `affected` para montar o escopo; QA usa `affected` para escolher a regressão; Revisão usa `affected` para achar consumidores fora do plano.
- Os hooks git do graphify **não** são usados: alteram o `.gitattributes`, que é versionado. O hook de início de sessão do kit (F2) reconstrói o grafo quando está mais velho que o último commit, e o monitor (F5) mede quantas leituras o grafo evitou.
- Na F6, `graphify save-result` e `graphify reflect` alimentam a retrospectiva com as consultas que foram úteis ou becos sem saída.

## 6. Monitoramento

### 6.1 Registro

Cada evento de hook vira uma linha JSONL em `.claude/modo-deus/telemetria/`: `ts, sessao, time, agente, tarefa, evento, ferramenta, alvo, resultado, duracao_ms, alerta?`.
Eventos: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `PostCompact`. Os hooks do Orca no seu `settings.json` global continuam; os do kit somam.

### 6.2 Detectores

| # | Risco | Detector | Ação |
|---|---|---|---|
| V1 | **Fuga de escopo** | edição fora do escopo da tarefa no `plano.json` | bloqueia, explica como pedir ampliação ao Maestro |
| V2 | **Fuga de território** | Dev-front editando migração, QA editando código de produção, Revisor tentando editar | bloqueia (também garantido por `tools:` no frontmatter) |
| V3 | **Alucinação de arquivo/símbolo** | caminho inexistente, `old_string` não encontrado, import de pacote ausente | alerta; 3 no mesmo turno → bloqueia e manda buscar |
| V4 | **Alucinação de comando** | script fora do `package.json`/`REGRAS.md`, "command not found" | alerta com os comandos reais |
| V5 | **"Pronto" sem prova** | subagente encerra sem rodar os testes do território após a última edição | `SubagentStop`/`Stop` recusa o encerramento |
| V6 | **Afirmação sem lastro** | relatório cita arquivo, linha ou resultado ausente da transcrição | auditor-de-fatos marca; o Maestro corrige antes do PR |
| V7 | **Loop** | mesma ação ≥ 4× ou mesmo erro ≥ 3× | alerta; na 2ª vez para o agente e o Maestro replaneja |
| V8 | **Estouro** | subagente acima do teto de tempo/chamadas da classe da tarefa | encerra e devolve ao Maestro |
| V9 | **Ação perigosa** | coluna "bloqueado sempre" da seção 4 | bloqueia em qualquer perfil |
| V10 | **Teste moldado ao código** | QA lendo arquivos de implementação da tarefa antes de escrever o teste de aceite | alerta (não bloqueia) |
| V11 | **Esforço errado** | tarefa "simples" que reprovou na revisão ou estourou | registra para a retro recalibrar a classificação |

Todo detector nasce em modo **alerta** e só passa a **bloqueio** depois de medido em sessões reais (F5), exceto V2 e V9, que bloqueiam desde o início.

### 6.3 Painel

- **Status line:** `deus · build · dev 3/5 · qa 2/4 · 1 alerta · 22 min`.
- **`/deus-status`:** situação por time e por tarefa; gera `painel/index.html` com a linha do tempo de cada agente.
- **Métricas por time e agente:** taxa de aprovação na 1ª revisão, retrabalho, "pronto" recusados, alertas por tipo, tempo e custo por classe de complexidade.

## 7. Autoaprimoramento

Disparo: `/retro`, ou automático no fim de sessão com alertas ou reprovações.

1. **Coleta:** telemetria, reprovações da revisão e suas correções na conversa.
2. **Diagnóstico por time:** skill que não disparou, instrução ambígua, passo pulado, classificação de esforço errada, detector com falso positivo.
3. **Proposta:** diff na skill, no agente, na regra de esforço ou no detector, em `.claude/modo-deus/retro/`, com o trecho de log que a justifica.
4. **Avaliação:** eval da skill antes e depois (`superpowers:writing-skills`), com casos tirados das falhas reais. Sem melhora, descarta.
5. **Aprovação sua.** Aprovado → aplica, sobe versão no `kit.json`, registra no `CHANGELOG`.
6. **Regressão:** os casos viram teste permanente.

Lição que só vale para um projeto vai para o `REGRAS.md` dele, não para a skill global.

## 8. Estrutura

```
kit-agentes/
├── .claude-plugin/ plugin.json · marketplace.json
├── kit.json                         # perfis, times ligados, modelo/esforço por agente, versões
├── agents/
│   ├── maestro.md
│   ├── dev-front.md · dev-back.md · dev-db.md · dev-devops.md
│   ├── dev-mobile.md · dev-dados.md · dev-docs.md      # sob demanda
│   ├── qa-unit.md · qa-integracao.md · qa-e2e.md · qa-ui.md · qa-regressao.md
│   └── revisor.md · revisor-seguranca.md · auditor-de-fatos.md
├── skills/
│   ├── terceiros/                   # vendorizadas com commit pinado
│   └── proprias/ modo-deus · vigia · retrospectiva · qa-cypress
├── commands/  deus · spec · plan · build · review · ship · auditar · deus-status · retro · perfil
├── hooks/ hooks.json · src/{comum,trava,cerca,vigia,prova,contexto,telemetria}.mjs
├── mods/ statusline.mjs · painel/
├── modelos/ REGRAS.md · CLAUDE.md · plano.schema.json · territorios.json · cypress/
├── instalar.mjs                     # --perfil · --times · --dry-run · --remover · doctor
├── testes/                          # node:test
└── docs/ · modo-deus/PLANO.md
```

No projeto (fora do git): `.claude/settings.local.json` e `.claude/modo-deus/{REGRAS.md, plano.json, telemetria/, retro/}`.

## 9. Fases

Cada fase termina com testes verdes e commit. Nada da v1 é apagado antes da F7.

| Fase | Entrega | Pronto quando | Estimativa |
|---|---|---|---|
| **F0 · Fundação** | `git init`, migração de skills/commands/modelos, comparação com `~/.claude/kits/fluxo-agentes`, baseline dos testes da v1 | primeiro commit + `docs/baseline.md` | ½ dia |
| **F1 · Plugin, manifesto e instalador** | `kit.json`, `plugin.json`, marketplace local, `instalar.mjs` com perfis, times e `doctor`, `CLAUDE.md` base | instalar/reinstalar/remover deixa `git status` limpo | 1 dia |
| **F2 · Hooks e cercas** | porta da trava para node, V2 e V9, deny-list, allowlist pelo `REGRAS.md`, telemetria básica, grafo reconstruído no início da sessão quando velho | 32 cenários da v1 + novos passam; caso comum ≤ 60 ms | 1–2 dias |
| **F3 · Maestro e Revisão** | `maestro`, `revisor`, `revisor-seguranca`, `auditor-de-fatos`, skill `modo-deus`, `plano.json`, `/deus` passos 1, 2, 6, 7 | Maestro gera plano válido no schema; revisão devolve itens corretamente | 1–2 dias |
| **F4 · Times Dev e QA** | 4 agentes Dev fixos + 3 sob demanda com detecção, 5 agentes QA, territórios, worktrees por tarefa, skill `qa-cypress`, oferta de setup do Cypress | `/deus` completa uma feature de exemplo (front + back + db) com E2E Cypress verde e PR aberto; num projeto sem app, `dev-mobile` não é carregado; numa mudança de API, `dev-docs` é acionado | 3 dias |
| **F5 · Monitoramento** | V1, V3–V8, V10, V11; status line; `/deus-status` e painel | um teste por detector (dispara no caso ruim, quieto no bom); falsos positivos medidos em 3 sessões reais | 2 dias |
| **F6 · Autoaprimoramento** | skill `retrospectiva`, `/retro`, gatilho automático, eval antes/depois, regressão | falha real → proposta com evidência → eval → skill versionada | 1–2 dias |
| **F7 · Integração e migração** | convivência com Orca/superpowers/claude-security, CI (Windows e Linux), `atualizar-terceiros.mjs`, migração de um projeto real | CI verde; uma semana de uso real sem rollback; v1 arquivada | 1 dia |

**Total:** 11–13 dias de trabalho focado. Times entram antes do monitoramento porque os detectores dependem do `plano.json` e dos territórios.

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Custo: até 13 agentes, Opus no Maestro | times ligados por projeto; Haiku no auditor; esforço médio por padrão; custo por classe no painel |
| Conflito de merge entre times paralelos | Maestro só paraleliza tarefas com escopos disjuntos; integração sequencial com suíte a cada junção |
| Testes E2E instáveis travam o pipeline | skill `qa-cypress` proíbe `wait` fixo; teste instável vai para quarentena com item no plano, não bloqueia sozinho |
| Hooks deixam tudo lento | um processo node por evento, cache, caminho rápido; meta medida na F2 |
| Falso positivo dos detectores | nascem em alerta; viram bloqueio só depois de medidos |
| Retro piora uma skill | eval + aprovação + regressão + versão para rollback |
| Classificação simples/complexa errada | V11 mede e a retro recalibra a regra |

## 11. Decisões fechadas

1. **Revisor:** Sonnet 5.5 alto.
2. **Territórios:** o instalador sugere por convenção de pastas; você ajusta no `REGRAS.md` de cada projeto.
3. **Pontos de parada:** dois, aprovação do plano e merge.
4. **Times extras** (`dev-mobile`, `dev-dados`, `dev-docs`): entram nesta versão, nativos e dormentes; acendem só quando o projeto e a tarefa precisam.
