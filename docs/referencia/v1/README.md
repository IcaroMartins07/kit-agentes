# Kit fluxo-agentes

Fluxo de trabalho dos agentes do Claude Code, para usar em qualquer projeto, só na máquina local.

## O que tem

- `skills/`: a orquestradora `using-agent-skills` (tabela de fases e trava), as Agent Skills de engenharia (spec, plano, TDD, depuração, revisão, entrega), `humanizer`, `playwright-skill`, `ponytail-audit` e as de tela (`impeccable` e `design-taste-frontend`, que já inclui o redesign de projetos existentes). Ficam **globais**, em `~/.claude/skills`, junto com o `graphify`, que não faz parte do kit.
- `commands/`: `/spec`, `/plan`, `/build`, `/review`, `/ship` e `/auditar` (relatório pontual do repositório com `ponytail-audit`, não altera nada). `/build` e `/review` incluem a disciplina do ponytail: reutilizar o que existe, nada que ninguém pediu, sem cortar segurança, validação, acessibilidade ou testes.
- `hooks/`:
  - `checar-skills.sh` (início da sessão): injeta as regras do projeto e a orquestradora, e avisa se faltar algo (`<a definir>` no `REGRAS.md` é pendência assumida e não gera aviso);
  - `orquestrar.sh` (a cada mensagem): uma linha lembrando de invocar a skill da fase;
  - `exigir-skill.sh` (antes de cada ação): bloqueia edição de código (Edit/Write ou escrita pelo Bash com `>`, `>>`, `tee`, `sed -i`, `perl -i`) e commit de código sem skill de construção ou de bug, e abrir PR ou MR (`gh pr create`, `glab mr create` ou `git push -o merge_request.create`) sem `code-review-and-quality` e `humanizer`. Só conta a skill realmente invocada pela ferramenta Skill, não o nome citado no texto.
- `modelos/REGRAS.md`: regras do projeto (fonte de verdade, comandos, telas, fluxo, Definition of Done) com campos `<...>` para preencher.

## Desempenho

O `exigir-skill.sh` roda antes de cada Edit, Write e Bash, então foi escrito para não abrir processos à toa (no Windows cada um custa dezenas de ms):

- comandos e edições que não interessam (`ls`, `npm`, `.md`) saem só com bash embutido, em ~40 ms;
- o node abre no máximo duas vezes, e a transcrição só é lida quando há skill a conferir;
- um cache em `%TEMP%`/`$TMPDIR` (`fluxo-skills-*.json`) guarda até onde a transcrição já foi lida, então cada chamada lê só o trecho novo.

Medido numa transcrição de 33 MB: `ls` de ~700 ms para ~40 ms, edição de `.ts` de ~650 ms para ~130 ms, commit de ~950 ms para ~300 ms.
- `instalar.sh`: instala as skills globais e copia comandos, hooks e regras para o repositório, mantendo tudo local.

## Instalar

Skills, uma vez por máquina (e de novo a cada atualização do kit):

```bash
~/.claude/kits/fluxo-agentes/instalar.sh --global
```

Num projeto (já inclui o passo acima):

```bash
~/.claude/kits/fluxo-agentes/instalar.sh /caminho/do/repositorio
```

Depois preencha `.claude/fluxo/REGRAS.md` e abra uma sessão nova. Para o Claude fazer as duas coisas, use o prompt de `PROMPT.md`.

## Por que nada vai para o git

- As skills são globais e não entram em nenhum repositório.
- Comandos, hooks e regras entram no `.git/info/exclude` do repositório, que é local, e não no `.gitignore`, que é versionado.
- Os hooks ficam no `.claude/settings.local.json`; o `.claude/settings.json` do projeto não muda.
- O MCP do Playwright é registrado com `claude mcp add --scope local`, que grava no `~/.claude.json` ligado à pasta, com versão fixa (`PLAYWRIGHT_MCP` no `instalar.sh`).
- O exclude usado é o do diretório comum do git, que vale também para as worktrees. Numa worktree nova os arquivos do kit não existem: rode `instalar.sh` nela.
- Comando que o projeto já versiona com o mesmo nome é pulado, e skill global que já existe e não veio do kit também, para não sobrescrever o que é de outra origem.

## Testes

- `testes/testar-trava.sh hooks/exigir-skill.sh`: 32 cenários (edição, escrita pelo Bash, commit, merge, PR no GitHub, MR no GitLab, menção solta de skill, cache incremental e aviso do `REGRAS.md`).
- `testes/testar-instalador.sh`: 10 cenários com HOME e repositório temporários (instalação, git limpo, worktree, remoção do que saiu do kit, skill do usuário intocada).

Os dois terminam com `TODOS OK`. Rode os dois depois de mudar hooks ou o instalador.

## Atualizar

Mude os arquivos aqui no kit e rode `instalar.sh` de novo (`--global` para só as skills; com o caminho para cada projeto). Ele atualiza skills, comandos e hooks sem duplicar nada, remove skill ou comando que saiu do kit (só os que o kit instalou) e não toca no `REGRAS.md` já preenchido.

## Limites conhecidos

- A trava prova que a skill foi invocada, não que foi seguida. Qualidade continua vindo dos testes, da revisão e de você.
- Escrita de código por script (`python -c`, `node -e` gravando arquivo) não é detectada.
- As skills globais entram no contexto de toda sessão, em qualquer projeto.

## Remover

- **De um projeto:** apague as pastas listadas no bloco `# fluxo-agentes (kit local)` do `.git/info/exclude`, as três entradas de hook do `.claude/settings.local.json` e rode `claude mcp remove playwright -s local` na pasta.
- **Skills globais:** apague de `~/.claude/skills` as pastas listadas em `~/.claude/fluxo-skills.txt`.
