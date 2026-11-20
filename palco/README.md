# palco

O orquestrador do kit: cada agente roda no seu próprio terminal, como no Orca, sem precisar do Orca. Um daemon local guarda os terminais vivos (inclusive depois que a sessão do Claude fecha); a CLI `palco` abre, lista, lê e manda texto para eles.

Em construção. Esta é a primeira parte: daemon e CLI. Depois vêm o servidor MCP (para o Claude comandar os terminais), a aba Terminais no painel de agentes (no lugar da aba Orca) e a instalação das IAs.

## Instalar

```bash
npm install --prefix palco
```

O `node-pty` traz binário pronto para Windows e macOS; no Linux compila na instalação (python, make e g++).

## Usar

```bash
node palco/src/cli.mjs abrir --cli claude --cwd ../meu-projeto --nome front   # devolve o id, ex.: t1
node palco/src/cli.mjs abrir --cli codex --cwd ../meu-projeto
node palco/src/cli.mjs abrir --cmd aider --arg --yes                           # qualquer CLI
node palco/src/cli.mjs listar
node palco/src/cli.mjs ler t1 --linhas 30                                      # a tela como ela aparece
node palco/src/cli.mjs enviar t1 "roda os testes"                              # texto + Enter
node palco/src/cli.mjs fechar t1
node palco/src/cli.mjs parar                                                   # encerra o daemon e os terminais
```

`--json` em qualquer comando devolve JSON, que é o que o painel e o MCP vão usar.

## Como funciona

| Arquivo | O que faz |
|---|---|
| [`src/cli.mjs`](src/cli.mjs) | A CLI. Sobe o daemon sozinha se ele não estiver de pé |
| [`src/daemon.mjs`](src/daemon.mjs) | Guarda os terminais. Escuta só num endereço local (named pipe no Windows, socket Unix nos outros) e exige o token de `daemon.json` em cada pedido |
| [`src/terminais.mjs`](src/terminais.mjs) | Um PTY (`node-pty`) por agente e uma tela virtual (`@xterm/headless`) que guarda o que ele mostra |
| [`src/perfis.mjs`](src/perfis.mjs) | Como abrir cada IA. No Windows, as CLIs do npm (`.cmd`) passam pelo `cmd.exe` |
| [`src/local.mjs`](src/local.mjs) | Pasta (`PALCO_HOME` ou `~/.claude/palco`), endereço e arquivo do token |

O texto do `enviar` vai direto para o processo do terminal, nunca por um shell. O daemon não abre porta de rede: o acesso pelo celular vai passar pelo Remote Control do Claude, não por um servidor exposto.
