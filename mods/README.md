# mods/

Mods do Claude Code guardados com o kit, em duas pastas. Estar aqui não instala nada: os do kit entram pelo marketplace `kit-agentes` (`claude plugin install <nome>@kit-agentes`) e os de terceiros têm o comando no `LEIA.md` de cada um.

## `kit/`: criados no kit

| Pasta | Mod | O que faz |
|---|---|---|
| `kit/painel-agentes/` | Painel de agentes | Painel global com as abas Agentes (pixel art), Worktree (árvore no estilo do File Tree), Alterações, Cérebro (graphify), Orca e Skill (liga e desliga skills, plugins e mods; `/gerenciador`) |
| `kit/prompt-master/` | Prompt Master | Reescreve o prompt antes de enviar, com desfazer |
| `kit/temas/` | Temas | Temas dos apps, com a cena das dunas (`/tema`) |

## `terceiros/`: guardados com origem e commit

| Pasta | Mod | Origem |
|---|---|---|
| `terceiros/savvy-progress/` | savvy-progress | JohnnyVizz/claude-kit |
| `terceiros/you-should-know/` | You Should Know | embutido no Claude Code (só instruções) |
| `terceiros/filetree/` | File Tree | data-goblin/claude-code-filetree |
| `terceiros/reflect-mod/` | Reflect | BayramAnnakov/claude-reflect, ajustado no kit |
| `terceiros/terminal-browser/` | Terminal Browser | zenbu-labs/terminal-browser (exige WSL no Windows) |
| `terceiros/theme-examples/` | theme-examples | anthropics/claude-plugins-official |

Cada pasta tem um `LEIA.md` com a origem, o commit, como instalar e o que a revisão do código encontrou. Para atualizar um mod de terceiros, clone a origem, copie de novo a pasta do plugin e atualize o commit no `LEIA.md`.

As ferramentas do próprio kit que não são mods (a status line e o gerador do `/deus-status`) ficam em [`ferramentas/`](../ferramentas).
