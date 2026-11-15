# Migrar do fluxo-agentes (v1) para o modo-deus

A migração tem dois lados, feitos em separado e sempre com simulação antes:

- **Global:** as skills que a v1 copiou para `~/.claude/skills` (listadas em `~/.claude/fluxo-skills.txt`).
- **Por projeto:** o que a v1 deixou dentro de cada repositório (`.claude/fluxo/`, comandos, hooks no `.claude/settings.local.json` e o bloco no `.git/info/exclude`).

Nada é apagado sem backup. Tudo vai para `~/.claude/modo-deus/backups/migracao-v1-<data>/`.

Nos comandos abaixo, `KIT` é a pasta do modo-deus (este repositório). Use caminhos completos.

## 1. Dependências e plugin

```bash
node KIT/instalar.mjs dependencias --dry-run   # mostra o que falta
node KIT/instalar.mjs dependencias             # instala superpowers, claude-security, frontend-design e graphify
```

Instale o plugin modo-deus pelo marketplace do kit (`/plugin` no Claude Code). Confira que ele aparece em `~/.claude/plugins/installed_plugins.json`. A migração global se recusa a remover skills enquanto o plugin não estiver instalado, para você não ficar sem elas no meio do caminho.

## 2. Simular

Nada é alterado nesta etapa.

```bash
node KIT/scripts/migrar-v1.mjs --global
node KIT/scripts/migrar-v1.mjs /caminho/do/projeto
```

O passo global mostra, para cada skill da v1:

- `remover`: o modo-deus já cobre a skill, pelo plugin (`modo-deus:<nome>`), pelo superpowers ou por uma substituta (por exemplo, `using-agent-skills` deu lugar à skill `modo-deus`);
- `manter`: a skill não tem equivalente e fica onde está;
- `ausente`: está no manifesto, mas a pasta já não existe.

O `graphify` e as skills que não estão no `fluxo-skills.txt` nunca entram na lista.

O passo do projeto lista o que será removido:

- `.claude/fluxo/` (hooks, `REGRAS.md` e `instalados.txt` da v1);
- os comandos da v1 em `.claude/commands/` listados no `instalados.txt` (os que o projeto versiona são pulados);
- os hooks do `.claude/settings.local.json` cujo comando aponta para `.claude/fluxo/hooks/` (o resto do arquivo fica);
- o bloco `# fluxo-agentes (kit local)` do `.git/info/exclude` (as outras linhas ficam).

## 3. Aplicar

```bash
node KIT/scripts/migrar-v1.mjs --global --aplicar
node KIT/scripts/migrar-v1.mjs /caminho/do/projeto --aplicar
```

O passo do projeto pode ser repetido em cada repositório que usava a v1. Rodar de novo num projeto já migrado não faz nada.

Se a v1 registrou o MCP do Playwright no projeto, ele continua. Para tirar: `claude mcp remove playwright -s local`, dentro da pasta do projeto.

## 4. Instalar o kit v2 no projeto

```bash
node KIT/instalar.mjs /caminho/do/projeto
```

O instalador cria `.claude/modo-deus/` com um `REGRAS.md` novo, gerado a partir do que ele detecta no projeto. O `REGRAS.md` preenchido da v1 está no backup (`projeto-<nome>/fluxo/REGRAS.md`): use-o para completar o novo. Até você rodar o instalador, o `.claude/settings.local.json` pode aparecer no `git status`, porque o bloco da v1 que o escondia saiu do exclude. O instalador põe o bloco do modo-deus no lugar.

## 5. Conferir

```bash
node KIT/instalar.mjs doctor /caminho/do/projeto
```

Depois abra uma sessão nova do Claude Code no projeto. A primeira mensagem deve mostrar `modo-deus ativo`.

## Voltar atrás

O backup fica em `~/.claude/modo-deus/backups/migracao-v1-<data>/`:

| No backup | Volta para |
|---|---|
| `global/skills/<nome>/` | `~/.claude/skills/<nome>/` |
| `global/fluxo-skills.txt` | `~/.claude/fluxo-skills.txt` |
| `projeto-<nome>/fluxo/` | `<projeto>/.claude/fluxo/` |
| `projeto-<nome>/commands/*.md` | `<projeto>/.claude/commands/` |
| `projeto-<nome>/settings.local.json` | `<projeto>/.claude/settings.local.json` |
| `projeto-<nome>/exclude` | `<projeto>/.git/info/exclude` |

`projeto-<nome>/ORIGEM.txt` guarda o caminho do projeto. Para tirar o modo-deus de um projeto antes de restaurar a v1, rode `node KIT/instalar.mjs --remover /caminho/do/projeto`. Ele também faz backup do que é seu (`REGRAS.md`, telemetria, retro).

## Decisões que ficam com você

- **`~/.claude/kits/fluxo-agentes`:** hoje é uma cópia da v1. Apontá-la para a v2 (ou apagá-la) é decisão sua, depois de usar o modo-deus por um tempo. Os scripts não mexem nela.
- **Skills globais da v1:** o `--global --aplicar` remove só as que o modo-deus cobre e só com o plugin instalado. As que ficarem como `manter` são suas: apague à mão se não quiser mais.
- **Arquivar a v1:** a pasta `v1/` deste repositório e o repositório `fluxo-agentes` continuam como estão até você decidir. O plano pede uma semana de uso real sem precisar voltar atrás antes de arquivar.

## Atualizar as skills de terceiros

Não faz parte da migração, mas usa o mesmo cuidado (simulação primeiro):

```bash
node KIT/scripts/atualizar-terceiros.mjs                  # compara o local com o commit pinado de cada pacote
node KIT/scripts/atualizar-terceiros.mjs --ultimo         # compara com o HEAD remoto
node KIT/scripts/atualizar-terceiros.mjs --pacote humanizer --commit <sha> --aplicar
```

Com `--aplicar`, a pasta local fica igual à da origem, o commit é atualizado na tabela de `skills/terceiros/README.md` e o script lista as "Alterações locais" que você precisa refazer à mão. Revise com `git diff skills/terceiros` e rode `npm test` antes de commitar.
