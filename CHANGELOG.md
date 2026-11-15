# Changelog

## [não lançado]

### F1 · Plugin, manifesto e instalador (2026-11-15)
- `kit.json`: perfis (leve, estrito, deus), 16 agentes com modelo e esforço, territórios, sinais dos times sob demanda, skills incluídas e excluídas.
- Plugin `modo-deus` com marketplace local `kit-agentes`; `claude plugin validate --strict` passa. 18 skills + 6 comandos, ~2,7 mil tokens fixos por sessão.
- Skills duplicadas com o superpowers saem (TDD, debugging, planning); `using-agent-skills` sai até a skill própria da F3.
- Comandos apontam para `.claude/modo-deus/REGRAS.md` e para as skills do superpowers.
- `instalar.mjs`: detecção de stack, comandos, territórios e times sob demanda; `--perfil`, `--times`, `--dry-run`, `--remover` com backup, `doctor`.
- `modelos/CLAUDE.md` base (do AGENTS.md da v1, com times, evidência e esforço); `REGRAS.md` v2; deny-list v2 que deixa `.env.example` legível.
- Dependências: `superpowers`, `claude-security` e `frontend-design` obrigatórios; caveman e `claude-code-setup` fora. `node instalar.mjs dependencias` instala só o que falta.
- graphify como base de mapeamento: o instalador monta `graphify-out/` (AST, sem LLM) fora do git; o doctor confere CLI, skill e se o grafo está atualizado; `CLAUDE.md` base manda consultar o grafo antes de varrer pastas. Os hooks git do graphify não são usados porque alteram o `.gitattributes` versionado.
- Correções da revisão da F1: CLI funciona chamado por junction/symlink; comandos não preenchidos contam como pendência no REGRAS.md; placeholder do npm init não vira comando de teste; app.json só liga dev-mobile com chave expo e lib/ só é mobile com pubspec.yaml (`condicoes` no kit.json); settings.local.json versionado vira aviso no doctor; `# Changelog

## [não lançado]

### F1 · Plugin, manifesto e instalador (2026-11-15)
- `kit.json`: perfis (leve, estrito, deus), 16 agentes com modelo e esforço, territórios, sinais dos times sob demanda, skills incluídas e excluídas.
- Plugin `modo-deus` com marketplace local `kit-agentes`; `claude plugin validate --strict` passa. 18 skills + 6 comandos, ~2,7 mil tokens fixos por sessão.
- Skills duplicadas com o superpowers saem (TDD, debugging, planning); `using-agent-skills` sai até a skill própria da F3.
- Comandos apontam para `.claude/modo-deus/REGRAS.md` e para as skills do superpowers.
- `instalar.mjs`: detecção de stack, comandos, territórios e times sob demanda; `--perfil`, `--times`, `--dry-run`, `--remover` com backup, `doctor`.
- `modelos/CLAUDE.md` base (do AGENTS.md da v1, com times, evidência e esforço); `REGRAS.md` v2; deny-list v2 que deixa `.env.example` legível.
- Dependências: `superpowers`, `claude-security` e `frontend-design` obrigatórios; caveman e `claude-code-setup` fora. `node instalar.mjs dependencias` instala só o que falta.
- graphify como base de mapeamento: o instalador monta `graphify-out/` (AST, sem LLM) fora do git; o doctor confere CLI, skill e se o grafo está atualizado; `CLAUDE.md` base manda consultar o grafo antes de varrer pastas. Os hooks git do graphify não são usados porque alteram o `.gitattributes` versionado.
 no nome do repositório não corrompe o REGRAS.md; `--perfil` sem valor é erro.
- 38 testes em node:test.

### F0 · Fundação (2026-11-15)
- Repositório criado a partir do `fluxo-agentes` v1.
- Skills de terceiros migradas para `skills/terceiros/` sem alteração; `_legado/` não foi trazido.
- Comandos e modelo `REGRAS.md` migrados; deny-list e `AGENTS.md` do legado guardados como referência.
- Hooks, testes e instalador da v1 preservados em `v1/` como referência para a porta em node (F2).
- Baseline dos testes da v1 em `docs/baseline.md`.
