# Exemplo: tarefas

Um projeto pequeno para ver o kit funcionando de ponta a ponta: uma lista de tarefas com API HTTP, em Node, sem dependências, com testes.

## Preparar

O kit é instalado por projeto e precisa de um repositório git próprio, então copie o exemplo para fora do kit:

```bash
cp -r exemplos/tarefas ~/tarefas-exemplo
cd ~/tarefas-exemplo
git init && git add -A && git commit -m "Projeto de exemplo"
npm test
agents-mode --perfil estrito
```

Abra o Claude Code nessa pasta e reinicie o app se o plugin acabou de ser instalado.

## Pedidos para testar

| Pedido | O que exercita |
|---|---|
| `/deus mudar a mensagem de erro de título vazio para "Escreva um título"` | Caminho rápido: uma tarefa simples, Dev com TDD e revisor |
| `/deus permitir apagar uma tarefa com DELETE /tarefas/:id` | Fluxo completo: Dev back, QA de integração com contrato da API e revisão |
| `/deus guardar as tarefas num arquivo JSON para sobreviver ao reinício` | Tarefa complexa, com cuidado de dados e testes de borda |
| `/deus-status` | Acompanhar o plano, os agentes e os alertas |

Depois, rode `/retro` para ver o que a sessão ensinou ao kit.
