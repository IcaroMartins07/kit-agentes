# savvy-progress

- **Origem:** github.com/JohnnyVizz/claude-kit, pasta `plugins/savvy-progress`, commit `c871c15` · v1.2.1 · MIT
- **O que faz:** barra de progresso acima do prompt e painel de subagentes (modelo, tarefas, contexto, tempo, custo estimado).
- **Usar:** `/agents-info` abre o painel. A barra depende de tarefas que reportem progresso; a skill savvy-flow é opcional.
- **Instalar:**
  ```
  /plugin marketplace add JohnnyVizz/claude-kit
  /plugin install savvy-progress@claude-kit
  ```
- **Status nesta máquina:** já instalado (escopo de usuário).
- **Revisão:** sem processos, sem rede, sem escrita de arquivo. Lê o idioma das configurações e o locale. Acrescenta uma linha de instrução só ao prompt de subagentes `savvy-*`.
- **Atenção:** custos são estimativa; a barra não prevê o tempo restante.
