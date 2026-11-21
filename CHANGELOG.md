# Changelog

## [não lançado]

### Painel de agentes 0.5.0 (2026-11-21)
- Saem as abas **Orca** e **Terminais** e o comando `/orca` (com `hooks/orca.tsx`, `hooks/terminais.tsx` e os testes deles). O MCP Orca continua pela CLI e pelas ferramentas MCP.
- A aba **Agentes** volta ao texto de antes quando não há sub-agente, e o cartão da tarefa perde o resumo em três números (sub-agentes, rodando, alterações) que tinha ficado sob a barra.

### MCP Orca · orquestrador de agentes, parte 1 (2026-11-20)
- `mcp-orca/`: daemon local e CLI `mcp-orca` (abrir, listar, ler, enviar, fechar, parar, com `--json`). Um terminal de verdade (node-pty, ConPTY no Windows) por agente, com claude, codex, gemini ou qualquer comando, e uma tela virtual (@xterm/headless) que devolve a tela como ela aparece. O daemon escuta só em named pipe ou socket Unix, com token; o texto enviado vai direto ao processo, sem shell. Testado com um agente de eco e com o `claude` real. Faltam a aba Terminais no painel e a instalação das IAs.
- Servidor MCP `mcp-orca` no plugin: `terminais_listar`, `terminal_abrir`, `terminal_ler`, `terminal_enviar` e `terminal_fechar`, falando com o mesmo daemon. Pelo MCP só abre claude, codex ou gemini: ferramenta MCP não passa pelos hooks do kit, então comando livre fica na CLI.
- Aba **Terminais** no painel de agentes (0.4.0): os terminais do MCP Orca como abas, a tela ao vivo, a caixa de mensagem (o texto vai depois de `--`, sem shell) e os botões `+ claude`, `+ codex`, `+ gemini` e `✕ fechar`. Chama o comando `mcp-orca`, que entrou no `bin` do kit (o `npm link` põe no PATH). A CLI aceita `--` antes do texto.
- O `agents-mode` instala as dependências do MCP Orca como primeiro passo, antes do plugin, porque o Claude instala o plugin como cópia da pasta do kit e a cópia precisa levar o `node-pty` (`npm install` dentro de `mcp-orca/`, sem `--prefix`: da raiz do kit, que também é pacote, o npm instalaria o próprio kit lá dentro).

### Medição de custo e bloqueios falsos (2026-11-20)
Linha de base, medida no teste do portfólio (kit 0.6.0) com a ferramenta nova: 85 M tokens de cache lido, 3 M escritos, 0,7 M de saída, 1004 chamadas; a sessão principal sozinha leu 28 M, com contexto de até 378 K; o dev-front "de 124 min" trabalhou 19 e esperou o Maestro 105.
- `hooks/ferramentas/custo.mjs`: custo por agente lido das transcrições. Cada `SubagentStop` grava `uso` (minutos ativos e de espera, chamadas, tokens, maior contexto) na telemetria.
- Bloqueios falsos (cerca de 30 dos 67 do portfólio): escrita na pasta temporária fora do projeto não conta para V2 nem para a trava; `>` dentro de aspas ou de heredoc não é redirecionamento; `$VAR` do próprio comando é expandida; V9 não lê padrão de grep nem mensagem de commit como arquivo de segredo, e avalia o merge pela branch de onde roda (`cd`, `git -C`, `switch`).
- A recusa do contrato traz o modelo do bloco json do papel.
- Contrato lê a entrega feita pelo `SubagentHandback`: o `last_assistant_message` chegava vazio, então todas as 17 entregas do portfólio foram recusadas uma vez e o V5/V6 nunca rodou.
- Regras gerais chegam inteiras: o CLAUDE.md base (13,7 KB) e a saída da sessão (16 KB) passavam do limite de 10 mil caracteres do hook, e o Claude Code entregava só uma prévia de 2 KB e o caminho de um arquivo, na sessão e nos subagentes. Agora `hooks/src/regras.mjs` injeta o arquivo em partes de até 8 mil caracteres (registrado três vezes no `SessionStart` e no `SubagentStart`), e o `sessao.mjs` fica só com o `REGRAS.md` e os avisos.
- `--enxuto` (instalar.mjs e agents-mode): grava no `.claude/settings.local.json` do projeto `disableClaudeAiConnectors: true` e `skillListingMaxDescChars: 250`, só onde o usuário não definiu a chave. No portfólio a sessão começava com 96 mil tokens e cada subagente recebia 30 mil caracteres de lista de skills, mais da metade de skills da conta e pessoais, que o `enabledPlugins` não alcança.
- V8 conta o tempo ativo: o intervalo em que o subagente ficou parado esperando o Maestro retomá-lo não entra no teto (o dev-front "de 124 min" do portfólio trabalhou 19).
- Contexto menor: a volta da revisão vai para um agente novo (branch da tarefa reaberta sem `-C`), não para o antigo retomado; relatório final de no máximo 10 linhas antes do bloco json; o Maestro grava o `mapa` de cada tarefa (arquivos que o grafo apontou) e o prompt leva esse mapa.

