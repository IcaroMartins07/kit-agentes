# palco

Mod do Claude Code: um canvas ao lado do chat para dispor e rodar agentes e comandos.

- **Nós**: nota, Claude (subagente da sessão, inclusive os agentes do modo-deus), Codex (`codex exec`), Gemini (`gemini -p`) e comando de shell.
- **Canvas**: arraste o fundo para mover a vista e os nós para reposicioná-los; setas movem a vista, `0` volta ao centro, Delete exclui o nó selecionado. O layout fica salvo por projeto.
- **Rodar**: selecione o nó, escreva o prompt ou comando e clique em rodar. A saída aparece no nó e por completo em "saída".
- **Cerca**: comandos e prompts passam pelas mesmas regras de ação perigosa do modo-deus (push forçado, reset --hard, deploy, `.env`, segredos, flags que desligam aprovações) antes de rodar.

Abra com `/palco`. Codex e Gemini rodam em modo não interativo; o mod não passa flags que liberam escrita sem aprovação.
