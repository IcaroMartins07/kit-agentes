// Trava de fase (porta do exigir-skill.sh da v1):
//  - editar/criar código (Edit/Write ou escrita pelo Bash) e commit de código exigem skill de construção ou de bug
//  - abrir PR/MR exige code-review-and-quality e humanizer
// Só conta a skill invocada pela ferramenta Skill (evento tool_use), não o nome citado no texto.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { kit, PASTA, ehCodigo, Bloqueio, semHeredoc, expansor, foraNoTemp } from "./comum.mjs";

// ---------- skills invocadas, com leitura incremental da transcrição ----------
// O cache fica em <raiz>/.modo-deus/cache/: os hooks do kit não escrevem fora da pasta do kit.
function skillsDa(arq, dirCache) {
  if (!arq || !fs.existsSync(arq)) return [];
  const { createHash } = awaitCrypto();
  const md5 = (x) => createHash("md5").update(x).digest("hex");
  fs.mkdirSync(dirCache, { recursive: true });
  const cacheF = path.join(dirCache, "skills-" + md5(arq) + ".json");
  let c = { pos: 0, skills: [] };
  try { c = JSON.parse(fs.readFileSync(cacheF, "utf8")); } catch { /* sem cache */ }
  const tam = fs.statSync(arq).size;
  const fd = fs.openSync(arq, "r");
  try {
    // arquivo reescrito (menor ou com outro início): descarta o cache
    const inicio = Buffer.alloc(Math.min(4096, tam));
    fs.readSync(fd, inicio, 0, inicio.length, 0);
    const cab = md5(inicio);
    if (tam < c.pos || c.cab !== cab) c = { pos: 0, skills: [] };
    const achadas = new Set(c.skills);
    const visitar = (o) => {
      if (!o || typeof o !== "object") return;
      if (o.type === "tool_use" && o.name === "Skill" && o.input && typeof o.input.skill === "string") achadas.add(o.input.skill.split(":").pop());
      for (const k in o) visitar(o[k]);
    };
    if (tam > c.pos) {
      const buf = Buffer.alloc(tam - c.pos);
      fs.readSync(fd, buf, 0, buf.length, c.pos);
      const fim = buf.lastIndexOf(10);
      if (fim >= 0) {
        for (const l of buf.toString("utf8", 0, fim).split("\n")) {
          if (!l.includes('"Skill"')) continue;
          try { visitar(JSON.parse(l)); } catch { /* linha parcial */ }
        }
        c.pos += fim + 1;
      }
    }
    c = { pos: c.pos, cab, skills: [...achadas] };
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.writeFileSync(cacheF + ".tmp", JSON.stringify(c));
    fs.renameSync(cacheF + ".tmp", cacheF);
  } catch { /* cache é otimização */ }
  return c.skills;
}

// Módulos carregados sob demanda: crypto só quando há transcrição, child_process só em commit.
const exigir = createRequire(import.meta.url);
const awaitCrypto = () => exigir("node:crypto");

// Transcrições a olhar: a da sessão e, dentro de subagente, a do próprio subagente.
function transcricoes(entrada) {
  const t = entrada.transcript_path ? [entrada.transcript_path] : [];
  if (entrada.agent_transcript_path) t.push(entrada.agent_transcript_path);
  else if (entrada.agent_id && entrada.transcript_path && entrada.session_id) {
    t.push(path.join(path.dirname(entrada.transcript_path), entrada.session_id, "subagents", `agent-${entrada.agent_id}.jsonl`));
  }
  return t;
}

export function criarInvocou(entrada, raiz) {
  const dirCache = raiz ? path.join(raiz, PASTA, "cache") : path.join(os.tmpdir(), "modo-deus-cache");
  let lista = null;
  return (nome) => {
    if (!lista) {
      lista = new Set();
      try {
        for (const t of transcricoes(entrada)) for (const s of skillsDa(t, dirCache)) lista.add(s);
      } catch {
        // sem crypto ou erro de leitura: volta ao grep frouxo da v1 em vez de bloquear tudo
        for (const t of transcricoes(entrada)) {
          try {
            const txt = fs.readFileSync(t, "utf8");
            for (const m of txt.matchAll(/"skill"\s*:\s*"(?:[^"]*:)?([^"]+)"/g)) lista.add(m[1]);
          } catch { /* sem transcrição */ }
        }
      }
    }
    return lista.has(nome);
  };
}

