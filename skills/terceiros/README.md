# skills/

Skills que o `instalar.sh` copia para os projetos. A lista está em `LISTA.txt`; o nome é o da pasta que contém o `SKILL.md`.

| Pacote | Origem | Commit |
|---|---|---|
| `agent-skills\` | addyosmani/agent-skills | eb07f19 |
| `humanizer\` | blader/humanizer | 0ef9fe5 |
| `impeccable\` | pbakaus/impeccable | df3a4ab |
| `playwright\playwright-skill` | lackeyjb/playwright-skill (pasta `skills/playwright-skill`) | dd47a6a |
| `taste-skill\design-taste-frontend` | Leonxlnx/taste-skill (pasta `skills/taste-skill`) | 12af471 |
| `ponytail\ponytail-audit` | DietrichGebert/ponytail | 96608e0 |

Alterações locais em relação à origem:

- `agent-skills\using-agent-skills\SKILL.md`: seção final "Tabela de fases e trava", injetada pelo hook `checar-skills.sh`. Ao atualizar o pacote, refaça este acréscimo.
- `taste-skill\design-taste-frontend`: a pasta foi renomeada de `taste-skill` para casar com o nome da skill. Ela já inclui o redesign de projetos existentes; a skill `redesign-existing-projects` foi incorporada a ela na versão 2.1.1 do taste-skill e não existe mais como pasta própria.
- `playwright\playwright-skill`: sem `node_modules`; ela instala o Playwright no primeiro uso (`npm run setup` dentro da pasta da skill).

## Globais, fora do kit

O `graphify` e as skills do kit são globais: ficam em `~/.claude/skills` (as do kit são copiadas pelo `instalar.sh`, listadas em `~/.claude/fluxo-skills.txt`; o `graphify` é independente e não entra no instalador). Os demais pacotes antigos (ponytail, exceto o `ponytail-audit`; ai-memory, strix, security-audit, playwright-cli) estão em `_legado/skills-fora-do-fluxo/`.
