# M3 · File Tree

- **Origem:** github.com/data-goblin/claude-code-filetree, raiz do repositório, commit `3ce5b1c` · v0.8.3 · MIT. Guardados só os arquivos do plugin (sem `media/` e `docs/`).
- **O que faz:** árvore de arquivos que destaca leituras, escritas e commits do Claude e mostra o estado no Git.
- **Usar:** no terminal, `/tui fullscreen` com pelo menos 110 colunas para o painel lateral; `/filetree <caminho>` fixa outra pasta.
- **Instalar:**
  ```
  /plugin marketplace add data-goblin/claude-code-filetree
  /plugin install filetree@claude-code-filetree
  ```
- **Revisão:**
  - Sem rede.
  - Roda utilitários de sistema: `git`, `find`, `du`, `sh`, `readlink`, `rm -f` dos próprios arquivos temporários, e `zoxide`/`tmux`/terminais quando existem. No Windows depende do Git Bash no PATH.
  - Pode gravar no arquivo de atalhos de teclado do Claude Code quando você aceita um atalho.
  - Tem "arquivos protegidos": pode negar Read/Edit nos caminhos que você marcar na árvore.
  - Muda uma configuração própria (animação "shimmer") pelo `$.config.set`.
- **Atenção:** o autor informa testes em Linux, macOS e Windows. Sessões WSL dentro do Claude Desktop não carregam mods.
