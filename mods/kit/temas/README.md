# temas

Mod do Claude Code que troca a aparência dos apps desktop e mobile entre paletas próprias, cada uma com modo claro e escuro (o Neon é só escuro):

- **Dunas** (o padrão): o visual do mockup aprovado, nos dois modos. Cores quentes (texto creme sobre marrom no escuro, texto escuro sobre papel creme no claro), a cena das dunas animada atrás da conversa (de noite no modo escuro, de dia no claro: é uma cena só, que troca as cores pelo modo do app) e os painéis do app translúcidos (55%), na cor do painel de cada modo e sem blur: no app, o desfoque age na coluna da conversa e apaga os pontinhos da cena, e a barra lateral de sessões não muda com nenhum valor (é do próprio app). Tudo num tema só: a sessão tem um tema de cada vez. `/tema dunas`.
- **Kit**: laranja sobre preto no escuro, laranja sobre bege no claro. `/tema kit`.
- **Café**: grãos torrados de dia, balcão à luz de luminária à noite.
- **Meia-noite**: azul profundo.
- **Floresta**: musgo e madeira.
- **Neon**: synthwave, roxo escuro com acentos elétricos.
- **Papel**: caderno de papel.

A cena das Dunas (`hooks/dither-dunes.ts`) foi copiada sem mudanças do plugin [theme-examples](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/theme-examples), da Anthropic, sob a licença Apache-2.0, cujo texto está em `LICENSE-theme-examples`. Com o theme-examples também ativo, os dois disputam o tema da sessão: deixe um só (o kit desativa o theme-examples).

Use `/tema` para abrir o seletor, `/tema <nome>` para aplicar direto e `/tema padrao` para voltar ao tema do app. A escolha fica salva e volta na próxima sessão. O terminal mantém as próprias cores: temas valem só nos apps.