### 0.7.0 · mais rápido e mais barato, sem perder qualidade (2026-11-19)
Vem do teste real no portfólio: 6 tarefas, 5 rodadas de revisão de 11 a 15 min com navegador, 13 instalações de dependências, 11 servidores e 33 bloqueios de território.
- Revisor sem navegador: lê o diff e os prints que o `qa-regressao` tira uma vez, em três larguras (`hooks/ferramentas/prints.mjs`, sem dependências).
- Item de revisão `baixa` não reprova nem vira tarefa: vai para Sugestões no relatório final. Só `alta` e `media` voltam ao Dev.
- Dependências da worktree por link às da raiz, sem reinstalar; o Dev de front não sobe servidor só para olhar a tela.
- Direção visual antes de codar: o Maestro escreve `.modo-deus/design.md` com as skills de design quando o pedido fala de visual, e o revisor critica os prints contra ela (categoria nova `visual`, com alvo na retro).
- Validador do plano recusa escopo fora do território do time.
- Pedido amplo vira entregas menores; polimento visual sem mudar contrato é `simples`.
- Painel 0.3.0 separa tokens novos de releitura de cache; a telemetria registra as skills invocadas.

### 0.6.1 · agents-mode com o painel e o kit fora do git do projeto (2026-11-18)
- `agents-mode` instala também o painel de agentes (padrão); `--mods todos|nenhum|<lista>` escolhe os mods de interface. A documentação usa só o `agents-mode` para instalar.
- Nada do kit entra no git do projeto: `.claude/worktrees/` (worktrees dos agentes) entrou no `.git/info/exclude` junto com `.modo-deus/`, `graphify-out/` e o settings local; a cerca (V9) recusa `git add -f` desses caminhos; o `doctor` confere todos.

### 0.6.0 · pronto para o GitHub (2026-11-18)
- Sete pastas: agents, commands, skills, hooks, mods, docs e testes, mais exemplos/. `agents-mode.mjs` na raiz; dependências em `hooks/conectores.json`; status line e painel do `/deus-status` em `hooks/ferramentas/`.
- Saiu o legado (v1 em docs/referencia, `migrar-v1.mjs`, planos internos, o maestro histórico e a lista da v1), com cópia em `~/.claude/modo-deus/backups/legado-2026-11-18`.
- Licença MIT no kit e nos mods do kit; o `LICENSE` original de cada componente de terceiros na pasta dele (impeccable é Apache 2.0); `TERCEIROS.md` atualizado.
- Primeira execução real do `/deus` (projeto de exemplo, 4 min, US$ 2): o GIF do README sai dela. Ela mostrou e corrigiu: o caminho rápido agora prevê a tarefa `qa-unit` quando o teste fica no território do QA, e o contrato Dev/QA só é dispensado em plano que já começou (antes, plano novo gravado direto como aprovado escapava). Fica aberto: a cerca bloqueia o merge das tarefas feito numa worktree de integração.
- README principal reescrito (selos, GIF, diagrama do fluxo, instalação, perfis, interface, estrutura) e README em cada pasta; `CONTRIBUTING.md`, `SECURITY.md` e modelos de issue e PR; imagens em `docs/imagens/`; projeto de exemplo em `exemplos/tarefas`.

### 0.5.0 · agents-mode e estrutura pronta para publicar (2026-11-18)
- `agents-mode` (`bin/agents-mode.mjs`, `npm link`): instala ou atualiza o plugin do kit e os mods do kit já instalados, as dependências, o kit no projeto e roda o doctor, nessa ordem.
- Mods em `mods/kit/` (painel-agentes, prompt-master, temas, maestro histórico) e `mods/terceiros/` (savvy-progress, filetree, reflect-mod, terminal-browser, theme-examples, you-should-know), com nomes no lugar de M1–M9 e o `LEIA.md` dentro de cada pasta. Status line e painel do `/deus-status` em `ferramentas/`.
- Publicação: `.gitignore` tira a instalação local (`/.modo-deus/`), os resultados de eval e a logo do Orca; README sem caminhos desta máquina; `TERCEIROS.md` com origem e licença de cada componente de terceiros.

