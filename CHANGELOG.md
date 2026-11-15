# Changelog

## [não lançado]

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
