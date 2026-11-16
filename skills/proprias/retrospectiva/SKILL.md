---
name: retrospectiva
description: Retrospectiva e autoaprimoramento do modo-deus. Use ao rodar /retro, quando o início da sessão avisar que há retro pendente (retro/PENDENTE.json), depois de uma sessão com bloqueios, alertas ou tarefas reprovadas, ou quando o usuário pedir para melhorar uma skill, um agente, a regra de esforço ou um detector do kit a partir de falhas reais.
---

# retrospectiva · autoaprimoramento do kit

Você transforma falhas reais da sessão em melhorias medidas do kit. Ciclo: **coleta → diagnóstico → proposta → eval antes/depois → aprovação do usuário → aplicação → regressão**.

Regra de ouro: **nenhuma skill, agente, regra ou detector do kit muda sem aprovação explícita do usuário e sem eval que mostre melhora.** Sem melhora, a proposta é descartada (fica registrada como descartada, nada é aplicado).

## 1 · Coleta

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/src/retro.mjs" coletar
```

Argumentos opcionais: `[raiz]` (padrão: o projeto do cwd), `--sessao <id>`, `--desde AAAA-MM-DD`. Sem filtro e com `pendente` preenchido na saída, refaça com `--sessao <pendente.sessao>` para olhar a sessão que disparou a retro.

A saída é JSON, determinística, sem LLM:

| Campo | O que traz |
|---|---|
| `totais.por_regra` / `por_agente` | bloqueios, alertas, `contrato_falhou`, `erro_hook` |
| `bloqueios`, `alertas` | por regra, com até 5 exemplos (`alvo`, `motivo`, `agente`, `ts`) |
| `contrato_falhou` | por agente: quem não entregou no formato combinado |
| `plano` | tarefas reprovadas, `rodadas_revisao`, itens de revisão abertos por gravidade, `v11` (classe simples que reprovou) |
| `graphify` | `LESSONS.md` de `graphify reflect` e a contagem de consultas `useful` / `dead_end` / `corrected` |
| `causas` | já agrupadas, da maior para a menor |
| `vazio` | `true` quando não há telemetria nem plano: diga isso e encerre |

Some à coleta o que só a conversa tem: as reprovações da Revisão e como foram corrigidas. Se o graphify estiver instalado e a sessão teve consultas ao grafo, registre o desfecho delas antes (`graphify save-result --outcome useful|dead_end|corrected`) e rode `graphify reflect` para atualizar as lições.

## 2 · Diagnóstico

Cada causa aponta para um alvo provável:

| Causa | Regras | Onde costuma estar o problema |
|---|---|---|
| `skill_nao_disparou` | trava | `description` da skill não cobre o gatilho, ou o comando não chama a skill |
| `instrucao_ambigua` | contrato | o agente não sabe o formato de saída: corpo do agente em `agents/` ou exemplo da skill |
| `passo_pulado` | V5, V6 | o fluxo da skill não exige a prova (teste rodado, evidência) no passo certo |
| `esforco_errado` | V11 + `plano.v11` | regra de classificação simples/complexa da skill `modo-deus` (passo 2.3) |
| `fuga` | V1, V2, V10 | escopo mal desenhado no plano, ou território do agente mal descrito |
| `alucinacao` | V3, V4, V6 | o agente não consulta o grafo ou o `REGRAS.md` antes de agir |
| `loop_estouro` | V7, V8 | tarefa grande demais ou critério de pronto vago |
| `falso_positivo_suspeito` | qualquer | o **detector** pode estar errado (veja abaixo) |

**Heurística de falso positivo** (em `retro.mjs`, função `falsosPositivos`): na mesma sessão, o mesmo agente levou 2 ou mais bloqueios da mesma regra no mesmo alvo e, depois do último, usou a mesma ferramenta com sucesso em outro alvo. É só suspeita: leia os exemplos e decida se o detector errou ou se o agente contornou uma regra legítima (aí a causa é `fuga`, não falso positivo).

Para cada causa, separe:
- **Lição do kit** (vale para qualquer projeto) → vira proposta de mudança no kit.
- **Lição do projeto** (território, comando, convenção deste repositório) → vai para `.modo-deus/REGRAS.md` do projeto, com a aprovação do usuário. **Não** vai para a skill global e não precisa de eval.

Uma ocorrência isolada raramente justifica mudar o kit. Priorize causas que se repetem ou que custaram uma rodada de revisão.

## 3 · Proposta

Uma proposta por causa, em `.modo-deus/retro/<AAAA-MM-DD>-<assunto>.md`. O esqueleto sai do script, já com a evidência:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/src/retro.mjs" proposta .modo-deus/retro/2026-11-15-esforco-migracao.md --causa esforco_errado [--sessao X] [--desde D]
```

