#!/usr/bin/env node
// Atualiza as skills de terceiros a partir da origem, com commit pinado.
// Lê a tabela de skills/terceiros/README.md (pacote, origem owner/repo [pasta], commit).
//
// Uso:
//   node scripts/atualizar-terceiros.mjs                         simula: compara o local com o commit pinado
//   node scripts/atualizar-terceiros.mjs --ultimo                simula contra o HEAD remoto de cada pacote
//   node scripts/atualizar-terceiros.mjs --pacote humanizer --commit <sha>
//   ... --aplicar                                                copia por cima e atualiza o commit na tabela
// Opções de teste/uso avançado:
//   --origem <pasta>   usa <pasta>/<owner>/<repo> como repositório de origem (sem rede)
//   --kit <pasta>      raiz do kit a atualizar (padrão: a deste script)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const KIT_PADRAO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const README = path.join("skills", "terceiros", "README.md");
const TERCEIROS = path.join("skills", "terceiros");

export class ErroUso extends Error {}

const barra = (p) => p.replace(/\\/g, "/");

function git(dir, args) {
  return execFileSync("git", dir ? ["-C", dir, ...args] : args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// ---------- tabela ----------
// | `playwright\playwright-skill` | lackeyjb/playwright-skill (pasta `skills/playwright-skill`) | dd47a6a |
const RE_LINHA = /^\|\s*`([^`]+)`\s*\|\s*([\w.-]+)\/([\w.-]+)(?:\s*\(pasta\s*`([^`]+)`\))?\s*\|\s*([0-9a-fA-F]{7,40})\s*\|\s*$/;

export function lerTabela(texto) {
  const linhas = [];
  for (const l of texto.split(/\r?\n/)) {
    const m = l.match(RE_LINHA);
    if (!m) continue;
    const local = barra(m[1]).replace(/\/+$/, "");
    const [pacote, skill = null] = local.split("/");
    linhas.push({ coluna: m[1], pacote, skill, owner: m[2], repo: m[3], pasta: m[4] ? barra(m[4]).replace(/\/+$/, "") : null, commit: m[5], linha: l });
  }
  return linhas;
}

export function alteracoesLocais(texto) {
  const i = texto.search(/^Alterações locais/m);
  if (i < 0) return "";
  const resto = texto.slice(i);
  const fim = resto.search(/^## /m);
  return (fim < 0 ? resto : resto.slice(0, fim)).trim();
}

export function trocarCommit(texto, entrada, novo) {
  const nova = entrada.linha.replace(/\|\s*[0-9a-fA-F]{7,40}\s*\|\s*$/, () => `| ${novo} |`);
  return texto.split(entrada.linha).join(nova);
}

// ---------- árvores ----------
// Lista arquivos (caminhos relativos com /). Ignora .git em qualquer nível, node_modules
// e, se pularOcultos, entradas de topo começando com "." (para quando a skill é a raiz do repositório).
function arquivos(dir, { pularOcultos = false, pularSkills = false } = {}) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const andar = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      if (!rel && pularOcultos && e.name.startsWith(".")) continue;
      const abs = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (pularSkills && fs.existsSync(path.join(abs, "SKILL.md"))) continue; // outra skill dentro da raiz
        andar(abs, r);
      } else if (e.isFile()) out.push(r);
    }
  };
  andar(dir, "");
  return out.sort();
}

function dirsDeSkill(raiz) {
  const out = [];
  const andar = (d, rel, prof) => {
    if (prof > 6) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === ".git" || e.name === "node_modules") continue;
      const abs = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (fs.existsSync(path.join(abs, "SKILL.md"))) out.push(r);
      andar(abs, r, prof + 1);
    }
  };
  andar(raiz, "", 0);
  // Preferência: caminho sem pasta oculta (.agent/, .claude/ são cópias para outras ferramentas), depois o mais raso.
  const ocultas = (p) => p.split("/").filter((s) => s.startsWith(".")).length;
  return out.sort((a, b) => ocultas(a) - ocultas(b) || a.split("/").length - b.split("/").length || a.localeCompare(b));
}

const normalizar = (buf) => buf.toString("latin1").replace(/\r\n/g, "\n");
const iguais = (a, b) => {
  const x = fs.readFileSync(a), y = fs.readFileSync(b);
  return x.equals(y) || normalizar(x) === normalizar(y);
};

