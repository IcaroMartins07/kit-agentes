# arvore

Mod do Claude Code: a árvore de arquivos do projeto ao lado do chat, marcando em tempo real por onde o Claude anda no código.

- **Marcas**: ✎ editado, ◉ lido, ⌕ buscado (com contagem quando repete); `◀ agora` no último arquivo tocado; `(subagente)` quando quem tocou foi um subagente.
- **Modo "tocados"** (padrão): só os arquivos tocados nesta sessão e as pastas acima deles. Leve em qualquer tamanho de repositório.
- **Modo "árvore"**: a árvore inteira, carregada pasta a pasta ao expandir; as pastas no caminho de algo tocado abrem sozinhas. `node_modules`, `.git`, builds e caches ficam de fora.
- Conta as chamadas de Read, Edit, MultiEdit, Write, NotebookEdit, Grep e Glob que deram certo, da sessão e dos subagentes. Só observa: nunca muda o resultado de uma ferramenta.

Abre sozinho no início da sessão; `/arvore` abre de novo.