### 0.4.0 · fluxo mais enxuto e retro que aponta a skill que falhou (2026-11-18)
- Contexto enxuto: segurança, desempenho e simplificação saem da pré-carga e são invocadas sob demanda; `REGRAS-GERAIS.md` só quando as regras não vieram no contexto.
- Contrato Dev/QA no plano (`contrato: { ids_teste, api }`), exigido pelo validador quando os dois dividem um critério.
- V12: dependência alterada sem auditoria. Comandos Desempenho e Segredos no `REGRAS.md`.
- Revisão cedo das tarefas complexas, caminho rápido para mudança pequena, grafo da feature reconstruído na regressão, `doctor` avisa convenção nova.
- Autoaprimoramento: itens de revisão com `categoria`; causa `revisao_recorrente` na retro com a skill alvo; três evals novos (`contrato-dev-qa`, `caminho-rapido`, `desempenho-caminho-critico`).
- 14 skills soltas duplicadas do kit desativadas nesta máquina. 263 testes.

### 0.3.0 · padrões do projeto, segurança, qualidade e desempenho em todas as etapas (2026-11-18)
- Regras gerais nos subagentes: `SubagentStart` injeta o `CLAUDE.md` base; a sessão grava `.modo-deus/REGRAS-GERAIS.md`, lido no passo "Regras" de todo Dev e QA.
- `instalar.mjs` detecta convenções (linter, formatador, tipos, hooks de commit), integrações (SDKs Node e Python e nomes do `.env.example`) e o comando de auditoria de dependências; o `REGRAS.md` ganhou as seções Integrações e Desempenho e quatro itens no Definition of Done.
- Skills novas no kit: `performance-optimization` (`dev-front`, `dev-back`, `dev-db`, `revisor`) e `code-simplification` (todo Dev antes de entregar). `security-and-hardening` passou a valer para todos os Dev de código.
- Passo **Padrões** em todo Dev; padrões e caminho negativo de segurança nos QAs; `revisor` com Consistência e Desempenho; `revisor-seguranca` com auditoria de dependências e integrações; Maestro analisa o projeto antes do plano (passo 0); `/spec`, `/plan`, `/build`, `/review` e `/ship` alinhados.
- Análise completa e correções em `docs/FLUXO-E-SKILLS.md`. 260 testes.

### Reorganização e garantia de uso (2026-11-16)
- Oito pastas: `skills/`, `mods/`, `plugins/`, `hooks/`, `agents/` (em `maestro/`, `dev/`, `qa/`, `review/`), `docs/`, `commands/`, `testes/`. Agentes listados no `plugin.json` para manter os nomes `modo-deus:<agente>` (confirmado numa sessão real).
- `plugins/conectores.json` concentra plugins, marketplaces e graphify; `instalar.mjs dependencias <projeto>` instala com `--scope local` (só no projeto) por padrão, `--escopo user` para global.
- Auditoria de uso: `idea-refine`, `playwright-skill`, `vigia`, `superpowers:subagent-driven-development`, `superpowers:using-git-worktrees`, `superpowers:executing-plans` e o plugin `frontend-design` estavam declarados sem ninguém usar; agora estão ligados ao Maestro, ao `/build`, ao `dev-front`, aos QAs de tela e a todos os agentes (alertas do monitor).
- `testes/uso.test.mjs`: prova que toda skill, skill do superpowers, conector, mod e módulo de hook é usado, e que a trava cobra cada skill de construção e de PR e o contrato cobra todo agente que entrega.

### Integração F4–F7 (2026-11-15)
- As quatro fases foram feitas em paralelo por subagentes, cada um na própria worktree e branch (`fase/f4-times`, `fase/f5-monitor`, `fase/f6-retro`, `fase/f7-integracao`), e integradas em `fases/integracao` sem conflito de merge.
- Ajustes da integração: skills `retrospectiva` e `vigia` registradas no plugin; `qa-cypress` alinhada às duas tarefas de configuração; cache da trava movido para `.claude/modo-deus/cache/` (nenhum hook escreve fora da pasta do kit); corte `retro/ULTIMA.json` para o Stop não recriar a retro pendente com ocorrências já analisadas; `npm test` via `scripts/testar.mjs` (node 18–22); teste do plugin pula sem o CLI em Windows pt-BR.
- Plugin completo: 16 agentes, 22 skills + 9 comandos, 7 hooks; ~5,4 mil tokens fixos por sessão. 234 testes.

