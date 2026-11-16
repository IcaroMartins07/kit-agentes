# plugins/

Conectores de que o kit depende: plugins, marketplaces e ferramentas. A lista fica em [conectores.json](conectores.json) e é a única fonte; o `instalar.mjs` e o `doctor` leem dela.

## Instalar no projeto, sem nada global

```bash
node <kit>/instalar.mjs dependencias /caminho/do/projeto
```

Por padrão instala com `--scope local`: os plugins valem só naquele projeto e não aparecem nos outros. `--escopo user` instala para todas as sessões, quando for de propósito. `--dry-run` mostra os comandos sem rodar.

## O que tem

| Conector | Para que o kit usa | Obrigatório |
|---|---|---|
| `superpowers@claude-plugins-official` | TDD, debugging, planos, verificação, worktrees e escrita de skills; pré-carregadas nos agentes Dev e QA e aceitas pela trava | sim |
| `claude-security@claude-plugins-official` | varredura profunda de segurança, recomendada pelo `revisor-seguranca` antes do merge | sim |
| `frontend-design@claude-plugins-official` | direção visual de interface, usada pelo `dev-front` | sim |
| graphify (`graphifyy` ≥ 0.9.96) | mapa do projeto que os agentes consultam antes de varrer pastas | sim |
| context7 (MCP) | documentação de bibliotecas citada no `CLAUDE.md` base | recomendado |
| playwright | navegador para exploração e reprodução de bug | recomendado |

Fora de propósito: `caveman` (o ponytail cobre) e `claude-code-setup`.

O graphify é a exceção ao escopo local: a CLI e a skill dele são instaladas para o usuário (`graphify install --platform claude`). O grafo de cada projeto fica em `graphify-out/` do próprio projeto.

Os testes em `testes/uso.test.mjs` garantem que cada conector obrigatório é de fato usado por um agente, skill, comando ou hook do kit.