// raizRepo: arquivo de topo que só existe localmente mas está na raiz do repositório de origem
// (LICENSE copiado junto com a skill) é comparado com o da raiz em vez de ser removido.
export function comparar(localDir, remotoDir, { raizRepo = null, ...opcoes } = {}) {
  const loc = new Set(arquivos(localDir));
  const rem = arquivos(remotoDir, opcoes);
  const remSet = new Set(rem);
  const fonte = Object.fromEntries(rem.map((f) => [f, path.join(remotoDir, f)]));
  for (const f of loc) {
    if (remSet.has(f) || f.includes("/") || !raizRepo) continue;
    const r = path.join(raizRepo, f);
    if (fs.existsSync(r) && fs.statSync(r).isFile()) fonte[f] = r;
  }
  // Skill na raiz do repositório: arquivo novo de topo (CHANGELOG, AGENTS.md...) é do repositório, não da skill.
  const novos = rem.filter((f) => !loc.has(f) && !(opcoes.pularOcultos && !f.includes("/")));
  const alterados = Object.keys(fonte).filter((f) => loc.has(f) && !iguais(path.join(localDir, f), fonte[f])).sort();
  const removidos = [...loc].filter((f) => !fonte[f]).sort();
  return { novos, alterados, removidos, fonte };
}

// Casa cada skill local com a pasta correspondente na origem.
export function mapear(entrada, kitDir, checkout) {
  const pacoteDir = path.join(kitDir, TERCEIROS, entrada.pacote);
  const locais = entrada.skill ? [entrada.skill] : fs.existsSync(pacoteDir) ? fs.readdirSync(pacoteDir).filter((n) => fs.existsSync(path.join(pacoteDir, n, "SKILL.md"))).sort() : [];
  const remotas = dirsDeSkill(checkout);
  const raizTemSkill = fs.existsSync(path.join(checkout, "SKILL.md"));
  const pares = [];
  const faltando = [];
  for (const s of locais) {
    let r = null;
    if (entrada.pasta && locais.length === 1) r = fs.existsSync(path.join(checkout, entrada.pasta)) ? entrada.pasta : null;
    else {
      // Mesmo nome em várias pastas (cópias para Cursor, .agent etc.): fica a que mais se parece com o local.
      const cand = remotas.filter((x) => x.split("/").pop() === s);
      const dif = (x) => {
        const d = comparar(path.join(pacoteDir, s), path.join(checkout, x));
        return d.novos.length + d.alterados.length + d.removidos.length;
      };
      r = cand.length > 1 ? cand.map((x, i) => [dif(x), i, x]).sort((a, b) => a[0] - b[0] || a[1] - b[1])[0][2] : cand[0] ?? (raizTemSkill && locais.length === 1 ? "" : null);
    }
    if (r === null) faltando.push(s);
    else pares.push({ skill: s, local: path.join(pacoteDir, s), remoto: r });
  }
  // Pacote inteiro: skill nova na origem, ao lado das que já casaram.
  const novas = [];
  if (!entrada.skill) {
    const pais = new Set(pares.filter((p) => p.remoto).map((p) => p.remoto.split("/").slice(0, -1).join("/")));
    for (const r of remotas) {
      const pai = r.split("/").slice(0, -1).join("/");
      const nome = r.split("/").pop();
      if (pais.has(pai) && !locais.includes(nome)) novas.push({ skill: nome, local: path.join(pacoteDir, nome), remoto: r });
    }
  }
  return { pares, faltando, novas };
}

// ---------- origem ----------
export function urlDe(entrada, origem) {
  return origem ? path.join(path.resolve(origem), entrada.owner, entrada.repo) : `https://github.com/${entrada.owner}/${entrada.repo}.git`;
}

function baixar(url, ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "modo-deus-terceiros-"));
  try {
    git(null, ["clone", "-q", "--filter=blob:none", "--no-checkout", url, dir]);
    const sha = git(dir, ["rev-parse", "--verify", `${ref || "HEAD"}^{commit}`]);
    git(dir, ["checkout", "-q", "--detach", sha]);
    return { dir, sha };
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`não consegui obter ${url}${ref ? ` @ ${ref}` : ""}: ${String(e.stderr || e.message).trim().split("\n").pop()}`);
  }
}

function copiarPar(par, diff) {
  for (const f of diff.removidos) fs.rmSync(path.join(par.local, f), { force: true });
  for (const f of [...diff.novos, ...diff.alterados]) {
    fs.mkdirSync(path.dirname(path.join(par.local, f)), { recursive: true });
    fs.copyFileSync(diff.fonte[f], path.join(par.local, f));
  }
  // pastas que ficaram vazias
  const limpar = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) limpar(path.join(d, e.name));
    if (d !== par.local && !fs.readdirSync(d).length) fs.rmdirSync(d);
  };
  limpar(par.local);
}

