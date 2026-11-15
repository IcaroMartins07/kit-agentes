# Prompt para o Claude instalar o kit num projeto

Cole no Claude Code, abrindo a sessão na pasta do repositório. Troque `<KIT>` pelo caminho do kit.

```
Instale o kit fluxo-agentes neste repositório e deixe-o pronto para uso.

1. Rode: bash <KIT>/instalar.sh "$PWD" (instala também as skills globais)
   Leia a saída inteira e me diga o que foi pulado ou deu aviso.
2. Preencha .claude/fluxo/REGRAS.md com dados reais do projeto: leia README, CLAUDE.md,
   package.json / pyproject.toml / pom.xml / go.mod, a estrutura de pastas, os scripts
   de teste, lint, tipos e build, e a configuração de CI. Confirme versões e comandos nos
   arquivos, não de memória. Deixe como "<a definir>" o que não der para descobrir e
   liste esses pontos no fim.
3. Confira com git status que nada do kit apareceu como alteração (tudo deve estar em
   .git/info/exclude). Não faça commit nem push.
4. Diga para eu abrir uma sessão nova, porque hooks e skills só valem nela.
```
