---
description: Revisa as mudanças atuais antes de commit ou PR
argument-hint: [foco da revisão]
---
Use a skill code-review-and-quality para revisar as mudanças atuais (git status, git diff e arquivos novos).
Foco adicional: $ARGUMENTS

- Confira contra a spec e o Definition of Done do .modo-deus/REGRAS.md, se existirem.
- Verifique secrets, arquivos indevidos e mudanças fora do escopo.
- Verifique código desnecessário: algo que já existia e foi recriado, dependência que poucas linhas resolveriam, abstração com um só uso, opção ou configuração sem pedido. Aponte só com um caso concreto; não sugira cortar segurança, validação, acessibilidade nem testes.
- Verifique consistência com as Convenções do `REGRAS.md` e com os arquivos vizinhos: estilo, erro, log e camada no padrão do projeto.
- Use também as skills security-and-hardening (entrada externa, autorização, segredos, dependências) e performance-optimization (N+1, paginação, timeout, peso da tela).
- Não corrija nada sem eu aprovar.

Liste os problemas por gravidade, com arquivo e linha, e diga o que foi verificado de fato.
