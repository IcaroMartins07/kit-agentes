# Segurança

O kit roda hooks em node na sua máquina, aplica um deny-list nas permissões do Claude Code e instala plugins de terceiros. Uma falha aqui pode afetar os projetos onde ele está instalado, então trate com cuidado.

## Como relatar

**Não abra issue pública** para falha de segurança. Use o relato privado do GitHub: aba **Security** do repositório, **Report a vulnerability**. Inclua o que é afetado, como reproduzir e o impacto. A resposta inicial vem em até 7 dias.

## O que conta

- Um hook que deixa passar o que deveria bloquear (cerca V9, território, trava) ou que executa algo vindo do projeto sem validar.
- O instalador gravando fora de `.modo-deus/`, `.claude/settings.local.json` e `.git/info/exclude`, ou expondo segredos.
- Um mod que lê ou envia dados além do que descreve.
- Skill de terceiros com comportamento malicioso (o kit recomenda escanear com o SkillSpector antes de instalar).

## Versões cobertas

Só a versão mais recente da branch `main`.