// ---------- alvos de escrita pelo Bash ----------
export function alvosDeEscrita(comando) {
  const expandir = expansor(comando);
  // Texto entre aspas é dado (node -e "a > b"); só vale como alvo quando vem logo depois do ">".
  const cmd = semHeredoc(comando).replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (q, i, s) => (/>>?\s*$/.test(s.slice(0, i)) ? q.slice(1, -1) : "Q"));
  const alvos = [];
  for (const m of cmd.matchAll(/(^|[^0-9&>=-])>>?\s*([^\s;&|<>()]+)/g)) alvos.push(m[2]);
  for (const m of cmd.matchAll(/(^|[\s;&|])tee\s([^;&|<>()]*)/g)) alvos.push(...m[2].split(/\s+/).filter((x) => !x.startsWith("-")));
  if (/(^|[\s;&|])(sed|perl)\s+([^;&|]*\s)?-[A-Za-z]*i/.test(cmd)) alvos.push(...cmd.split(/[\s;&|]+/));
  return alvos.map((a) => expandir(a.replace(/["']/g, ""))).filter(Boolean);
}

const RE_PR = /gh\s+pr\s+create|glab\s+mr\s+create|git\s.*push.*merge_request\.create/;
const RE_COMMIT = /(^|[;&|(]|\s)git\s+([^;&|]*\s)?commit(\s|$)/;
const RE_TODOS = /(^|\s)-[a-zA-Z]*a[a-zA-Z]*(\s|$)|--all/;

function arquivosDoCommit(cmd, cwd) {
  const { execFileSync } = exigir("node:child_process");
  const git = (...a) => {
    try { return execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; }
  };
  let s = git("diff", "--cached", "--name-only");
  if (RE_TODOS.test(cmd)) s += "\n" + git("diff", "--name-only");
  return s.split("\n").map((x) => x.trim()).filter(Boolean);
}

// ---------- regra ----------
export function checarTrava(entrada, ctx) {
  const k = kit().trava;
  const invocou = ctx.invocou;
  // Agentes do kit que constroem (dev, qa) carregam as skills de construção pela definição (F4).
  const construtor = ctx.agente.def && ["dev", "qa"].includes(ctx.agente.def.time);
  const temConstrucao = () => construtor || k.construcao.some((s) => invocou(s));
  const exigirConstrucao = (oque) => {
    if (temConstrucao()) return;
    throw new Bloqueio("trava", `${oque} sem skill de construção ou de bug. Invoque pela ferramenta Skill: incremental-implementation e superpowers:test-driven-development (ou superpowers:systematic-debugging, se for bug), e repita.`);
  };

  const t = entrada.tool_name;
  const i = entrada.tool_input || {};
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(t)) {
    const arq = i.file_path || i.notebook_path || "";
    if (ehCodigo(arq) && !foraNoTemp(ctx.raiz, ctx.trabalho, arq)) exigirConstrucao(`Edição de código (${arq})`);
    return;
  }
  if (t !== "Bash") return;
  const cmd = i.command || "";
  if (!/commit|create|merge_request|>|tee|-[a-zA-Z]*i/.test(cmd)) return;

  if (RE_PR.test(cmd)) {
    const faltam = k.pr.filter((s) => !invocou(s));
    if (faltam.length) throw new Bloqueio("trava", `abrir PR/MR sem ${faltam.join(" e ")}. Invoque pela ferramenta Skill (revise o diff e humanize o texto do PR) e repita.`);
    return;
  }
  if (RE_COMMIT.test(cmd)) {
    const arqs = arquivosDoCommit(cmd, ctx.trabalho);
    if (!arqs.length) exigirConstrucao("Commit (não foi possível ver os arquivos)");
    const cod = arqs.find(ehCodigo);
    if (cod) exigirConstrucao(`Commit de código (${cod})`);
  }
  const alvo = alvosDeEscrita(cmd).find((a) => ehCodigo(a) && !foraNoTemp(ctx.raiz, ctx.trabalho, a));
  if (alvo) exigirConstrucao(`Escrita de código pelo Bash (${alvo})`);
}
