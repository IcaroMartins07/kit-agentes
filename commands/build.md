---
description: Implementa em passos pequenos, guiado por testes
argument-hint: <tarefa do plano>
---
Use as skills incremental-implementation e superpowers:test-driven-development para implementar: $ARGUMENTS

- Executando nesta sessão um plano feito no /plan, siga `superpowers:executing-plans`.
- Uma tarefa do plano por vez; escreva ou ajuste o teste antes da implementação.
- Antes de escrever, procure o que já existe (helper, componente, serviço, biblioteca instalada ou recurso da plataforma) e reutilize. Não adicione dependência, abstração, opção ou configuração que ninguém pediu; liste em uma linha o que decidiu não fazer.
- Bug: corrija a causa raiz uma vez, no código compartilhado, depois de procurar todos os chamadores. Lógica nova e não trivial deixa um teste pequeno.
- Nunca simplifique segurança, autorização, validação nas bordas, tratamento de erro que evita perda de dados, acessibilidade nem o que foi pedido.
- Rode os comandos de teste, lint e tipos do projeto (.modo-deus/REGRAS.md) a cada passo relevante.
- Se aparecer um bug cuja causa não é óbvia, use a skill superpowers:systematic-debugging.
- Não faça commit sem que eu peça.

Ao final, informe o que mudou e as verificações executadas com o resultado real.
