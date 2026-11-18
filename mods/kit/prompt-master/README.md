# Prompt Master (M7)

Mod do Claude Code que põe um botão **✦ Prompt Master** (sem fundo; a borda fica laranja no hover) no rodapé do prompt, ao lado do modo de edição (Accept edits).

- **Clique**: o rascunho vai para um modelo que o reescreve mais claro e acionável (objetivo, contexto, o que fazer, restrições, critério de pronto), sem inventar nada e mantendo idioma, arquivos, comandos e código. O texto novo volta para a caixa: você revisa, edita e envia.
- **↶** (desfazer): aparece depois da reescrita e devolve o rascunho original.
- **Automático** (desligado por padrão): `/prompt-master auto on` reescreve cada prompt que você digitar na hora de enviar; `/prompt-master auto off` desliga. Comandos de barra, pedidos com menos de 20 caracteres e mensagens que não vieram do seu teclado nunca são reescritos. Se o modelo falhar, o original é enviado.
- **Modelo**: opção `modelo` (sonnet, haiku ou opus) em `/plugin configure prompt-master`.

Cada reescrita é uma chamada de modelo e gasta uso. O botão aparece no terminal e no desktop.
