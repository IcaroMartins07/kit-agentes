# M6 · Terminal Browser

- **Origem:** github.com/zenbu-labs/terminal-browser, pasta `claude-code-plugin/`, commit `53b7f59` · v0.0.2 · MIT. Guardado só o plugin; o aplicativo `terminal-browser` é instalado à parte pelo README do autor.
- **O que faz:** abre um navegador real num painel do terminal, ao lado da conversa.
- **Usar:** instale primeiro o aplicativo terminal-browser; depois o plugin, e abra `/browser`.
- **Instalar:**
  ```
  /plugin marketplace add zenbu-labs/terminal-browser
  /plugin install terminal-browser@terminal-browser
  ```
- **Revisão:** roda o executável `terminal-browser` (capabilities, launch) e conversa com ele em `http://127.0.0.1:<porta>`. Sem outra rede.
- **Atenção:** experimental. Exige terminal com gráficos Kitty e Unicode placeholders; no Windows, WSL e terminal compatível. Nesta máquina (Windows sem WSL configurado para isso) não funciona como está.