### F7 · CI, migração e convivência (2026-11-15)
- CI no GitHub Actions: ubuntu e windows × node 18, 20 e 22.
- `scripts/atualizar-terceiros.mjs`: compara as skills de terceiros com a origem no commit pinado ou no último (simulação por padrão; `--aplicar` copia e atualiza a tabela).
- `scripts/migrar-v1.mjs`: migração do fluxo-agentes v1 (global e por projeto, simulação por padrão, backup ao aplicar); guia em `docs/migracao.md`.
- Testes de convivência: instalar e remover não tocam o `settings.json` global (com hooks no estilo do Orca); hooks não agem nem escrevem em projeto sem o kit.

### F6 · Autoaprimoramento (2026-11-15)
- `hooks/src/retro.mjs` (determinístico): `coletar` agrega telemetria e plano em causas (skill não disparou, instrução ambígua, passo pulado, esforço errado, fuga, alucinação, loop/estouro, falso positivo suspeito); `proposta` gera o esqueleto; `concluir` fecha a retro.
- Skill `retrospectiva` e comando `/retro`: proposta com evidência → eval antes/depois com `claude plugin eval` → aprovação do usuário obrigatória → versão nova, CHANGELOG e caso de regressão em `evals/`.
- `evals/modo-deus/`: 3 casos iniciais (classificar simples, classificar complexa, plano válido). Ainda não executados.

### F5 · Monitoramento (2026-11-15)
- `hooks/src/vigia.mjs`: detectores V1 (escopo da tarefa pela branch `-T<n>`), V3 (falhas de arquivo lidas da transcrição), V4 (comando inexistente), V5/V6 (entrega sem teste rodado ou com comando sem lastro), V7 (loop), V8 (teto de chamadas e tempo por classe), V10 (QA lendo implementação antes do teste), V11 (esforço errado). Perfil leve não roda; estrito só alerta; deus bloqueia V1, V3, V5, V7 e V8. Tetos em `kit.json` → `monitor`.
- Alerta sem bloqueio chega ao agente por `additionalContext` (PreToolUse, PostToolUseFailure) ou `systemMessage` (SubagentStop, Stop).
- Stop grava `retro/PENDENTE.json` quando houve alerta ou bloqueio; SessionStart avisa.
- Status line (`mods/statusline.mjs`, opt-in com `instalar.mjs --statusline`: plugin não pode definir status line), `/deus-status` com resumo em texto e painel HTML autocontido.
- Custo: o caso comum do PreToolUse foi de ~68 para ~83 ms (node vazio ~52 ms).

### F4 · Times Dev e QA (2026-11-15)
- 12 agentes com `isolation: worktree`: dev-front, dev-back, dev-db, dev-devops, dev-mobile, dev-dados, dev-docs (os três últimos sob demanda), qa-unit, qa-integracao, qa-e2e, qa-ui, qa-regressao. Sonnet, esforço medium por padrão e high por tarefa complexa.
- Convenção de branch da tarefa `<feature>-T<n>`, criada pelo próprio agente a partir da branch da feature; entrega no contrato `lerEntrega`, regressão no `lerRegressao`; SubagentStop exige o bloco.
- Skill `qa-cypress` (seletores `data-cy`, sem `wait` fixo, `cy.intercept`, `cy.session`, cypress-axe, quarentena) e modelos em `modelos/cypress/`. Configurar Cypress são duas tarefas: dev-devops instala, qa-e2e copia os modelos.

### F3 · Maestro e Revisão (2026-11-15)
- Agentes `maestro` (Opus, medium; agente principal via `claude --agent modo-deus:maestro`), `revisor` e `revisor-seguranca` (Sonnet, high, só leitura) e `auditor-de-fatos` (Haiku, só leitura), com skills pré-carregadas.
- Skill própria `modo-deus`: pipeline de 7 passos com duas paradas (plano e merge), classificação simples/complexa → esforço, despacho com `effort` por tarefa, escopos disjuntos para paralelo, máximo de 2 rodadas de revisão e escalada.
- Contrato do `plano.json` (`hooks/src/plano.mjs`): ids, times existentes e ligados, esforço coerente com a classe, dependências sem ciclo, escopo disjunto entre tarefas paralelas, critérios ligados à spec, branch fora da principal. O hook recusa gravar plano fora do contrato (Write e Edit). CLI: `node hooks/src/plano.mjs validar|veredito|auditoria <arquivo>`.
- Contrato de saída da Revisão e do auditor: o SubagentStop só deixa encerrar com o bloco json no formato; na segunda tentativa encerra e registra `contrato_falhou`.
- Comando `/deus` (Opus, medium). Comandos manuais (`/build`, `/ship`) continuam pedindo confirmação para commit; o `/deus` segue o perfil.
- O revisor de segurança revisa o diff e recomenda `claude --agent claude-security:claude-security` para varredura profunda: o orquestrador do claude-security só roda como agente principal.
- 172 testes.

