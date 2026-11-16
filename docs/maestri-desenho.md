# Maestri dentro do Claude Code · proposta de desenho

Status: **proposta**, nada implementado. Base: API de mods do Claude Code 2.1.325 (lida em 2026-11-15).

## O que é

Um mod (plugin com `hooks/register.tsx`) que abre um **painel-canvas** ao lado do chat. No canvas você posiciona **nós**: agentes (Claude, Codex, Gemini quando instalado), comandos de shell e notas. Liga os nós com **conexões** (a saída de um vira a entrada de outro) e dispara, acompanha e reaproveita o trabalho de cada um sem sair do Claude Code. O Claude da sessão também enxerga o canvas por ferramentas e pode orquestrar por você ("peça ao codex para revisar o diff").

## O que a API permite (e o que não)

| Precisa | Como | Limite |
|---|---|---|
| Canvas com pan e nós arrastáveis | elemento `Client` com `onPointer` (down/move/up, captura fora da borda), `onKey`, estado local e `every` | desenho em **células** (caixas e texto), não pixels; no `Client` não há `Svg` |
| Painel fixo ao lado do chat | `$.ui.open({ id, title })` + `ui.render` do `Pane` | |
| Agente Claude | `$.agent.spawn({ subagentType, prompt })` (subagentes da própria sessão, inclusive os 16 do modo-deus); `$.ui.view({ agentId })` abre a conversa dele | roda dentro da sessão atual |
| Codex, Gemini, `claude -p` | `$.process.spawn({ argv })` com saída em fluxo: `codex exec "<prompt>"`, `gemini -p "<prompt>"`, `claude -p "<prompt>"` | **sem terminal interativo** (sem PTY): só modo não interativo |
| Comando de shell | `$.process.spawn` / `$.process.run` | o hook de cerca (V9) do modo-deus não vê esses processos: o mod aplica a mesma lista de bloqueio |
| Guardar o layout | `$.store` (entre sessões, por projeto) e `$.state` (sessão) | |
| Claude orquestrar o canvas | `$.tool.register`: `canvas_listar`, `canvas_enviar`, `canvas_ler_saida`, `canvas_criar_no` | |
| Rotinas | `$.clock.every` / `after` | só enquanto a sessão está aberta |
| Avisos | `$.ui.toast`, faixa `AbovePrompt`, `$.ui.status` | |

## Desenho

```
┌ Painel "Maestri" ───────────────────────────────────────────────┐
│ [+ Claude] [+ Codex] [+ Gemini] [+ Cmd] [+ Nota]   zoom 100%  ⌂  │
│                                                                  │
│   ┌ revisor (claude) ──┐        ┌ codex · testes ───┐            │
│   │ ● rodando  01:12   │──────▶ │ ○ aguardando       │            │
│   │ > revisa o diff... │        │ prompt: rode e...  │            │
│   └────────────────────┘        └────────────────────┘            │
│                    ┌ nota ───────────────┐                        │
│                    │ usar data-cy        │   ┌ cmd · npm test ┐   │
│                    └─────────────────────┘   │ ✔ 42 passed    │   │
│                                              └────────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│ nó selecionado: codex · testes   [▶ rodar] [✎ prompt] [⧉ saída]  │
└──────────────────────────────────────────────────────────────────┘
```

- **Canvas** (`Client`): coordenadas virtuais ilimitadas; arrastar no vazio faz pan, arrastar um nó move, clique seleciona, duplo clique abre a saída; teclas `+`/`-` zoom (densidade de células), `0` volta ao centro.
- **Barra inferior** (elementos normais do Pane): ações do nó selecionado, `Input` para o prompt.
- **Saída** do nó: últimas linhas no próprio nó; completa num painel próprio (`Code`/`Markdown`).
- **Conexão** A → B: quando A termina, B recebe a saída de A anexada ao prompt e roda (pipeline). Ciclos são recusados.
- **Estado do nó**: aguardando, rodando, concluído, falhou, bloqueado (cerca).

## Integração com o modo-deus

- Os 16 agentes do modo-deus aparecem como tipos de nó Claude (dev-front, qa-e2e, revisor…).
- O `plano.json` do Maestro pode ser **projetado no canvas**: uma tarefa por nó, dependências como conexões, cor por status. Você acompanha o pipeline do `/deus` visualmente.
- **Times externos**: uma tarefa do plano pode ir para o Codex (ex.: segunda revisão independente), com a entrega no mesmo contrato `lerEntrega`.
- A telemetria do kit registra os nós (ferramenta `maestri`), então o monitor e o `/retro` enxergam o trabalho feito fora do Claude.

## Segurança

- Comando de shell e prompt de CLI passam pela mesma cerca V9 do kit (função reaproveitada de `hooks/src/cerca.mjs`) antes de rodar.
- Nada roda sozinho: cada nó só roda por clique seu ou por chamada de ferramenta do Claude, que você vê no chat.
- Codex e Gemini rodam com o modo de aprovação deles; o mod não passa flags que liberam escrita sem pergunta.

## Fases

| Fase | Entrega |
|---|---|
| M1 · Canvas | painel, canvas com pan, nós de nota, arrastar, salvar layout |
| M2 · Nós que rodam | Claude (`agent.spawn`), Codex (`codex exec`), comando de shell; saída em fluxo; cerca |
| M3 · Conexões | pipeline A → B, recusa de ciclo, rodar cadeia |
| M4 · Claude orquestra | ferramentas `canvas_*` para o modelo |
| M5 · modo-deus | projetar o `plano.json`, times externos, telemetria |

## Decisões em aberto

1. **Nome**: "Maestri" é o nome de um app que você já usa (há skills `maestri-*` instaladas). Usar o mesmo nome confunde as skills; sugestão: `palco` ou `maestri-cc`.
2. **Gemini CLI** não está instalado (`npm i -g @google/gemini-cli` + login). Instalar agora ou deixar o nó Gemini aparecer como "não instalado"?
3. **Onde mora**: segundo plugin no marketplace `kit-agentes` (recomendado, versiona junto) ou mod solto.
