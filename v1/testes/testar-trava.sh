#!/usr/bin/env bash
# Uso: testes/testar-trava.sh hooks/exigir-skill.sh
# Roda 32 cenários (edição, escrita pelo Bash, commit, merge, PR no GitHub, MR no GitLab,
# menção solta de skill, cache incremental e aviso do REGRAS.md).
set -u
hook=${1:?uso: testar-trava.sh <caminho do exigir-skill.sh>}
hook=$(cd "$(dirname "$hook")" && pwd)/$(basename "$hook")

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
repo="$tmp/repo"
mkdir -p "$repo" && git -C "$repo" init -q
echo x >"$repo/app.ts" && echo x >"$repo/README.md"

ok=0
falhas=0

transcricao() {
  : >"$tmp/t.jsonl"
  for s in "$@"; do
    printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"%s"}}]}}\n' "$s" >>"$tmp/t.jsonl"
  done
}

# caso <esperado: 0|2> <nome> <ferramenta> <arquivo> <comando> [skills...]
caso() {
  local esperado=$1 nome=$2 ferr=$3 arq=$4 cmd=$5
  shift 5
  transcricao "$@"
  local json
  json=$(printf '{"tool_name":"%s","tool_input":{"file_path":"%s","command":"%s"},"transcript_path":"%s","cwd":"%s"}' \
    "$ferr" "$arq" "$cmd" "$tmp/t.jsonl" "$repo")
  printf '%s' "$json" | bash "$hook" >/dev/null 2>&1
  local rc=$?
  if [ "$rc" -eq "$esperado" ]; then
    ok=$((ok + 1))
    echo "ok     $nome"
  else
    falhas=$((falhas + 1))
    echo "FALHOU $nome (esperado $esperado, veio $rc)"
  fi
}

staged() { git -C "$repo" reset -q; for f in "$@"; do git -C "$repo" add "$f" 2>/dev/null; done; }

# Edição
caso 2 "edição de .ts sem skill" Edit "$repo/app.ts" ""
caso 0 "edição de .ts com incremental-implementation" Edit "$repo/app.ts" "" incremental-implementation
caso 0 "escrita de .py com debugging-and-error-recovery" Write "$repo/a.py" "" debugging-and-error-recovery
caso 0 "edição de README.md sem skill" Edit "$repo/README.md" ""
caso 0 "edição de .claude/settings.local.json sem skill" Edit "$repo/.claude/settings.local.json" ""
caso 2 "edição de .tsx só com skill de revisão" Edit "$repo/ui.tsx" "" code-review-and-quality

# Commit
staged app.ts
caso 2 "commit de código sem skill" Bash "" "git commit -m x"
caso 0 "commit de código com test-driven-development" Bash "" "git commit -m x" test-driven-development
staged README.md
caso 0 "commit só de documentação sem skill" Bash "" "git commit -m x"
caso 0 "git status sem skill" Bash "" "git status"

# Merge
caso 0 "git merge sem skill" Bash "" "git merge feature"
caso 0 "git merge --no-ff sem skill" Bash "" "git merge --no-ff feature"

# PR no GitHub
caso 2 "gh pr create sem skills" Bash "" "gh pr create --fill"
caso 2 "gh pr create só com code-review-and-quality" Bash "" "gh pr create --fill" code-review-and-quality
caso 0 "gh pr create com revisão e humanizer" Bash "" "gh pr create --fill" code-review-and-quality humanizer

# MR no GitLab
caso 2 "glab mr create sem skills" Bash "" "glab mr create --fill"
caso 2 "git push -o merge_request.create sem skills" Bash "" "git push -o merge_request.create origin feat"
caso 0 "glab mr create com revisão e humanizer" Bash "" "glab mr create --fill" code-review-and-quality humanizer

# Escrita de código pelo Bash
caso 2 "cat > .ts sem skill" Bash "" "cat > src/a.ts"
caso 2 "echo >> .py sem skill" Bash "" "echo x >> b.py"
caso 2 "tee .tsx sem skill" Bash "" "echo x | tee ui.tsx"
caso 2 "sed -i em .ts sem skill" Bash "" "sed -i s/a/b/ app.ts"
caso 0 "cat > .ts com incremental-implementation" Bash "" "cat > src/a.ts" incremental-implementation
caso 0 "redireção para .log sem skill" Bash "" "npm run build > build.log 2>&1"
caso 0 "redireção para /dev/null sem skill" Bash "" "node x.js >/dev/null"
caso 0 "sed -i em .md sem skill" Bash "" "sed -i s/a/b/ README.md"
caso 0 "escrita em .claude/ sem skill" Bash "" "echo x > .claude/fluxo/hooks/a.sh"
caso 0 "ls sem skill" Bash "" "ls -la"

# Cache incremental: skill invocada depois da primeira leitura é vista
t2="$tmp/sessao.jsonl"
for i in $(seq 1 200); do printf '{"type":"user","message":{"content":"linha %s de conversa comprida o bastante"}}\n' "$i"; done >"$t2"
entrada_ts=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"},"transcript_path":"%s","cwd":"%s"}' "$repo/app.ts" "$t2" "$repo")
printf '%s' "$entrada_ts" | bash "$hook" >/dev/null 2>&1; r1=$?
printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"test-driven-development"}}]}}\n' >>"$t2"
printf '%s' "$entrada_ts" | bash "$hook" >/dev/null 2>&1; r2=$?
if [ "$r1" -eq 2 ] && [ "$r2" -eq 0 ]; then ok=$((ok + 1)); echo "ok     cache vê skill invocada depois"; else falhas=$((falhas + 1)); echo "FALHOU cache (antes $r1, depois $r2)"; fi

# Menção solta no texto não conta como invocação
printf '{"type":"user","message":{"content":"{\\"skill\\":\\"incremental-implementation\\"}"}}\n' >"$tmp/t.jsonl"
json=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"},"transcript_path":"%s","cwd":"%s"}' "$repo/app.ts" "$tmp/t.jsonl" "$repo")
printf '%s' "$json" | bash "$hook" >/dev/null 2>&1
if [ $? -eq 2 ]; then ok=$((ok + 1)); echo "ok     menção solta de skill não libera edição"; else falhas=$((falhas + 1)); echo "FALHOU menção solta de skill liberou edição"; fi

# Aviso de REGRAS.md: "<a definir>" não alerta, "<...>" alerta
checar="$(dirname "$hook")/checar-skills.sh"
mkdir -p "$repo/.claude/fluxo"
echo 'Testes: <a definir>' >"$repo/.claude/fluxo/REGRAS.md"
if CLAUDE_PROJECT_DIR="$repo" bash "$checar" </dev/null 2>/dev/null | grep -q 'campos <...>'; then
  falhas=$((falhas + 1)); echo "FALHOU '<a definir>' gerou aviso"
else ok=$((ok + 1)); echo "ok     '<a definir>' não gera aviso"; fi
echo 'Nome: <nome do projeto>' >"$repo/.claude/fluxo/REGRAS.md"
if CLAUDE_PROJECT_DIR="$repo" bash "$checar" </dev/null 2>/dev/null | grep -q 'campos <...>'; then
  ok=$((ok + 1)); echo "ok     campo <...> gera aviso"
else falhas=$((falhas + 1)); echo "FALHOU campo <...> não gerou aviso"; fi

echo
if [ "$falhas" -eq 0 ]; then
  echo "TODOS OK ($ok cenários)"
else
  echo "$falhas FALHA(S), $ok ok"
  exit 1
fi
