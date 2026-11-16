# M7 · Prompt Master

- **Origem:** criado neste kit (`mods/M7/prompt-master`) · v0.1.0.
- **O que faz:** botão **✦ Prompt Master** no rodapé do prompt, ao lado do modo de edição. O clique reescreve o rascunho com um modelo (mais claro: objetivo, contexto, o que fazer, restrições, critério de pronto; sem inventar nada) e devolve o texto na caixa para você revisar antes de enviar. **↶ desfazer** volta ao original.
- **Automático** (desligado por padrão): `/prompt-master auto on` reescreve cada prompt digitado na hora de enviar; `/prompt-master auto off` desliga. Comandos de barra, pedidos com menos de 20 caracteres e mensagens que não vieram do teclado nunca são reescritos; se o modelo falha, vai o original.
- **Modelo:** opção `modelo` (sonnet, haiku, opus; padrão sonnet).
- **Custo:** cada reescrita é uma chamada de modelo.
- **Visual:** mesmo estilo dos seletores do rodapé (sem moldura própria, borda cinza discreta do tema); no hover a borda fica laranja suave. Cores do tema, então acompanham claro, escuro e o mod de temas.
- **Testes:** `claude plugin test mods/M7/prompt-master` (5 cenários: regras do automático, limpeza da resposta, botão e desfazer, automático com falha do modelo, estilo do botão).
