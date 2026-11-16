#!/usr/bin/env bash
# Instala o kit. Skills vão para ~/.claude/skills (globais); comandos, hooks e regras
# ficam só no repositório, sem entrar no git.
# Uso: instalar.sh --global                        só as skills globais
#      instalar.sh [--sem-mcp] /caminho/do/repo    skills globais + parte do projeto
set -euo pipefail

KIT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MARCA_INI="# fluxo-agentes (kit local)"
MARCA_FIM="# /fluxo-agentes"
GLOBAL_SKILLS="$HOME/.claude/skills"
GLOBAL_MANIFESTO="$HOME/.claude/fluxo-skills.txt"

uso() { echo "uso: instalar.sh --global | instalar.sh [--sem-mcp] /caminho/do/repositorio" >&2; exit 1; }

sem_mcp=0
so_global=0
alvo=""
for a in "$@"; do
  case "$a" in
    --sem-mcp) sem_mcp=1 ;;
    --global) so_global=1 ;;
    -h | --help) uso ;;
    *) alvo="$a" ;;
  esac
done
[ -n "$alvo" ] || [ "$so_global" -eq 1 ] || uso

# ---------- Skills globais ----------
instalar_skills_globais() {
  mkdir -p "$GLOBAL_SKILLS"
  local antigos="" novos="" nome origem destino todas
  [ -f "$GLOBAL_MANIFESTO" ] && antigos=$(cat "$GLOBAL_MANIFESTO")
  todas=$(find "$KIT/skills" -type f -name SKILL.md 2>/dev/null)
  while IFS= read -r nome; do
    case "$nome" in '' | '#'*) continue ;; esac
    origem=$(printf '%s\n' "$todas" | grep -m1 "/$nome/SKILL.md$")
    if [ -z "$origem" ]; then
      echo "AVISO    skill $nome não está no kit"
      # continua sendo do kit, para ser atualizada quando voltar
      printf '%s\n' "$antigos" | grep -Fxq "$nome" && novos="$novos$nome"$'\n'
      continue
    fi
    destino="$GLOBAL_SKILLS/$nome"
    if [ -e "$destino" ] && ! printf '%s\n' "$antigos" | grep -Fxq "$nome"; then
      echo "pulado   ~/.claude/skills/$nome (já existe e não é do kit)"
      continue
    fi
    rm -rf "$destino"
    cp -r "$(dirname "$origem")" "$destino"
    novos="$novos$nome"$'\n'
    echo "skill    $nome (global)"
  done <"$KIT/skills/LISTA.txt"
  # Skill que era do kit e saiu da LISTA.txt: remove (só as do manifesto, nunca as do usuário)
  while IFS= read -r nome; do
    case "$nome" in '' | */* | . | ..) continue ;; esac
    printf '%s\n' "$novos" | grep -Fxq "$nome" && continue
    rm -rf "${GLOBAL_SKILLS:?}/$nome"
    echo "removida ~/.claude/skills/$nome (saiu da LISTA.txt)"
  done <<<"$antigos"
  printf '%s' "$novos" >"$GLOBAL_MANIFESTO"
}

instalar_skills_globais
if [ "$so_global" -eq 1 ] && [ -z "$alvo" ]; then
  echo; echo "Skills globais prontas. Abra uma sessão nova do Claude Code para vê-las."
  exit 0
fi

# ---------- Projeto ----------
repo=$(git -C "$alvo" rev-parse --show-toplevel 2>/dev/null) || { echo "erro: $alvo não é um repositório git" >&2; exit 1; }
cd "$repo"
mkdir -p .claude/commands .claude/fluxo/hooks

manifesto=".claude/fluxo/instalados.txt"
antigos=""
[ -f "$manifesto" ] && antigos=$(cat "$manifesto")
novos=""
pulados=0

# Pode escrever em $1? Não se o git do projeto já versiona, nem se existe e não veio deste kit.
liberado() {
  if git ls-files --error-unmatch -- "$1" >/dev/null 2>&1; then
    echo "pulado   $1 (o projeto já versiona)"; return 1
  fi
  if [ -e "$1" ] && ! printf '%s\n' "$antigos" | grep -Fxq "$1"; then
    echo "pulado   $1 (já existe e não é do kit)"; return 1
  fi
  return 0
}

for f in "$KIT"/commands/*.md; do
  destino=".claude/commands/$(basename "$f")"
  if liberado "$destino"; then
    cp "$f" "$destino"
    novos="$novos$destino"$'\n'
    echo "comando  $(basename "$f")"
  else
    pulados=$((pulados + 1))
  fi
done

cp "$KIT"/hooks/*.sh .claude/fluxo/hooks/
echo "hooks    $(ls "$KIT"/hooks/*.sh | wc -l | tr -d ' ') scripts"
if [ -f .claude/fluxo/REGRAS.md ]; then
  echo "regras   REGRAS.md já existe, mantido"
else
  cp "$KIT/modelos/REGRAS.md" .claude/fluxo/REGRAS.md
  echo "regras   REGRAS.md criado: preencha os campos <...>"
fi
# Comando que era do kit e saiu dele: remove (nunca se o projeto passou a versionar)
while IFS= read -r f; do
  case "$f" in .claude/commands/*.md) ;; *) continue ;; esac
  printf '%s\n' "$novos" | grep -Fxq "$f" && continue
  git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 && continue
  [ -f "$f" ] && rm -f "$f" && echo "removido $f (saiu do kit)"
done <<<"$antigos"
printf '%s' "$novos" >"$manifesto"

# Hooks no settings.local.json (o settings.json do projeto não muda)
node -e '
const fs = require("fs");
const f = ".claude/settings.local.json";
let s = {};
if (fs.existsSync(f)) {
  try { s = JSON.parse(fs.readFileSync(f, "utf8")); }
  catch (e) { console.error("erro: " + f + " não é JSON válido; não alterei"); process.exit(3); }
}
s.hooks = s.hooks || {};
const pasta = ".claude/fluxo/hooks/";
const add = (evento, matcher, script) => {
  const lista = (s.hooks[evento] || [])
    .map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !(h.command || "").includes(pasta + script)) }))
    .filter(g => g.hooks.length);
  const grupo = { hooks: [{ type: "command", command: "bash \"$CLAUDE_PROJECT_DIR/" + pasta + script + "\"" }] };
  if (matcher) grupo.matcher = matcher;
  lista.push(grupo);
  s.hooks[evento] = lista;
};
add("SessionStart", null, "checar-skills.sh");
add("UserPromptSubmit", null, "orquestrar.sh");
add("PreToolUse", "Edit|Write|MultiEdit|NotebookEdit|Bash", "exigir-skill.sh");
fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
'
echo "settings .claude/settings.local.json (3 hooks)"

# Mantém tudo fora do git: .git/info/exclude é local. Usa o diretório comum do git,
# que é o exclude lido também pelas worktrees.
exclude="$(cd "$(git rev-parse --git-common-dir)" && pwd)/info/exclude"
mkdir -p "$(dirname "$exclude")"
touch "$exclude"
sem_bloco=$(awk -v i="$MARCA_INI" -v f="$MARCA_FIM" '$0==i{p=1;next} $0==f{p=0;next} !p' "$exclude")
{
  printf '%s\n' "$sem_bloco" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'
  echo "$MARCA_INI"
  echo ".claude/fluxo/"
  echo ".claude/settings.local.json"
  printf '%s' "$novos"
  echo "$MARCA_FIM"
} >"$exclude.tmp"
mv "$exclude.tmp" "$exclude"
echo "exclude  .git/info/exclude atualizado"

# Playwright MCP só nesta pasta, com versão fixa (atualize aqui de propósito, não com @latest)
PLAYWRIGHT_MCP="@playwright/mcp@0.0.84"
if [ "$sem_mcp" -eq 1 ]; then
  echo "mcp      pulado (--sem-mcp)"
elif ! command -v claude >/dev/null 2>&1; then
  echo "AVISO    comando claude não encontrado; registre o Playwright depois: claude mcp add --scope local playwright -- npx $PLAYWRIGHT_MCP"
elif claude mcp get playwright >/dev/null 2>&1; then
  echo "mcp      playwright já registrado (para fixar a versão: claude mcp remove playwright -s local e rode de novo)"
else
  claude mcp add --scope local playwright -- npx "$PLAYWRIGHT_MCP" && echo "mcp      playwright $PLAYWRIGHT_MCP registrado (escopo local)"
fi

echo
echo "Pronto em $repo ($pulados item(ns) pulado(s))."
echo "Próximo passo: preencher .claude/fluxo/REGRAS.md e abrir uma sessão nova do Claude Code."
