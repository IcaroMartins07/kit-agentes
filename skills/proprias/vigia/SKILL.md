---
name: vigia
description: O que fazer ao receber um alerta ou bloqueio do monitor do modo-deus (mensagens "[modo-deus · V1]" a "[modo-deus · V11]"). Use quando um hook devolver alerta de fuga de escopo, alucinação de arquivo ou comando, entrega sem prova, loop, estouro de teto ou teste moldado ao código, e quando o Maestro precisar decidir o que fazer com esses alertas.
---

# vigia

O monitor do modo-deus observa cada chamada de ferramenta dos agentes e avisa quando o trabalho começa a fugir do combinado ou a se apoiar em algo que não existe. A mensagem chega como `[modo-deus · V<n>] motivo`.

- **Perfil estrito:** tudo é alerta. Você continua, mas corrige o rumo agora.
- **Perfil deus:** V1, V3, V5, V7 e V8 bloqueiam (a ação não acontece). V2 e V9 bloqueiam em qualquer perfil.
- **Perfil leve:** monitor desligado (só V2, V9, trava e contratos).

Regra geral: não discuta com o alerta nem tente contorná-lo (outro caminho, Bash no lugar do Edit, nome de arquivo parecido). Se achar que é falso positivo, diga isso na entrega, com o caso concreto; o Maestro registra para a retro.

## Por regra

| Regra | O que disparou | Dev / QA | Maestro |
|---|---|---|---|
| **V1** fuga de escopo | edição fora de `escopo` da sua tarefa (pela branch `-T<n>`) | Não edite. Entregue como `bloqueada` ou, se o resto da tarefa anda sem o arquivo, termine e cite em `observacoes` qual arquivo precisa e por quê. | Amplie o escopo no plano (sem sobrepor tarefa paralela) ou crie tarefa nova para o time dono. |
| **V2** fuga de território | arquivo de outro time | Devolva o item ao Maestro com arquivo e motivo. | Despache o time dono. |
| **V3** arquivo/símbolo inexistente | 3 falhas recentes de arquivo inexistente ou `old_string` não encontrado | Pare de adivinhar. Use `graphify query`/`explain`, Grep ou Glob; leia o arquivo atual com Read; só então edite, copiando o trecho exato. | Se repetir, a tarefa provavelmente cita arquivo que não existe: corrija o plano. |
| **V4** comando inexistente | "command not found", script ausente | Use só os comandos listados no alerta (REGRAS.md) ou os scripts do `package.json`. Nunca invente script. | Se o comando certo faltar no REGRAS.md, peça ao usuário para completar. |
| **V5** "pronto" sem prova | entrega `pronta` sem os comandos de `testes[]` rodados depois da última edição | Rode os testes agora e refaça a entrega com o resultado real, ou entregue como `bloqueada`. | Não aceite a entrega até a prova aparecer; no estrito, peça a prova ao agente. |
| **V6** afirmação sem lastro | comando citado na entrega que o agente não rodou | Corrija a entrega: só o que rodou, com a saída real. | Peça o auditor-de-fatos antes do PR se houver mais de um V6. |
| **V7** loop | mesma chamada 4× seguidas ou mesmo erro 3× | Mude de abordagem: leia o erro inteiro, use superpowers:systematic-debugging. Na reincidência (bloqueio no deus), pare e devolva ao Maestro. | Replaneje: quebre a tarefa, mude a abordagem ou suba a classe para complexa. |
| **V8** estouro | subagente passou do teto de chamadas ou de tempo da classe | Pare. Entregue como `bloqueada` com o que fez, o que falta e onde travou. | Replaneje: tarefa simples que estourou vira complexa (fica um V11 para a retro). |
| **V9** ação perigosa | push forçado, deploy, segredo… | Não contorne. Peça ao usuário. | Leve ao usuário. |
| **V10** teste moldado ao código | QA lendo a implementação da tarefa antes de escrever o teste | Feche o arquivo. Escreva o teste a partir dos critérios de aceite da spec; leia a implementação só depois, para depurar falha. | Nada, se o teste nasceu do critério; senão peça outro QA. |
| **V11** esforço errado | tarefa `simples` reprovada na revisão ou que estourou o teto | — | Reclassifique como complexa (`esforco: high`). A retro usa o registro para recalibrar a lista de `complexidade` do kit. |

## Onde ver

- `/modo-deus:deus-status` — tarefas, subagentes, alertas por regra e o painel `.claude/modo-deus/painel/index.html`.
- Telemetria: `.claude/modo-deus/telemetria/AAAA-MM-DD.jsonl` (linhas com `regra` e `alerta: true` ou `resultado: "bloqueado"`).
- Sessão com alerta ou bloqueio deixa `.claude/modo-deus/retro/PENDENTE.json`; a próxima sessão avisa para rodar `/modo-deus:retro`.
