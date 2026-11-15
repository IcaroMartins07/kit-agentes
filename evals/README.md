# Evals do modo-deus

Casos de avaliação das skills do kit, no formato do `claude plugin eval` (Claude Code 2.1.x): cada caso é uma pasta com `prompt.md` (frontmatter com limites e ferramentas + o pedido como o usuário digitaria) e `graders/*.md` (um arquivo por verificação, com `type` no frontmatter). O comando acha os casos em `evals/**/prompt.md` ou `evals/**/case.yaml`.

```
evals/
  modo-deus/                 casos da skill do Maestro
    classificar-simples/     mudança pequena → simples / medium
    classificar-complexa/    migração + autorização → complexa / high
    plano-valido/            grava .claude/modo-deus/plano.json no contrato
  regressao/                 casos que nasceram de falhas reais (/retro)
  results/                   saída das execuções (fora do git)
```

## Rodar

Toda execução roda sessões reais do Claude e **custa** (cada caso roda 3 vezes por braço, e por padrão há um braço sem o plugin para comparar). Rode a partir da raiz do kit:

```bash
# um caso, uma execução, para conferir se está bem escrito
claude plugin eval . --case classificar-simples --runs 1 --no-publish

# a suíte toda (o caso plano-valido precisa gravar arquivo)
claude plugin eval . --allow-tools Write --no-publish

# só os de regressão
claude plugin eval . --tag regressao --allow-tools Write
```

`--threshold` (padrão 1.0) faz o comando sair com erro se algum caso ficar abaixo da nota; `--json resultado.json` grava o detalhe por execução. Os graders `regex`, `tool_used` e `file_exists` são grátis; os `llm` usam um juiz (haiku por padrão, `--judge-model` troca).

Não há grader com código próprio no `claude plugin eval`. O caso `plano-valido` cobre o contrato com regex e um juiz que recebe as mesmas regras de `hooks/src/plano.mjs`. Para conferir com o validador de verdade, rode com `--keep-temp` e depois `node hooks/src/plano.mjs validar <pasta-temporária>/.claude/modo-deus/plano.json`.

## Como a retrospectiva acrescenta casos

A skill `retrospectiva` (`/retro`) transforma cada falha real que motivou uma mudança aprovada num caso permanente:

1. Cria `evals/regressao/<AAAA-MM-DD>-<assunto>/` com `prompt.md` reproduzindo o pedido que falhou (sem citar a skill pelo nome) e `tags: [regressao, <skill>]`.
2. Escreve os graders a partir da evidência: `regex` ou `tool_used` quando a falha é observável no texto ou nas ferramentas (ex.: editou arquivo fora do escopo, não rodou o teste), `llm` com PASS/FAIL concretos para o resto.
3. Roda o caso **antes** da mudança (tem de falhar ou ter nota baixa) e **depois** (tem de subir sem derrubar os outros casos). Sem melhora, a proposta é descartada e o caso não entra.
4. Commita o caso junto com a mudança da skill, a versão nova e a linha do CHANGELOG.

Lição que só vale para um projeto vai para o `REGRAS.md` dele e não gera caso aqui.
