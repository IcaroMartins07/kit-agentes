// Núcleo compartilhado pelos hooks do modo-deus. Só fs, os e path no topo: cada hook é um
// processo novo e no Windows cada import custa tempo. child_process entra sob demanda.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PASTA = ".modo-deus";

let kitCache = null;
export const kit = () => (kitCache ??= JSON.parse(fs.readFileSync(path.join(KIT, "kit.json"), "utf8")));

// ---------- entrada ----------
export function lerEntrada() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch {
    return {}; // entrada ilegível: o hook deixa passar, como na v1
  }
}

export const barra = (p) => (p || "").replace(/\\/g, "/");

// Raiz do projeto com o kit instalado. Sobe a partir do cwd procurando .modo-deus/config.json;
// numa worktree (onde a pasta não existe, porque fica fora do git) segue o arquivo .git até o repositório principal.
export function acharProjeto(entrada) {
  const inicio = path.resolve(process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd());
  const candidatos = [inicio];
  if (entrada.cwd && path.resolve(entrada.cwd) !== inicio) candidatos.push(path.resolve(entrada.cwd));
  for (const c of candidatos) {
    let d = c;
    for (let i = 0; i < 40; i++) {
      if (fs.existsSync(path.join(d, PASTA, "config.json"))) return { raiz: d, trabalho: c };
      const dotgit = path.join(d, ".git");
      try {
        const st = fs.statSync(dotgit);
        if (st.isFile()) {
          // worktree: "gitdir: <repo>/.git/worktrees/<nome>"
          const m = fs.readFileSync(dotgit, "utf8").match(/gitdir:\s*(.+)/);
          const principal = m && path.resolve(d, m[1].trim()).replace(/[\\/]\.git[\\/]worktrees[\\/].*$/, "");
          if (principal && fs.existsSync(path.join(principal, PASTA, "config.json"))) return { raiz: principal, trabalho: d };
        }
        break; // achou a raiz do git sem o kit
      } catch { /* sem .git aqui, continua subindo */ }
      const pai = path.dirname(d);
      if (pai === d) break;
      d = pai;
    }
  }
  return null;
}

export function lerConfig(raiz) {
  try {
    return JSON.parse(fs.readFileSync(path.join(raiz, PASTA, "config.json"), "utf8"));
  } catch {
    return { perfil: kit().perfil_padrao };
  }
}

// ---------- agente ----------
// agent_type vem como "modo-deus:dev-front" para agentes do plugin; sem agent_type é a sessão principal.
export function agenteDa(entrada) {
  const tipo = entrada.agent_type || "";
  const nome = tipo.split(":").pop();
  return { tipo, nome: nome || "principal", def: nome ? kit().agentes[nome] || null : null, id: entrada.agent_id || null };
}

// ---------- arquivos ----------
const EXT_CODIGO = new Set(("ts tsx js jsx mjs cjs py go rs java kt kts rb php cs c cc cpp h hpp swift dart scala ex exs lua sql vue svelte " +
  "css scss sass less html htm sh bash ps1").split(" "));

// Arquivo de código? Docs, configs e .claude/ ficam livres (mesma regra da v1).
export function ehCodigo(p) {
  const s = barra(p);
  if (/(^|\/)(\.claude|\.modo-deus|node_modules|\.git)\//.test(s)) return false;
  const base = s.split("/").pop();
  const i = base.lastIndexOf(".");
  if (i <= 0) return false;
  return EXT_CODIGO.has(base.slice(i + 1).toLowerCase());
}

// ---------- comandos de shell ----------
// Corpo de heredoc é dado (código, texto), não comando: fica só a linha de abertura (que pode ter "> arquivo").
export const semHeredoc = (cmd) => cmd.replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, (_, q, tag, resto) => " " + resto);

