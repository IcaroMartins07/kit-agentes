#!/usr/bin/env bash
# SessionStart: injeta as regras do projeto e a orquestradora; avisa se faltar algo.
IFS= read -r -d '' _ || true
raiz="${CLAUDE_PROJECT_DIR:-$PWD}"
fluxo="$raiz/.claude/fluxo"
avisos=""

if [ -f "$fluxo/REGRAS.md" ]; then
  echo "## Regras do projeto (.claude/fluxo/REGRAS.md)"
  cat "$fluxo/REGRAS.md"
  echo
  # "<a definir>" é pendência assumida, não campo esquecido
  sed 's/<a definir>//g' "$fluxo/REGRAS.md" | grep -Eq '<[A-Za-zÀ-ÿ][^>]*>' &&
    avisos="$avisos\n- REGRAS.md ainda tem campos <...> sem preencher."
else
  avisos="$avisos\n- .claude/fluxo/REGRAS.md não existe. Rode instalar.sh de novo."
fi

orq="$raiz/.claude/skills/using-agent-skills/SKILL.md"
[ -f "$orq" ] || orq="$HOME/.claude/skills/using-agent-skills/SKILL.md"
if [ -f "$orq" ]; then
  echo "## Orquestradora (using-agent-skills)"
  awk '/^## Tabela de fases e trava/{f=1} f' "$orq"
  echo
fi

for s in using-agent-skills spec-driven-development planning-and-task-breakdown incremental-implementation \
  test-driven-development debugging-and-error-recovery code-review-and-quality shipping-and-launch humanizer; do
  [ -f "$raiz/.claude/skills/$s/SKILL.md" ] || [ -f "$HOME/.claude/skills/$s/SKILL.md" ] ||
    avisos="$avisos\n- skill ausente: $s"
done

grep -qs 'exigir-skill' "$raiz/.claude/settings.local.json" ||
  avisos="$avisos\n- hooks não estão no .claude/settings.local.json; a trava não está ativa."

if [ -n "$avisos" ]; then
  echo "## ATENÇÃO: kit fluxo-agentes incompleto"
  printf '%b\n' "$avisos"
fi
exit 0
