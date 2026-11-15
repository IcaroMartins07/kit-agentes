# Changelog

## [não lançado]

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
