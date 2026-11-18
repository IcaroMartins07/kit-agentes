# Prompt Master

- **Origem:** criado neste kit (`mods/kit/prompt-master`) · v0.4.0.
- **O que faz:** botão **✦ Prompt Master** no rodapé do prompt, ao lado dos seletores de modelo e de modo. O clique reescreve o rascunho com um modelo (mais claro: objetivo, contexto, o que fazer, restrições, critério de pronto; sem inventar nada) e devolve o texto na caixa para você revisar antes de enviar. **↶** (desfazer) volta ao original.
- **Automático** (desligado por padrão): `/prompt-master auto on` reescreve cada prompt digitado na hora de enviar; `/prompt-master auto off` desliga. Comandos de barra, pedidos com menos de 20 caracteres e mensagens que não vieram do teclado nunca são reescritos; se o modelo falha, vai o original.
- **Modelo:** opção `modelo` (sonnet, haiku, opus; padrão sonnet).
- **Custo:** cada reescrita é uma chamada de modelo.
- **Visual:** sem fundo, do tamanho dos seletores de modelo. Nenhum botão tem hover, exceto um: a borda do **✦ Prompt Master** fica laranja sob o mouse (em repouso, uma borda fina na cor apagada do tema, como no mockup). O **↶** (desfazer) é só o ícone. Clicar com o prompt vazio mostra o aviso **⚠ Sem contexto** no próprio botão por 3 s, mais um toast. Enquanto reescreve, o botão anima **✦ Reescrevendo.** → **..** → **...**.
- **Testes:** `claude plugin test mods/kit/prompt-master` (7 cenários: regras do automático, limpeza da resposta, botão e desfazer, automático com falha do modelo, tamanho e borda do botão, aviso Sem contexto, pontinhos do carregando).
