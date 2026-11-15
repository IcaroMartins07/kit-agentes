#!/usr/bin/env node
// Migração do fluxo-agentes (v1) para o modo-deus. Padrão: simulação, nada é alterado.
//
// Uso:
//   node scripts/migrar-v1.mjs --global [--aplicar] [--forcar]   skills globais da v1 (~/.claude/skills)
//   node scripts/migrar-v1.mjs <caminho> [--aplicar]             parte da v1 dentro de um projeto
//
// Global: remove só as skills listadas em ~/.claude/fluxo-skills.txt que o modo-deus já cobre
// (plugin, superpowers ou substituta). Exige o plugin modo-deus instalado (ou --forcar).
// Projeto: remove .claude/fluxo/, os comandos da v1 (instalados.txt), os hooks da v1 no
// .claude/settings.local.json e o bloco "# fluxo-agentes (kit local)" do .git/info/exclude.
// Tudo vai antes para ~/.claude/modo-deus/backups/migracao-v1-<data>/.
// O HOME pode ser trocado por MODO_DEUS_HOME (mesma convenção do instalar.mjs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kit = JSON.parse(fs.readFileSync(path.join(KIT, "kit.json"), "utf8"));
const MARCA_INI = "# fluxo-agentes (kit local)";
const MARCA_FIM = "# /fluxo-agentes";
const PASTA_V1 = ".claude/fluxo";
const HOOKS_V1 = ".claude/fluxo/hooks/";
const SETTINGS = ".claude/settings.local.json";

export class ErroUso extends Error {}

const home = () => process.env.MODO_DEUS_HOME || os.homedir();
const carimbo = () => new Date().toISOString().replace(/[:.]/g, "-");
export const pastaBackup = (marca = carimbo()) => path.join(home(), ".claude", "modo-deus", "backups", `migracao-v1-${marca}`);

function git(dir, ...args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function executor(aplicar, log) {
  return (descricao, fazer) => {
    log(aplicar ? descricao : `[simulação] ${descricao}`);
    if (aplicar) fazer();
  };
}

const linhas = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")) : []);

// ---------- global ----------
// Para cada skill da v1: quem a substitui no modo-deus. null = sem equivalente.
export function substituta(nome) {
  if (kit.skills.incluidas[nome]) return `plugin modo-deus (modo-deus:${nome})`;
  if (kit.skills.do_superpowers.includes(nome)) return `superpowers:${nome}`;
  if (kit.skills.excluidas[nome]) return kit.skills.excluidas[nome];
  return null;
}

function pluginInstalado() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(home(), ".claude", "plugins", "installed_plugins.json"), "utf8"));
    return Object.keys(j.plugins || j).some((k) => k.startsWith("modo-deus@"));
  } catch {
    return false;
  }
}

export function migrarGlobal({ aplicar = false, forcar = false, log = console.log, backup = null } = {}) {
  const claude = path.join(home(), ".claude");
  const manifesto = path.join(claude, "fluxo-skills.txt");
  const skillsDir = path.join(claude, "skills");
  const fazer = executor(aplicar, log);
  if (!fs.existsSync(manifesto)) {
    log(`Nada a migrar: ${manifesto} não existe (skills globais da v1 não instaladas).`);
    return { removidas: [], mantidas: [], backup: null };
  }
  const nomes = linhas(manifesto).filter((n) => !/[\\/]|^\.\.?$/.test(n)); // só nomes simples, nunca caminhos
  const removidas = [], mantidas = [], ausentes = [];
  for (const n of nomes) {
    const dir = path.join(skillsDir, n);
    const sub = substituta(n);
    if (!fs.existsSync(dir)) { ausentes.push(n); continue; }
    if (sub) removidas.push(n);
    else mantidas.push(n);
    log(`${sub ? "remover " : "manter  "} ~/.claude/skills/${n}${sub ? `  (coberta por ${sub})` : "  (sem equivalente no modo-deus)"}`);
  }
  for (const n of ausentes) log(`ausente  ~/.claude/skills/${n} (listada no manifesto, já não existe)`);

  if (aplicar && removidas.length && !pluginInstalado() && !forcar) {
    throw new ErroUso("o plugin modo-deus não aparece em ~/.claude/plugins/installed_plugins.json; instale-o antes (ou use --forcar)");
  }
  backup ??= pastaBackup();
  if (removidas.length || ausentes.length) {
    const destino = path.join(backup, "global");
    fazer(`backup   ${destino}`, () => {
      fs.mkdirSync(path.join(destino, "skills"), { recursive: true });
      fs.copyFileSync(manifesto, path.join(destino, "fluxo-skills.txt"));
      for (const n of removidas) fs.cpSync(path.join(skillsDir, n), path.join(destino, "skills", n), { recursive: true });
    });
    for (const n of removidas) fazer(`removida ~/.claude/skills/${n}`, () => fs.rmSync(path.join(skillsDir, n), { recursive: true, force: true }));
    fazer(mantidas.length ? `manifesto fluxo-skills.txt reescrito com ${mantidas.length} skill(s) mantida(s)` : "manifesto fluxo-skills.txt removido", () => {
      if (mantidas.length) fs.writeFileSync(manifesto, mantidas.join("\n") + "\n");
      else fs.rmSync(manifesto);
    });
  }
  log("");
  log(aplicar ? `Skills globais da v1 migradas. Backup em ${backup}` : "Simulação: nada foi alterado. Rode com --aplicar para remover.");
  if (mantidas.length) log(`Mantidas por não terem equivalente: ${mantidas.join(", ")}. Remova à mão se não quiser mais.`);
  log("O graphify e skills fora do manifesto não são tocados.");
  return { removidas, mantidas, ausentes, backup: aplicar ? backup : null };
}

