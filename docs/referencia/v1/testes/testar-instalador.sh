#!/usr/bin/env bash
# Uso: testes/testar-instalador.sh
# Roda o instalar.sh numa cópia do kit, com HOME e repositório temporários (não toca no seu ~/.claude).
set -u
kit_orig=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
kit="$tmp/kit"
mkdir -p "$kit"
cp -r "$kit_orig"/instalar.sh "$kit_orig"/commands "$kit_orig"/hooks "$kit_orig"/modelos "$kit_orig"/skills "$kit"/
export HOME="$tmp/home"
mkdir -p "$HOME/.claude/skills/minha-skill" && echo x >"$HOME/.claude/skills/minha-skill/SKILL.md"

repo="$tmp/repo"
mkdir -p "$repo" && git -C "$repo" init -q && git -C "$repo" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init

ok=0
falhas=0
checa() { # checa <nome> <comando...>
  local nome=$1; shift
  if "$@" >/dev/null 2>&1; then ok=$((ok + 1)); echo "ok     $nome"; else falhas=$((falhas + 1)); echo "FALHOU $nome"; fi
}
instalar() { bash "$kit/instalar.sh" --sem-mcp "$repo" >"$tmp/saida.txt" 2>&1; }

instalar
checa "instalação termina sem erro" grep -q '^Pronto em' "$tmp/saida.txt"
checa "comandos copiados" test -f "$repo/.claude/commands/build.md"
checa "skill global copiada" test -f "$HOME/.claude/skills/using-agent-skills/SKILL.md"
checa "skill do usuário intocada" grep -qx x "$HOME/.claude/skills/minha-skill/SKILL.md"
checa "git status limpo" test -z "$(git -C "$repo" status --porcelain)"

# Worktree enxerga o mesmo exclude
git -C "$repo" worktree add -q "$tmp/wt" 2>/dev/null
mkdir -p "$tmp/wt/.claude/fluxo" && echo x >"$tmp/wt/.claude/fluxo/REGRAS.md"
checa "worktree também ignora os arquivos do kit" test -z "$(git -C "$tmp/wt" status --porcelain)"

# Item que sai do kit é removido na próxima instalação
sed -i '/^humanizer$/d' "$kit/skills/LISTA.txt"
rm "$kit/commands/ship.md"
instalar
checa "skill que saiu da LISTA é removida" test ! -e "$HOME/.claude/skills/humanizer"
checa "comando que saiu do kit é removido" test ! -e "$repo/.claude/commands/ship.md"
checa "skill do usuário continua intocada" grep -qx x "$HOME/.claude/skills/minha-skill/SKILL.md"
checa "REGRAS.md preservado na reinstalação" test -f "$repo/.claude/fluxo/REGRAS.md"

echo
if [ "$falhas" -eq 0 ]; then
  echo "TODOS OK ($ok cenários)"
else
  echo "$falhas FALHA(S), $ok ok"
  exit 1
fi
