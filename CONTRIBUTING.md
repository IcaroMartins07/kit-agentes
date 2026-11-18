# Como contribuir

Obrigado pelo interesse. O kit muda devagar e com prova: cada mudança chega com teste e, quando mexe em skill ou agente, com uma avaliação que mostra a melhora.

## Antes de começar

- Abra uma issue descrevendo o problema ou a ideia. Para bug, diga o que rodou, o que esperava e o que aconteceu (com a saída).
- Mudança grande (agente novo, regra nova do monitor, outro formato de plano): combine na issue antes de escrever.

## Preparar o ambiente

```bash
git clone https://github.com/IcaroMartins07/kit-agentes.git
cd kit-agentes
npm test        # node 18+; sem dependências para instalar
```

Para ver o kit funcionando, instale num projeto de teste: o de [exemplos/tarefas](exemplos/tarefas) serve (copie para fora do kit e siga o README dele). `node agents-mode.mjs <projeto> --dry-run` mostra o que seria feito sem mudar nada.

## Onde fica cada coisa

| Quero mudar | Arquivo |
|---|---|
| O que um agente faz | `agents/<time>/<agente>.md` |
| O fluxo do Maestro | `skills/proprias/modo-deus/SKILL.md` |
| Uma regra do monitor (V1–V12) | `hooks/src/vigia.mjs` e a tabela em `skills/proprias/vigia/SKILL.md` |
| As regras gerais que todo agente recebe | `docs/modelos/CLAUDE.md` |
| O que o instalador detecta | `instalar.mjs`, função `detectar` |
| Um mod de interface | `mods/kit/<mod>/` (testes: `claude plugin test mods/kit/<mod>`) |
| Uma skill de terceiros | não edite à mão: `node skills/atualizar-terceiros.mjs` |

## Regras do repositório

- **Teste junto.** Lógica nova ou corrigida chega com um teste em `testes/`. `npm test` precisa passar.
- **Skill ou agente:** mudança de comportamento vem com um caso em `testes/evals/` rodado antes e depois (veja `testes/evals/README.md`). Sem melhora, a mudança não entra.
- **Tudo declarado é usado.** `testes/uso.test.mjs` falha se uma skill, conector, mod ou hook não for usado por ninguém.
- **Português do Brasil** nos textos para pessoas; nomes de código podem seguir o que já existe.
- **Commits** curtos, no imperativo, dizendo o que mudou e por quê. Um assunto por commit.
- **Nada de segredos** nem dados pessoais em arquivos, exemplos ou testes; use valores falsos claros (`sk-test-...`).

## Abrir o pull request

1. Branch a partir da `main`.
2. `npm test` passando e, se mexeu em mod, `claude plugin test` do mod.
3. Preencha o modelo do PR: o que mudou, por quê, como testou.
4. Atualize o `CHANGELOG.md` na seção "não lançado".