### F2 · Hooks e cercas (2026-11-15)
- Hooks do plugin em node (`hooks/hooks.json` + `hooks/src/`). Só agem em projetos com o kit instalado; a worktree de tarefa acha o kit do repositório principal pelo arquivo `.git`.
- Trava de fase portada da v1 (cache incremental da transcrição, só conta tool_use da Skill), aceitando as skills do superpowers e olhando também a transcrição do subagente.
- V9 · cerca: push forçado, push/merge/rebase na principal, reset --hard, clean -f, branch -D, rm -r fora do projeto, deploy e publicação, leitura/escrita de arquivo de segredo (menos `.env.example`) e segredo no conteúdo (chave privada, AWS, GitHub, OpenAI, Anthropic, Stripe, Slack, Google).
- V2 · território por agente do kit (`agent_type`): revisão só lê; Maestro só escreve em `.claude/modo-deus/`; QA só em testes; Dev no próprio território, testes dentro dele inclusive. Arquivo sem território passa e fica registrado.
- SessionStart injeta `CLAUDE.md` base, `REGRAS.md`, times e avisos, e reconstrói o grafo em segundo plano quando está velho. UserPromptSubmit lembra da skill da fase e do grafo.
- Telemetria JSONL em `.claude/modo-deus/telemetria/` (PreToolUse, SessionStart, SubagentStart/Stop, Stop); perfil leve só registra bloqueios.
- Instalador: allowlist gerada do `REGRAS.md` (comandos simples) + consultas ao grafo e ao git, sincronizada a cada instalação e removida com o kit.
- 145 testes (os 32 cenários da v1 portados; merge na principal passou a ser bloqueado pela V9).

### F1 · Plugin, manifesto e instalador (2026-11-15)
- `kit.json`: perfis (leve, estrito, deus), 16 agentes com modelo e esforço, territórios, sinais dos times sob demanda, skills incluídas e excluídas.
- Plugin `modo-deus` com marketplace local `kit-agentes`; `claude plugin validate --strict` passa. 18 skills + 6 comandos, ~2,7 mil tokens fixos por sessão.
- Skills duplicadas com o superpowers saem (TDD, debugging, planning); `using-agent-skills` sai até a skill própria da F3.
- Comandos apontam para `.claude/modo-deus/REGRAS.md` e para as skills do superpowers.
- `instalar.mjs`: detecção de stack, comandos, territórios e times sob demanda; `--perfil`, `--times`, `--dry-run`, `--remover` com backup, `doctor`.
- `modelos/CLAUDE.md` base (do AGENTS.md da v1, com times, evidência e esforço); `REGRAS.md` v2; deny-list v2 que deixa `.env.example` legível.
- Dependências: `superpowers`, `claude-security` e `frontend-design` obrigatórios; caveman e `claude-code-setup` fora. `node instalar.mjs dependencias` instala só o que falta.
- graphify como base de mapeamento: o instalador monta `graphify-out/` (AST, sem LLM) fora do git; o doctor confere CLI, skill e se o grafo está atualizado; `CLAUDE.md` base manda consultar o grafo antes de varrer pastas. Os hooks git do graphify não são usados porque alteram o `.gitattributes` versionado.
- Correções da revisão da F1: CLI funciona chamado por junction/symlink; comandos não preenchidos contam como pendência no REGRAS.md; placeholder do npm init não vira comando de teste; app.json só liga dev-mobile com chave expo e lib/ só é mobile com pubspec.yaml (`condicoes` no kit.json); settings.local.json versionado vira aviso no doctor; cifrão no nome do repositório não corrompe o REGRAS.md; `--perfil` sem valor é erro.
- 38 testes em node:test.

### F0 · Fundação (2026-11-15)
- Repositório criado a partir do `fluxo-agentes` v1.
- Skills de terceiros migradas para `skills/terceiros/` sem alteração; `_legado/` não foi trazido.
- Comandos e modelo `REGRAS.md` migrados; deny-list e `AGENTS.md` do legado guardados como referência.
- Hooks, testes e instalador da v1 preservados em `v1/` como referência para a porta em node (F2).
- Baseline dos testes da v1 em `docs/baseline.md`.