// ---------- projeto ----------
export function semBlocoV1(texto) {
  const fora = [];
  let dentro = false, achou = false;
  for (const l of texto.split(/\r?\n/)) {
    if (l === MARCA_INI) { dentro = true; achou = true; }
    else if (dentro && l === MARCA_FIM) dentro = false;
    else if (!dentro) fora.push(l);
  }
  while (fora.length && fora[fora.length - 1] === "") fora.pop();
  return { achou, texto: fora.length ? fora.join("\n") + "\n" : "" };
}

// Tira do settings só os hooks cujo comando aponta para .claude/fluxo/hooks/.
export function semHooksV1(dados) {
  const s = JSON.parse(JSON.stringify(dados));
  let removidos = 0;
  if (!s.hooks || typeof s.hooks !== "object") return { dados: s, removidos };
  for (const evento of Object.keys(s.hooks)) {
    const grupos = Array.isArray(s.hooks[evento]) ? s.hooks[evento] : [];
    const novos = [];
    for (const g of grupos) {
      const hs = (g.hooks || []).filter((h) => {
        const v1 = typeof h.command === "string" && h.command.replace(/\\/g, "/").includes(HOOKS_V1);
        if (v1) removidos++;
        return !v1;
      });
      if (hs.length) novos.push({ ...g, hooks: hs });
      else if (!(g.hooks || []).length) novos.push(g); // grupo estranho sem hooks: não é nosso, fica
    }
    if (novos.length) s.hooks[evento] = novos;
    else delete s.hooks[evento];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  return { dados: s, removidos };
}

export function migrarProjeto(caminho, { aplicar = false, log = console.log, backup = null } = {}) {
  const top = git(caminho, "rev-parse", "--show-toplevel");
  if (!top) throw new ErroUso(`${caminho} não é um repositório git`);
  const raiz = path.resolve(top);
  const fazer = executor(aplicar, log);
  const versionado = (rel) => !!git(raiz, "ls-files", "--", rel);
  backup ??= pastaBackup();
  const destino = path.join(backup, `projeto-${path.basename(raiz)}`);
  const itens = [];

  // .claude/fluxo/ e comandos da v1
  const pasta = path.join(raiz, PASTA_V1);
  const temPasta = fs.existsSync(pasta) && !versionado(PASTA_V1);
  if (fs.existsSync(pasta) && !temPasta) log(`AVISO    ${PASTA_V1}/ é versionado pelo projeto; não mexo`);
  const comandos = linhas(path.join(pasta, "instalados.txt"))
    .map((l) => l.replace(/\\/g, "/"))
    .filter((l) => /^\.claude\/commands\/[^/]+\.md$/.test(l))
    .filter((l) => fs.existsSync(path.join(raiz, l)))
    .filter((l) => {
      if (versionado(l)) { log(`pulado   ${l} (o projeto versiona)`); return false; }
      return true;
    });

  // settings.local.json
  const settingsF = path.join(raiz, SETTINGS);
  let settings = null;
  if (fs.existsSync(settingsF) && !versionado(SETTINGS)) {
    let dados;
    try { dados = JSON.parse(fs.readFileSync(settingsF, "utf8")); }
    catch { throw new ErroUso(`${SETTINGS} não é JSON válido; não alterei nada`); }
    const r = semHooksV1(dados);
    if (r.removidos) settings = r;
  }

  // exclude (diretório comum do git: vale para as worktrees)
  const comum = git(raiz, "rev-parse", "--git-common-dir");
  const excF = comum ? path.join(path.resolve(raiz, comum), "info", "exclude") : null;
  const exc = excF && fs.existsSync(excF) ? semBlocoV1(fs.readFileSync(excF, "utf8")) : { achou: false };

  if (temPasta) itens.push(`${PASTA_V1}/ (hooks, REGRAS.md e manifesto da v1)`);
  for (const c of comandos) itens.push(`${c} (comando da v1)`);
  if (settings) itens.push(`${SETTINGS}: ${settings.removidos} hook(s) da v1`);
  if (exc.achou) itens.push(`.git/info/exclude: bloco "${MARCA_INI}"`);

  if (!itens.length) {
    log(`Nada da v1 em ${raiz}.`);
  } else {
    for (const i of itens) log(`remover  ${i}`);
    fazer(`backup   ${destino}`, () => {
      fs.mkdirSync(destino, { recursive: true });
      if (temPasta) fs.cpSync(pasta, path.join(destino, "fluxo"), { recursive: true });
      for (const c of comandos) {
        fs.mkdirSync(path.join(destino, "commands"), { recursive: true });
        fs.copyFileSync(path.join(raiz, c), path.join(destino, "commands", path.basename(c)));
      }
      if (settings) fs.copyFileSync(settingsF, path.join(destino, "settings.local.json"));
      if (exc.achou) fs.copyFileSync(excF, path.join(destino, "exclude"));
      fs.writeFileSync(path.join(destino, "ORIGEM.txt"), `${raiz}\n`);
    });
    for (const c of comandos) fazer(`removido ${c}`, () => fs.rmSync(path.join(raiz, c), { force: true }));
    if (temPasta) fazer(`removida ${PASTA_V1}/`, () => fs.rmSync(pasta, { recursive: true, force: true }));
    if (settings) {
      const vazio = !Object.keys(settings.dados).length;
      fazer(`settings ${SETTINGS}: ${settings.removidos} hook(s) da v1 removido(s)${vazio ? "; arquivo ficou vazio e foi apagado" : ", resto preservado"}`, () => {
        if (vazio) fs.rmSync(settingsF);
        else fs.writeFileSync(settingsF, JSON.stringify(settings.dados, null, 2) + "\n");
      });
    }
    if (exc.achou) fazer("exclude  bloco da v1 removido, resto preservado", () => fs.writeFileSync(excF, exc.texto));
  }

  log("");
  if (aplicar && itens.length) {
    log(`v1 removida de ${raiz}. Backup em ${destino}`);
    log(`O REGRAS.md da v1 está no backup (fluxo/REGRAS.md): use-o para preencher o novo.`);
  } else if (itens.length) log("Simulação: nada foi alterado. Rode com --aplicar para remover.");
  log("Se a v1 registrou o MCP do Playwright nesta pasta, ele continua; para tirar: claude mcp remove playwright -s local");
  log(`Próximo passo: node "${path.join(KIT, "instalar.mjs")}" "${raiz}"`);
  return { raiz, itens, backup: aplicar && itens.length ? destino : null };
}

// ---------- CLI ----------
function args(argv) {
  const o = { global: false, aplicar: false, forcar: false, caminho: null };
  for (const a of argv) {
    if (a === "--global") o.global = true;
    else if (a === "--aplicar") o.aplicar = true;
    else if (a === "--forcar") o.forcar = true;
    else if (a === "-h" || a === "--help") throw new ErroUso("");
    else if (a.startsWith("--")) throw new ErroUso(`opção desconhecida: ${a}`);
    else if (o.caminho) throw new ErroUso("um caminho de projeto por vez");
    else o.caminho = a;
  }
  if (o.global === !!o.caminho) throw new ErroUso("escolha --global ou um caminho de projeto (são passos separados)");
  return o;
}

const mesmoArquivo = (a, b) => {
  const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
  const [x, y] = [real(a), real(b)];
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
};
if (process.argv[1] && mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const o = args(process.argv.slice(2));
    if (o.global) migrarGlobal(o);
    else migrarProjeto(o.caminho, o);
  } catch (e) {
    if (!(e instanceof ErroUso)) throw e;
    if (e.message) console.error(`erro: ${e.message}`);
    console.error("uso: node scripts/migrar-v1.mjs --global [--aplicar] [--forcar]\n     node scripts/migrar-v1.mjs <caminho-do-projeto> [--aplicar]");
    process.exitCode = 1;
  }
}
