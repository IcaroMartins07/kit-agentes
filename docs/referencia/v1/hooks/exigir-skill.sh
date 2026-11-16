#!/usr/bin/env bash
# PreToolUse: bloqueia ação sem a skill da fase.
#  - editar/criar código (Edit/Write ou escrita pelo Bash: >, >>, tee, sed -i, perl -i)
#    e git commit de código: exige skill de construção ou de bug
#  - abrir PR/MR: exige code-review-and-quality e humanizer
# Bloqueia com exit 2 (mensagem em stderr). Falha de leitura do JSON deixa passar.
#
# Desempenho: roda antes de cada Edit/Write/Bash, então evita abrir processos (no Windows
# cada um custa dezenas de ms). O caso comum (ls, npm, edição de .md) sai só com bash
# embutido; o node abre no máximo duas vezes, e a transcrição é lida de forma incremental.
set -u

IFS= read -r -d '' entrada || true

# ---------- Utilitários sem processo externo ----------
# 0 se o caminho é arquivo de código; docs, configs e .claude/ ficam livres.
codigo() {
  local p=${1//\\//}
  case "$p" in
    .claude/* | */.claude/* | */node_modules/* | */.git/*) return 1 ;;
  esac
  local ext=${p##*.}
  [ "$ext" = "$p" ] && return 1
  case "${ext,,}" in
    ts | tsx | js | jsx | mjs | cjs | py | go | rs | java | kt | kts | rb | php | cs | c | cc | cpp | h | hpp | \
      swift | dart | scala | ex | exs | lua | sql | vue | svelte | css | scss | sass | less | html | htm | sh | bash | ps1)
      return 0 ;;
  esac
  return 1
}

# Lê um campo string do JSON de entrada para $valor (só para caminhos, que não têm aspas).
campo() {
  valor=""
  [[ $entrada =~ \"$1\"[[:space:]]*:[[:space:]]*\"(([^\"\\]|\\.)*)\" ]] || return 1
  valor=${BASH_REMATCH[1]}
  valor=${valor//\\\\/\\}
}

# ---------- Caminho rápido ----------
campo tool_name || exit 0
ferramenta=$valor
comando="" transcricao="" cwd="" alvos=""

case "$ferramenta" in
  Edit | Write | MultiEdit | NotebookEdit)
    campo file_path || campo notebook_path || exit 0
    arquivo=$valor
    codigo "$arquivo" || exit 0
    campo transcript_path && transcricao=$valor
    ;;
  Bash)
    relevante='commit|create|merge_request|[>]|tee|-[[:alpha:]]*i'
    [[ $entrada =~ $relevante ]] || exit 0
    # Um node só: comando, transcrição, cwd e arquivos que o comando escreveria.
    {
      IFS= read -r -d '' comando
      IFS= read -r -d '' transcricao
      IFS= read -r -d '' cwd
      IFS= read -r -d '' alvos
    } < <(printf '%s' "$entrada" | node -e '
let j = {};
try { j = JSON.parse(require("fs").readFileSync(0, "utf8")); } catch (e) {}
const i = j.tool_input || {};
const c = i.command || "";
const alvos = [];
for (const m of c.matchAll(/(^|[^0-9&>=-])>>?\s*([^\s;&|<>()]+)/g)) alvos.push(m[2]);
for (const m of c.matchAll(/(^|[\s;&|])tee\s([^;&|<>()]*)/g)) alvos.push(...m[2].split(/\s+/));
if (/(^|[\s;&|])(sed|perl)\s+([^;&|]*\s)?-[A-Za-z]*i/.test(c)) alvos.push(...c.split(/[\s;&|]+/));
const limpos = alvos.map(a => a.replace(/["\x27]/g, "")).filter(Boolean);
process.stdout.write([c, j.transcript_path || "", j.cwd || "", limpos.join("\n")].join("\0") + "\0");' 2>/dev/null)
    [ -n "$comando" ] || exit 0
    ;;
  *) exit 0 ;;
esac

# ---------- Skills invocadas (lidas só quando preciso, uma vez) ----------
# Só eventos tool_use da ferramenta Skill contam, não texto solto. A transcrição só
# cresce, então um cache no diretório temporário guarda até onde já foi lida e cada
# chamada lê só o trecho novo. Se o node falhar, volta ao grep antigo (mais frouxo)
# em vez de bloquear tudo.
carregado=0
invocadas=""
modo_grep=0
carregar() {
  carregado=1
  [ -n "$transcricao" ] || return 0
  # Caminho no estilo Unix (testes, Git Bash) precisa virar caminho do Windows para o node.
  if [[ $transcricao == /* ]] && command -v cygpath >/dev/null 2>&1; then
    transcricao=$(cygpath -w "$transcricao" 2>/dev/null || printf '%s' "$transcricao")
  fi
  invocadas=$(node -e '
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const arq = process.argv[1];
if (!fs.existsSync(arq)) process.exit(0);
const md5 = x => crypto.createHash("md5").update(x).digest("hex");
const cache = path.join(os.tmpdir(), "fluxo-skills-" + md5(arq) + ".json");
let c = { pos: 0, skills: [] };
try { c = JSON.parse(fs.readFileSync(cache, "utf8")); } catch (e) {}
const tam = fs.statSync(arq).size;
const fd = fs.openSync(arq, "r");
// arquivo reescrito (menor ou com outro início): descarta o cache
const inicio = Buffer.alloc(Math.min(4096, tam));
fs.readSync(fd, inicio, 0, inicio.length, 0);
const cab = md5(inicio);
if (tam < c.pos || c.cab !== cab) c = { pos: 0, skills: [] };
const achadas = new Set(c.skills);
const visitar = o => {
  if (!o || typeof o !== "object") return;
  if (o.type === "tool_use" && o.name === "Skill" && o.input && typeof o.input.skill === "string")
    achadas.add(o.input.skill.split(":").pop());
  for (const k in o) visitar(o[k]);
};
if (tam > c.pos) {
  const buf = Buffer.alloc(tam - c.pos);
  fs.readSync(fd, buf, 0, buf.length, c.pos);
  const fim = buf.lastIndexOf(10);
  if (fim >= 0) {
    for (const l of buf.toString("utf8", 0, fim).split("\n")) {
      if (!l.includes("\"Skill\"")) continue;
      try { visitar(JSON.parse(l)); } catch (e) {}
    }
    c.pos += fim + 1;
  }
}
fs.closeSync(fd);
try {
  fs.writeFileSync(cache + ".tmp", JSON.stringify({ pos: c.pos, cab, skills: [...achadas] }));
  fs.renameSync(cache + ".tmp", cache);
} catch (e) {}
process.stdout.write([...achadas].join("\n"));' "$transcricao" 2>/dev/null) || modo_grep=1
}

invocou() {
  [ "$carregado" -eq 1 ] || carregar
  if [ "$modo_grep" -eq 1 ]; then
    [ -f "$transcricao" ] && grep -Eq "\"skill\"[[:space:]]*:[[:space:]]*\"([^\"]*:)?$1\"" "$transcricao"
  else
    [[ $'\n'$invocadas$'\n' == *$'\n'"$1"$'\n'* ]]
  fi
}

tem_construcao() {
  invocou incremental-implementation || invocou test-driven-development ||
    invocou frontend-ui-engineering || invocou debugging-and-error-recovery
}

bloquear() {
  printf 'TRAVA do fluxo-agentes: %s\n' "$1" >&2
  exit 2
}

exigir_construcao() {
  tem_construcao && return 0
  bloquear "$1 sem skill de construção ou de bug. Invoque incremental-implementation e test-driven-development (ou debugging-and-error-recovery, se for bug) pela ferramenta Skill e repita. Veja a tabela em using-agent-skills."
}

# ---------- Regras ----------
case "$ferramenta" in
  Edit | Write | MultiEdit | NotebookEdit)
    exigir_construcao "Edição de código ($arquivo)"
    ;;
  Bash)
    re_pr='gh[[:space:]]+pr[[:space:]]+create|glab[[:space:]]+mr[[:space:]]+create|git[[:space:]].*push.*merge_request\.create'
    re_commit='(^|[;&|(]|[[:space:]])git[[:space:]]+([^;&|]*[[:space:]])?commit([[:space:]]|$)'
    re_todos='(^|[[:space:]])-[a-zA-Z]*a[a-zA-Z]*([[:space:]]|$)|--all'
    # PR/MR
    if [[ $comando =~ $re_pr ]]; then
      faltam=""
      invocou code-review-and-quality || faltam="code-review-and-quality"
      invocou humanizer || faltam="${faltam:+$faltam e }humanizer"
      [ -z "$faltam" ] || bloquear "abrir PR/MR sem $faltam. Invoque pela ferramenta Skill (revise o diff e humanize o texto do PR) e repita."
      exit 0
    fi
    # commit
    if [[ $comando =~ $re_commit ]]; then
      arquivos=$(git -C "${cwd:-.}" diff --cached --name-only 2>/dev/null)
      if [[ $comando =~ $re_todos ]]; then
        arquivos+=$'\n'$(git -C "${cwd:-.}" diff --name-only 2>/dev/null)
      fi
      achou=0
      while IFS= read -r f; do
        [ -n "$f" ] || continue
        achou=1
        if codigo "$f"; then exigir_construcao "Commit de código ($f)"; break; fi
      done <<<"$arquivos"
      [ "$achou" -eq 1 ] || exigir_construcao "Commit (não foi possível ver os arquivos)"
    fi
    # escrita de código pelo Bash
    while IFS= read -r alvo; do
      if [ -n "$alvo" ] && codigo "$alvo"; then
        exigir_construcao "Escrita de código pelo Bash ($alvo)"
        break
      fi
    done <<<"$alvos"
    ;;
esac
exit 0