Preencha: hipótese, alvo (skill, agente, regra de esforço, detector ou `REGRAS.md`), arquivo exato e o **diff sugerido**, o menor possível. Para escrever ou ajustar skill, siga `superpowers:writing-skills`. Não amplie o escopo: um diff resolve uma causa.

## 4 · Avaliação antes e depois

As evals ficam em `testes/evals/` do kit, no formato do `claude plugin eval` (veja `testes/evals/README.md`): pasta com `prompt.md` + `graders/*.md`.

1. Crie o caso de regressão `testes/evals/regressao/<data>-<assunto>/` reproduzindo a falha real: o pedido como o usuário fez, sem citar a skill; graders `regex`/`tool_used`/`file_exists` quando a falha é observável, `llm` com PASS/FAIL concretos para o resto; `tags: [regressao, <skill>]`.
2. **Antes:** sem o diff, `claude plugin eval "${CLAUDE_PLUGIN_ROOT}" --case "<data>-<assunto>" --runs 3 --no-publish`. O caso deve falhar ou ter nota baixa; se já passa, o caso não reproduz a falha: reescreva.
3. **Depois:** aplique o diff numa branch do kit e rode de novo o caso novo e a suíte da skill afetada (`--tag <skill>`).
4. Melhorou no caso novo e não caiu em nenhum outro → segue. Senão, **descarte**: anote na proposta "descartada: sem melhora (antes X, depois Y)" e reverta a branch.

Eval custa: avise o usuário do número de execuções antes de rodar e peça o ok dele para rodar.

## 5 · Aprovação

Mostre ao usuário, numa mensagem curta: causa, evidência (2 ou 3 linhas), diff, nota antes e depois. **Pare e espere um sim explícito.** Sem aprovação, nada é aplicado ao kit nem ao `REGRAS.md`.

## 6 · Aplicação (só depois do sim)

No repositório do kit (`${CLAUDE_PLUGIN_ROOT}`; em desenvolvimento, o clone do kit-agentes), numa branch `retro/<data>-<assunto>`:

1. Aplique o diff.
2. Suba a versão (patch para ajuste de texto, minor para comportamento novo) nos três lugares, com o mesmo número:
   - `kit.json` → `versao`
   - `.claude-plugin/plugin.json` → `version`
   - `.claude-plugin/marketplace.json` → `plugins[].version` do modo-deus
3. Entrada no `CHANGELOG.md`: versão, data, a causa e o caso de regressão.
4. Commite o diff, o caso em `testes/evals/regressao/` e a versão juntos. `npm test` e `claude plugin validate --strict .` passam antes do commit.
5. Merge e push são do usuário.

Lição de projeto: edite `.modo-deus/REGRAS.md` do projeto (com o sim do usuário) e pare aí.

## 7 · Encerrar

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/src/retro.mjs" concluir
```

Apaga `retro/PENDENTE.json` para o aviso não voltar. Rode ao fim da retro, mesmo que todas as propostas tenham sido descartadas ou que a coleta tenha vindo vazia.

## Fim

Resumo ao usuário: causas encontradas, propostas aplicadas (com versão nova), descartadas (com o motivo) e lições gravadas no `REGRAS.md` do projeto.
