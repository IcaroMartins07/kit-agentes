# mods/

Mods do Claude Code guardados com o kit. Estar aqui não instala nada; o estado de cada um está na tabela. cada pasta tem um `LEIA.md` com a origem, o commit, o comando de instalação e o que a revisão do código encontrou.

| Pasta | Mod | Origem | Estado nesta máquina |
|---|---|---|---|
| `M1/` | savvy-progress | JohnnyVizz/claude-kit | instalado |
| `M2/` | You Should Know | embutido no Claude Code | não ativado (só instruções) |
| `M3/` | File Tree | data-goblin/claude-code-filetree | instalado (0.8.3) |
| `M4/` | Cache Tax | karanb192/cache-tax | instalado (2.4.2) |
| `M5/` | Reflect (reflect-mod) | BayramAnnakov/claude-reflect | instalado (3.3.0) |
| `M6/` | Terminal Browser | zenbu-labs/terminal-browser | não instalado; exige WSL no Windows |

Do próprio kit, também aqui: `statusline.mjs` (status line do modo-deus, `instalar.mjs --statusline`) e `painel/` (gerador do `/deus-status`).

Para atualizar um mod guardado, clone o repositório de origem e copie de novo a pasta do plugin, atualizando o commit no `LEIA.md`.
