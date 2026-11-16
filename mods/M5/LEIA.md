# M5 · Reflect

- **Origem:** github.com/BayramAnnakov/claude-reflect, pasta `mod/`, commit `b6c4232` · reflect-mod v3.3.0 · MIT.
- **O que faz:** identifica correções e preferências reutilizáveis em prompts curtos e sugere salvá-las como regra no CLAUDE.md do projeto ou do usuário.
- **Usar:** revise a regra sugerida e clique em Save. `/reflect-queue` mostra a fila; `/reflect-pause` pausa a detecção.
- **Instalar** (a variante mod, não o plugin clássico do mesmo repositório):
  ```
  /plugin marketplace add bayramannakov/claude-reflect
  /plugin install reflect-mod@claude-reflect-marketplace
  ```
- **Revisão:** sem rede própria. Faz uma chamada de modelo (`$.model.complete`) por prompt elegível. Só grava no CLAUDE.md quando você clica em Save. Acrescenta uma seção ao prompt de sistema.
- **Atenção:** salvar uma regra muda as próximas respostas em todas as sessões daquele CLAUDE.md.
- **Status nesta máquina:** instalado em 2026-11-16, commit igual ao revisado.
