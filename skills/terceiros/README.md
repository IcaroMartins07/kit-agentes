# skills/terceiros/

Skills de outros autores que o plugin do kit entrega. Cada pacote fica no commit da tabela, com a licença da origem (`LICENSE` na pasta); o nome de cada skill é o da pasta que contém o `SKILL.md`. A tabela é lida por `skills/atualizar-terceiros.mjs`.

| Pacote | Origem | Commit |
|---|---|---|
| `agent-skills\` | addyosmani/agent-skills | 39b723c |
| `humanizer\` | blader/humanizer | b48c832 |
| `impeccable\` | pbakaus/impeccable | d41d986 |
| `playwright\playwright-skill` | lackeyjb/playwright-skill (pasta `skills/playwright-skill`) | dd47a6a |
| `taste-skill\design-taste-frontend` | Leonxlnx/taste-skill (pasta `skills/taste-skill`) | 12af471 |
| `ponytail\ponytail-audit` | DietrichGebert/ponytail | 96608e0 |

Alterações locais em relação à origem:

- `agent-skills\using-agent-skills\SKILL.md`: seção final "Tabela de fases e trava", injetada pelo hook `checar-skills.sh`. Ao atualizar o pacote, refaça este acréscimo.
- `taste-skill\design-taste-frontend`: a pasta foi renomeada de `taste-skill` para casar com o nome da skill. Ela já inclui o redesign de projetos existentes; a skill `redesign-existing-projects` foi incorporada a ela na versão 2.1.1 do taste-skill e não existe mais como pasta própria.
- `playwright\playwright-skill`: sem `node_modules`; ela instala o Playwright no primeiro uso (`npm run setup` dentro da pasta da skill).

