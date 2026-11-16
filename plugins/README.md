# plugins/

Conectores de que o kit depende: plugins, marketplaces e ferramentas. A lista fica em [conectores.json](conectores.json) e é a única fonte; o `instalar.mjs` e o `doctor` leem dela.

## Instalar no projeto, sem nada global

```bash
node <kit>/instalar.mjs dependencias /caminho/do/projeto
```

Por padrão instala com `--scope local`: os plugins valem só naquele projeto e não aparecem nos outros. `--escopo user` instala para todas as sessões, quando for de propósito. `--dry-run` mostra os comandos sem rodar.

## O que tem

| Conector | Origem | Para que o kit usa | Precisa de você |
|---|---|---|---|
| superpowers | claude-plugins-official | TDD, debugging, planos, verificação, worktrees; exigidas pela trava | — |
| claude-security | claude-plugins-official | varredura de segurança antes do merge (revisor-seguranca) | — |
| frontend-design | claude-plugins-official | direção visual (dev-front) | — |
| claude-code-setup | claude-plugins-official | recomendações de automação do Claude Code para o projeto | — |
| context7 | claude-plugins-official | documentação atual de bibliotecas | autenticar no Context7 quando pedir |
| playwright | claude-plugins-official | navegador para explorar e reproduzir bugs (QAs de tela) | navegadores baixados no primeiro uso |
| figma | claude-plugins-official | ler designs e tokens do Figma (dev-front) | login no Figma pelo /mcp |
| agent-browser | vercel-labs/agent-browser | automação rápida de navegador (QAs de tela) | CLI `agent-browser` e `agent-browser install` |
| ponytail | DietrichGebert/ponytail | modo da solução mais enxuta (YAGNI) em todo prompt e subagente | — |
| perplexity | perplexityai/modelcontextprotocol | pesquisa na web atual (Maestro, na spec) | variável `PERPLEXITY_API_KEY` |
| SkillSpector (CLI + MCP) | NVIDIA/skillspector | escanear skills de terceiros antes de instalar (`skillspector scan <pasta> --no-llm`) | modo LLM só com `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY` |
| graphify (`graphifyy` ≥ 0.9.96) | PyPI | mapa do projeto | — |

O SkillSpector usa Python 3.12 (`pipx install --python 3.12`): no 3.14 o `yara-python` não tem pacote pronto no Windows e compilar exige o Microsoft C++ Build Tools.

Fora de propósito: `caveman` (o ponytail cobre) e `claude-code-setup`.

O graphify é a exceção ao escopo local: a CLI e a skill dele são instaladas para o usuário (`graphify install --platform claude`). O grafo de cada projeto fica em `graphify-out/` do próprio projeto.

Os testes em `testes/uso.test.mjs` garantem que cada conector obrigatório é de fato usado por um agente, skill, comando ou hook do kit.
