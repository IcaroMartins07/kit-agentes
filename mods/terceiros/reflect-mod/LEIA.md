# Reflect

- **Origem:** github.com/BayramAnnakov/claude-reflect, pasta `mod/`, commit `b6c4232` · reflect-mod v3.3.0 · MIT.
- **O que faz:** identifica correções e preferências reutilizáveis em prompts curtos e sugere salvá-las como regra no CLAUDE.md do projeto ou do usuário.
- **Usar:** revise a regra sugerida e clique em Save. `/reflect-queue` mostra a fila; `/reflect-pause` pausa a detecção.
- **Instalar** a cópia do kit (com as mudanças abaixo; a original é `reflect-mod@claude-reflect-marketplace`):
  ```
  /plugin marketplace add <pasta do kit>
  /plugin install reflect-mod@kit-agentes
  ```
- **Revisão:** sem rede própria. Faz uma chamada de modelo (`$.model.complete`) por prompt elegível. Só grava no CLAUDE.md quando você clica em Save. Acrescenta uma seção ao prompt de sistema.
- **Atenção:** salvar uma regra muda as próximas respostas em todas as sessões daquele CLAUDE.md.
- **Status nesta máquina:** instalado do kit (3.3.0-kit.1) desde 2026-11-16; a versão da origem foi desinstalada.
- **Alterado no kit (2026-11-16):** a faixa mostra 1 sugestão por vez (`BAND_ROWS` 2 → 1) e não aninha mais o espaço reservado do Claude Code (`{ type: 'engine' }`), que faz o desktop descartar a faixa. As linhas mudadas têm o comentário `kit:`. Ao atualizar a partir da origem, reaplique as duas mudanças.
- **Testes:** `claude plugin test .` tem 4 falhas que já existiam antes das mudanças do kit (o ambiente de teste bloqueia a chamada ao modelo).
