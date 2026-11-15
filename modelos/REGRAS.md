# Regras do projeto <nome>

Só o que é específico deste projeto. As regras gerais vêm do `CLAUDE.md` base do modo-deus; não repita aqui.
Campos entre os sinais de menor e maior precisam ser preenchidos. Escreva `<a definir>` no que ainda não se sabe: vira pendência assumida e não gera aviso.

## Visão

- O que o projeto faz: <uma ou duas frases>
- Quem usa: <público>
- Fonte de verdade do comportamento: <spec, issue, documento, protótipo>

## Stack

<!-- modo-deus:stack -->

## Comandos

Os agentes rodam exatamente estes comandos. O monitor acusa comando inventado fora desta tabela e do manifesto do projeto.

<!-- modo-deus:comandos -->

## Times

Fixos: Maestro, dev-front, dev-back, dev-db, dev-devops, QA (unit, integração, E2E, UI, regressão) e Revisão.
Sob demanda: só acionados quando a tarefa toca o território deles. Mude `auto` para `ligado` ou `desligado` para forçar.

<!-- modo-deus:times -->

## Territórios

O que cada time pode editar. Fora disso, o agente pede ao Maestro. Ajuste à estrutura real do projeto.

<!-- modo-deus:territorios -->

## Testes

<!-- modo-deus:testes -->

## Convenções do projeto

- Branches: <ex.: feat/<assunto>, fix/<assunto>>
- Commits: <ex.: Conventional Commits>
- Nomes e organização: <o que difere do padrão>

## Telas (se houver interface)

- Design de referência: <Figma, sistema de design, pasta de componentes>

## Definition of Done

- [ ] Comportamento confere com a fonte de verdade e com os critérios de aceite
- [ ] Testes do território, lint, tipos e build passando (comandos acima)
- [ ] E2E Cypress dos fluxos afetados passando
- [ ] Revisão aprovada, sem item grave aberto
- [ ] Documentação e `.env.example` atualizados, se mudou configuração
- [ ] <critério específico do projeto>

## Não fazer

- <ex.: não alterar a pasta legacy/ sem combinar>
- <ex.: não chamar a API de produção em testes>
