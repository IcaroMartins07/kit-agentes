# Componentes de terceiros

O kit guarda cópias de skills e mods de outros autores, cada uma no commit indicado. A licença de cada um está na própria pasta (`LICENSE`), e o resto do kit é MIT ([LICENSE](LICENSE)).

| Componente | Pasta | Origem e commit | Licença |
|---|---|---|---|
| agent-skills | `skills/terceiros/agent-skills/` | addyosmani/agent-skills · `39b723c` | MIT, Addy Osmani |
| humanizer | `skills/terceiros/humanizer/` | blader/humanizer · `b48c832` | MIT, Siqi Chen |
| impeccable | `skills/terceiros/impeccable/` | pbakaus/impeccable · `d41d986` | Apache 2.0 |
| playwright-skill | `skills/terceiros/playwright/` | lackeyjb/playwright-skill · `dd47a6a` | MIT, lackeyjb |
| design-taste-frontend | `skills/terceiros/taste-skill/` | Leonxlnx/taste-skill · `12af471` | MIT, Leonxlnx |
| ponytail-audit | `skills/terceiros/ponytail/` | DietrichGebert/ponytail · `96608e0` | MIT, DietrichGebert |
| savvy-progress | `mods/terceiros/savvy-progress/` | JohnnyVizz/claude-kit · `c871c15` | MIT (declarada no README e no plugin.json da origem, que não publica `LICENSE`) |
| File Tree | `mods/terceiros/filetree/` | data-goblin/claude-code-filetree · `3ce5b1c` | MIT, Kurt Buhler |
| reflect-mod | `mods/terceiros/reflect-mod/` | BayramAnnakov/claude-reflect · `b6c4232` | MIT, Bayram Annakov |
| Terminal Browser | `mods/terceiros/terminal-browser/` | zenbu-labs/terminal-browser · `53b7f59` | MIT, Zenbu Labs |
| theme-examples | `mods/terceiros/theme-examples/` | anthropics/claude-plugins-official | `LICENSE` na pasta |
| Cena das dunas (no mod temas) | `mods/kit/temas/hooks/dither-dunes.ts` | theme-examples | `mods/kit/temas/LICENSE-theme-examples` |
| Ícones do File Tree (no painel) | `mods/kit/painel-agentes/hooks/filetree-icons.ts` | data-goblin/claude-code-filetree | MIT, Kurt Buhler (aviso no cabeçalho do arquivo) |

**Alterações locais.** O que o kit mudou em relação à origem está listado em [skills/terceiros/README.md](skills/terceiros/README.md) (skills) e no `LEIA.md` de cada mod. Para atualizar uma skill de terceiros, use `node skills/atualizar-terceiros.mjs` (simula por padrão).

**Fica fora do repositório:** a logo do Orca (`mods/kit/painel-agentes/assets/orca-logo.svg`), que é do Orca.
