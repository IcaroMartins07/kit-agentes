# MCP Orca

O orquestrador do kit: cada agente roda no seu próprio terminal, como no Orca, sem precisar do Orca. Um daemon local guarda os terminais vivos (inclusive depois que a sessão do Claude fecha); a CLI `mcp-orca` abre, lista, lê e manda texto para eles. O comando se chama `mcp-orca`, não `orca`, para não brigar com a CLI do Orca de verdade.

Prontos: daemon, CLI e servidor MCP. O painel de agentes não mostra mais os terminais (a aba **Terminais** saiu na 0.5.0 do painel). Falta instalar as IAs pelo próprio MCP Orca (hoje: `npm install -g @anthropic-ai/claude-code`, `@openai/codex` ou `@google/gemini-cli`).

## Instalar

```bash
cd mcp-orca
npm install
```

O `agents-mode` já faz isso. O `node-pty` traz binário pronto para Windows e macOS; no Linux compila na instalação (python, make e g++).

## Usar

```bash
node mcp-orca/src/cli.mjs abrir --cli claude --cwd ../meu-projeto --nome front   # devolve o id, ex.: t1
node mcp-orca/src/cli.mjs abrir --cli codex --cwd ../meu-projeto
node mcp-orca/src/cli.mjs abrir --cmd aider --arg --yes                           # qualquer CLI
node mcp-orca/src/cli.mjs listar
node mcp-orca/src/cli.mjs ler t1 --linhas 30                                      # a tela como ela aparece
node mcp-orca/src/cli.mjs enviar t1 "roda os testes"                              # texto + Enter
node mcp-orca/src/cli.mjs fechar t1
node mcp-orca/src/cli.mjs parar                                                   # encerra o daemon e os terminais
```

`--json` em qualquer comando devolve JSON, que é o que o painel e o MCP vão usar.

## No Claude (MCP)

O plugin `modo-deus` registra o servidor `mcp-orca` (`.claude-plugin/plugin.json`). Com as dependências instaladas, toda sessão do Claude ganha cinco ferramentas:

| Ferramenta | O que faz |
|---|---|
| `terminais_listar` | Os terminais, com id, nome, CLI, pasta e estado |
| `terminal_abrir` | Abre claude, codex ou gemini numa pasta e devolve o id |
| `terminal_ler` | A tela atual de um terminal, como ela aparece |
| `terminal_enviar` | Digita um texto e aperta Enter (ou não, com `enter: false`) |
| `terminal_fechar` | Encerra o processo de um terminal |

Exemplo: "abre o codex em C:\projeto como revisor e pede para ele revisar o último commit; me avisa quando ele responder".

Pelo MCP só abre IA conhecida. Ferramenta MCP não passa pelos hooks do kit (cerca e território), então comando livre (`--cmd`) fica só na CLI, para você. Cada ferramenta pede a sua permissão como qualquer MCP, até você liberá-la.

## Como funciona

| Arquivo | O que faz |
|---|---|
| [`src/cli.mjs`](src/cli.mjs) | A CLI |
| [`src/mcp.mjs`](src/mcp.mjs) | O servidor MCP (stdio), com as cinco ferramentas |
| [`src/cliente.mjs`](src/cliente.mjs) | Fala com o daemon, para a CLI e o MCP; sobe o daemon se ele não estiver de pé |
| [`src/daemon.mjs`](src/daemon.mjs) | Guarda os terminais. Escuta só num endereço local (named pipe no Windows, socket Unix nos outros) e exige o token de `daemon.json` em cada pedido |
| [`src/terminais.mjs`](src/terminais.mjs) | Um PTY (`node-pty`) por agente e uma tela virtual (`@xterm/headless`) que guarda o que ele mostra |
| [`src/perfis.mjs`](src/perfis.mjs) | Como abrir cada IA. No Windows, as CLIs do npm (`.cmd`) passam pelo `cmd.exe` |
| [`src/local.mjs`](src/local.mjs) | Pasta (`MCP_ORCA_HOME` ou `~/.claude/mcp-orca`), endereço e arquivo do token |

O texto do `enviar` vai direto para o processo do terminal, nunca por um shell. O daemon não abre porta de rede: o acesso pelo celular vai passar pelo Remote Control do Claude, não por um servidor exposto.