// Variáveis atribuídas no próprio comando (S=/tmp/x && ... $S/a) e a expansão delas.
export function expansor(cmd) {
  const vars = {};
  for (const m of cmd.matchAll(/(?:^|[\s;&|(])([A-Za-z_]\w*)=("[^"]*"|'[^']*'|[^\s;&|]+)/g)) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return (s) => s.replace(/\$\{?([A-Za-z_]\w*)\}?/g, (x, n) => vars[n] ?? x);
}

// Caminho do Bash do Git no Windows (/c/Users/..., /tmp/...) para o do sistema.
export function caminhoShell(p) {
  if (process.platform !== "win32") return p;
  if (/^\/tmp(\/|$)/.test(p)) return path.join(os.tmpdir(), p.slice(4));
  const m = p.match(/^\/([a-zA-Z])(\/.*)?$/);
  return m ? `${m[1].toUpperCase()}:${m[2] || "/"}` : p;
}

// Fora do projeto e dentro da pasta temporária do sistema (scratchpad, logs, prints): escrever ali não
// mexe no projeto. O "fora do projeto" vem antes porque um projeto pode morar no temp (os testes do kit moram).
export function foraNoTemp(raiz, trabalho, p) {
  const abs = path.resolve(trabalho || raiz, caminhoShell(p));
  const rel = path.relative(raiz, abs);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) return false;
  const a = barra(abs).toLowerCase();
  const t = barra(os.tmpdir()).toLowerCase().replace(/\/$/, "");
  return a.startsWith(t + "/") || a.startsWith("/tmp/") || /\/appdata\/local\/temp\//.test(a);
}

export function relativo(raiz, trabalho, p) {
  if (!p) return "";
  const abs = path.isAbsolute(p) ? p : path.resolve(trabalho || raiz, p);
  return barra(path.relative(raiz, abs));
}

// Glob mínimo: ** (qualquer profundidade), * (sem barra), ?.
const reCache = new Map();
export function casaGlob(rel, glob) {
  let re = reCache.get(glob);
  if (!re) {
    let s = "";
    for (let i = 0; i < glob.length; i++) {
      const c = glob[i];
      if (c === "*" && glob[i + 1] === "*") {
        if (glob[i + 2] === "/") { s += "(?:.*/)?"; i += 2; } else { s += ".*"; i += 1; }
      } else if (c === "*") s += "[^/]*";
      else if (c === "?") s += "[^/]";
      else s += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    re = new RegExp("^" + s + "$", process.platform === "win32" ? "i" : "");
    reCache.set(glob, re);
  }
  return re.test(rel);
}

// ---------- REGRAS.md ----------
export function lerRegras(raiz) {
  try {
    return fs.readFileSync(path.join(raiz, PASTA, "REGRAS.md"), "utf8");
  } catch {
    return null;
  }
}

export const camposAbertos = (texto) =>
  texto.replace(/<a definir>/g, "").replace(/<!--[\s\S]*?-->/g, "").match(/<(?:\.\.\.|[A-Za-zÀ-ÿ][^>\n]*)>/g) || [];

// "- **front**: `src/components/**`, `app/**`" -> { front: [...] }
export function territoriosDe(regras) {
  const out = {};
  const sec = (regras || "").split(/^## /m).find((b) => b.startsWith("Territórios"));
  if (!sec) return out;
  for (const l of sec.split("\n")) {
    const m = l.match(/^-\s+\*\*([\w-]+)\*\*:\s*(.*)$/);
    if (m) out[m[1]] = [...m[2].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
  }
  return out;
}

// Tabela de comandos -> { Testes: "npm run test", ... } (só os preenchidos)
export function comandosDe(regras) {
  const out = {};
  const sec = (regras || "").split(/^## /m).find((b) => b.startsWith("Comandos"));
  if (!sec) return out;
  for (const l of sec.split("\n")) {
    const m = l.match(/^\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|/);
    if (m && !/^<.*>$/.test(m[2])) out[m[1]] = m[2];
  }
  return out;
}

// ---------- telemetria ----------
export function registrar(raiz, ev) {
  try {
    const dir = path.join(raiz, PASTA, "telemetria");
    fs.mkdirSync(dir, { recursive: true });
    const dia = new Date().toISOString().slice(0, 10);
    fs.appendFileSync(path.join(dir, `${dia}.jsonl`), JSON.stringify({ ts: new Date().toISOString(), ...ev }) + "\n");
  } catch { /* telemetria nunca derruba o hook */ }
}

export const monitorLigado = (config) => (kit().perfis[config.perfil] || {}).monitor !== "desligado";

// ---------- saída ----------
export class Bloqueio extends Error {
  constructor(regra, motivo) {
    super(motivo);
    this.regra = regra;
  }
}