// ---------- principal ----------
export function atualizar({ kitDir = KIT_PADRAO, pacote = null, commit = null, ultimo = false, aplicar = false, origem = null, log = console.log } = {}) {
  const readmeF = path.join(kitDir, README);
  let texto = fs.readFileSync(readmeF, "utf8");
  let tabela = lerTabela(texto);
  if (!tabela.length) throw new ErroUso(`nenhuma linha de pacote reconhecida em ${README}`);
  if (pacote) {
    tabela = tabela.filter((e) => e.pacote === pacote || e.skill === pacote || barra(e.coluna).replace(/\/+$/, "") === pacote);
    if (!tabela.length) throw new ErroUso(`pacote ${pacote} não está na tabela`);
  }
  if (commit && tabela.length > 1) throw new ErroUso("--commit vale para um pacote só; use --pacote <nome>");
  if (commit && ultimo) throw new ErroUso("use --commit ou --ultimo, não os dois");

  const resultados = [];
  let mudouTabela = false;
  for (const e of tabela) {
    const ref = commit || (ultimo ? null : e.commit);
    log(`== ${barra(e.coluna)}  ${e.owner}/${e.repo}${e.pasta ? ` (pasta ${e.pasta})` : ""}  ${e.commit} -> ${ref || "HEAD remoto"}`);
    let baixado;
    try {
      baixado = baixar(urlDe(e, origem), ref);
    } catch (err) {
      log(`ERRO     ${err.message}`);
      resultados.push({ entrada: e, erro: err.message });
      continue;
    }
    try {
      const curto = baixado.sha.slice(0, 7);
      const { pares, faltando, novas } = mapear(e, kitDir, baixado.dir);
      const res = { entrada: e, sha: baixado.sha, pares: [], faltando, novas: novas.map((n) => n.skill) };
      for (const s of faltando) log(`AVISO    ${s}: não encontrada na origem (mantida como está; confira se foi renomeada ou removida)`);
      for (const par of [...pares, ...novas]) {
        const opcoes = par.remoto === "" ? { pularOcultos: true, pularSkills: true } : { raizRepo: baixado.dir };
        const diff = comparar(par.local, path.join(baixado.dir, par.remoto), opcoes);
        const total = diff.novos.length + diff.alterados.length + diff.removidos.length;
        const nova = novas.includes(par);
        log(`${nova ? "nova     " : "skill    "}${par.skill} <- ${par.remoto || "(raiz)"}: ${total ? `${diff.novos.length} novo(s), ${diff.alterados.length} alterado(s), ${diff.removidos.length} removido(s)` : "igual"}`);
        for (const f of diff.novos) log(`  + ${f}`);
        for (const f of diff.alterados) log(`  ~ ${f}`);
        for (const f of diff.removidos) log(`  - ${f}`);
        const { fonte, ...lista } = diff;
        res.pares.push({ skill: par.skill, remoto: par.remoto, nova, ...lista });
        if (aplicar && total) copiarPar(par, diff);
      }
      if (aplicar && curto.toLowerCase() !== e.commit.toLowerCase().slice(0, 7)) {
        texto = trocarCommit(texto, e, curto);
        mudouTabela = true;
        log(`tabela   ${barra(e.coluna)}: ${e.commit} -> ${curto}`);
      }
      resultados.push(res);
    } finally {
      fs.rmSync(baixado.dir, { recursive: true, force: true });
    }
  }

  if (aplicar && mudouTabela) fs.writeFileSync(readmeF, texto);
  log("");
  if (!aplicar) {
    log("Simulação: nada foi alterado. Rode de novo com --aplicar para copiar e atualizar a tabela.");
  } else {
    log("Aplicado. Revise com `git diff skills/terceiros` e rode `npm test`.");
    const notas = alteracoesLocais(texto);
    if (notas) {
      log("");
      log("Refaça à mão as alterações locais que a cópia pode ter desfeito:");
      log("");
      log(notas);
    }
  }
  return resultados;
}

function args(argv) {
  const o = { pacote: null, commit: null, ultimo: false, aplicar: false, origem: null, kitDir: KIT_PADRAO };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valor = () => {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new ErroUso(`${a} precisa de um valor`);
      return v;
    };
    if (a === "--pacote") o.pacote = valor();
    else if (a === "--commit") o.commit = valor();
    else if (a === "--ultimo") o.ultimo = true;
    else if (a === "--aplicar") o.aplicar = true;
    else if (a === "--origem") o.origem = valor();
    else if (a === "--kit") o.kitDir = path.resolve(valor());
    else if (a === "-h" || a === "--help") throw new ErroUso("");
    else throw new ErroUso(`opção desconhecida: ${a}`);
  }
  return o;
}

const mesmoArquivo = (a, b) => {
  const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
  const [x, y] = [real(a), real(b)];
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
};
if (process.argv[1] && mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const res = atualizar(args(process.argv.slice(2)));
    if (res.some((r) => r.erro)) process.exitCode = 1;
  } catch (e) {
    if (!(e instanceof ErroUso)) throw e;
    if (e.message) console.error(`erro: ${e.message}`);
    console.error("uso: node scripts/atualizar-terceiros.mjs [--pacote <nome>] [--commit <sha> | --ultimo] [--aplicar] [--origem <pasta>] [--kit <pasta>]");
    process.exitCode = 1;
  }
}
