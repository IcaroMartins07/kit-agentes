#!/usr/bin/env node
// Parte por projeto do modo-deus. Skills, agentes, comandos e hooks vêm do plugin;
// aqui ficam REGRAS.md, config do perfil, deny-list e exclude, tudo fora do git.
//
// Uso:
//   node instalar.mjs [caminho] [--perfil leve|estrito|deus] [--times dev-mobile=ligado,...] [--dry-run]
//   node instalar.mjs --remover [caminho] [--dry-run]
//   node instalar.mjs doctor [caminho]
//   node instalar.mjs dependencias [--dry-run]     plugins obrigatórios e graphify (nunca o caveman)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const KIT = path.dirname(fileURLToPath(import.meta.url));
const lerJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const kit = lerJson(path.join(KIT, "kit.json"));
const MARCA_INI = "# modo-deus (kit local)";
const MARCA_FIM = "# /modo-deus";
const PASTA = ".claude/modo-deus";
const SETTINGS = ".claude/settings.local.json";
const MODOS_TIME = ["auto", "ligado", "desligado"];

const home = () => process.env.MODO_DEUS_HOME || os.homedir();

// ---------- utilitários ----------
function git(dir, ...args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

// Roda um executável externo (claude, graphify, uv...). null se não existir ou falhar.
function rodar(bin, argv, cwd) {
  try {
    return execFileSync(bin, argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32", timeout: 600000 }).trim();
  } catch {
    return null;
  }
}
const existeBin = (bin) => rodar(bin, ["--version"]) !== null;

// ---------- graphify ----------
const GRAFO = "graphify-out";
const cmpVersao = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
function graphifyVersao() {
  if (process.env.MODO_DEUS_SEM_GRAPHIFY) return null; // testes simulam ausência
  const v = rodar("graphify", ["--version"]);
  return v?.match(/(\d+\.\d+\.\d+)/)?.[1] || null;
}
// Grafo velho: algum commit é mais novo que o graph.json.
function grafoDesatualizado(raiz) {
  const f = path.join(raiz, GRAFO, "graph.json");
  if (!fs.existsSync(f)) return null;
  const ultimo = Number(git(raiz, "log", "-1", "--format=%ct") || 0) * 1000;
  return fs.statSync(f).mtimeMs < ultimo;
}

class ErroUso extends Error {}

function args(argv) {
  const o = { comando: "instalar", caminho: process.cwd(), perfil: null, times: {}, dryRun: false, semGrafo: false };
  const resto = [...argv];
  while (resto.length) {
    const a = resto.shift();
    if (a === "doctor") o.comando = "doctor";
    else if (a === "dependencias") o.comando = "dependencias";
    else if (a === "--remover") o.comando = "remover";
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--sem-grafo") o.semGrafo = true;
    else if (a === "--perfil") o.perfil = resto.shift();
    else if (a === "--times") {
      for (const par of (resto.shift() || "").split(",").filter(Boolean)) {
        const [t, m] = par.split("=");
        if (!kit.agentes[t]?.sob_demanda) throw new ErroUso(`time sob demanda desconhecido: ${t}`);
        if (!MODOS_TIME.includes(m)) throw new ErroUso(`modo inválido para ${t}: ${m} (use ${MODOS_TIME.join("|")})`);
        o.times[t] = m;
      }
    } else if (a === "-h" || a === "--help") throw new ErroUso("");
    else if (a.startsWith("-")) throw new ErroUso(`opção desconhecida: ${a}`);
    else o.caminho = path.resolve(a);
  }
  if (o.perfil && !kit.perfis[o.perfil]) throw new ErroUso(`perfil inválido: ${o.perfil} (use ${Object.keys(kit.perfis).join("|")})`);
  return o;
}

function raizDoRepo(caminho) {
  const r = git(caminho, "rev-parse", "--show-toplevel");
  if (!r) throw new ErroUso(`${caminho} não é um repositório git`);
  return path.resolve(r);
}

const versionado = (raiz, rel) => !!git(raiz, "ls-files", "--", rel);

function arquivoExclude(raiz) {
  const comum = git(raiz, "rev-parse", "--git-common-dir");
  return path.join(path.resolve(raiz, comum), "info", "exclude");
}

// Existe algo no repositório que case com o padrão? Só o prefixo estático é conferido;
// padrões que começam com ** valem sempre.
function padraoExiste(raiz, padrao) {
  if (padrao.startsWith("**")) return true;
  const partes = padrao.split("/");
  const estaticas = [];
  for (const p of partes) {
    if (p === "**") return fs.existsSync(path.join(raiz, ...estaticas));
    if (p.includes("*")) {
      const re = new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
      const dir = path.join(raiz, ...estaticas);
      try { return fs.readdirSync(dir).some((n) => re.test(n)); } catch { return false; }
    }
    estaticas.push(p);
  }
  return fs.existsSync(path.join(raiz, ...estaticas));
}

// ---------- detecção do projeto ----------
function detectar(raiz) {
  const d = { stack: [], comandos: {}, territorios: {}, sobDemanda: {}, cypress: false, runner: null, manifestos: [] };
  const existe = (f) => fs.existsSync(path.join(raiz, f));
  let pkg = null;
  if (existe("package.json")) {
    d.manifestos.push("package.json");
    try { pkg = lerJson(path.join(raiz, "package.json")); } catch { /* manifesto quebrado: sem detecção */ }
  }
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const pm = existe("pnpm-lock.yaml") ? "pnpm" : existe("yarn.lock") ? "yarn" : existe("bun.lockb") || existe("bun.lock") ? "bun" : "npm";
    const conhecidas = ["typescript", "next", "react", "vue", "nuxt", "svelte", "@sveltejs/kit", "astro", "express", "fastify", "@nestjs/core", "prisma", "drizzle-orm", "@supabase/supabase-js", "tailwindcss", "vitest", "jest", "cypress", "@playwright/test", "react-native", "expo"];
    d.stack.push(`Node${pkg.engines?.node ? " " + pkg.engines.node : ""} (${pm})`);
    for (const n of conhecidas) if (deps[n]) d.stack.push(`${n} ${deps[n]}`);
    const s = pkg.scripts || {};
    const achar = (...nomes) => nomes.find((n) => s[n]);
    const rodar = (n) => (n ? `${pm} run ${n}` : null);
    d.comandos = {
      Instalar: `${pm} install`,
      "Rodar local": rodar(achar("dev", "start", "serve")),
      Testes: rodar(achar("test", "test:unit")),
      Lint: rodar(achar("lint")),
      Tipos: rodar(achar("typecheck", "type-check", "types", "tsc", "check-types")),
      Build: rodar(achar("build")),
      E2E: rodar(achar("test:e2e", "e2e", "cypress:run", "cy:run")),
    };
    d.cypress = !!deps.cypress;
    d.runner = deps.vitest ? "Vitest" : deps.jest ? "Jest" : null;
  }
  for (const [f, nome] of [["pyproject.toml", "Python"], ["requirements.txt", "Python"], ["go.mod", "Go"], ["Cargo.toml", "Rust"], ["pom.xml", "Java (Maven)"], ["build.gradle", "JVM (Gradle)"], ["pubspec.yaml", "Dart/Flutter"], ["composer.json", "PHP"], ["Gemfile", "Ruby"]]) {
    if (existe(f)) {
      d.manifestos.push(f);
      if (!d.stack.some((x) => x.startsWith(nome))) d.stack.push(nome);
    }
  }
  if (!d.runner && (existe("pytest.ini") || existe("conftest.py"))) d.runner = "pytest";
  d.cypress ||= fs.readdirSync(raiz).some((n) => /^cypress\.config\./.test(n));

  for (const [t, padroes] of Object.entries(kit.territorios)) {
    if (t.startsWith("$")) continue;
    d.territorios[t] = padroes.filter((p) => padraoExiste(raiz, p));
  }
  for (const [time, sinais] of Object.entries(kit.sinais_sob_demanda)) {
    d.sobDemanda[time] = sinais.some((s) => padraoExiste(raiz, s));
  }
  return d;
}

// ---------- REGRAS.md ----------
function renderRegras(raiz, d, times) {
  let t = fs.readFileSync(path.join(KIT, "modelos", "REGRAS.md"), "utf8");
  const nome = path.basename(raiz);
  const ph = "`<...>`";
  const bloco = {
    stack: d.stack.length
      ? d.stack.map((x) => `- ${x}`).join("\n") + `\n- Confirme versões em: ${d.manifestos.join(", ")}`
      : "- Linguagem e versão: <ex.: TypeScript 5.x, Node 22>\n- Framework: <ex.: Next.js 15>\n- Banco: <ex.: PostgreSQL via Supabase>\n- Confirme versões em: <package.json, pyproject.toml...>",
    comandos:
      "| Ação | Comando |\n|---|---|\n" +
      ["Instalar", "Rodar local", "Testes", "Lint", "Tipos", "Build", "E2E"].map((a) => `| ${a} | ${d.comandos[a] ? "`" + d.comandos[a] + "`" : ph} |`).join("\n"),
    times:
      "| Time | Modo | Detectado no projeto |\n|---|---|---|\n" +
      Object.keys(kit.sinais_sob_demanda).map((tm) => `| ${tm} | ${times[tm] || "auto"} | ${d.sobDemanda[tm] ? "sim" : "não"} |`).join("\n"),
    territorios: Object.entries(d.territorios)
      .map(([tm, ps]) => {
        const time = Object.keys(kit.sinais_sob_demanda).find((t) => kit.agentes[t].territorio === tm);
        if (time && !d.sobDemanda[time] && (times[time] || "auto") === "auto") return `- **${tm}**: time ${time} não detectado neste projeto`;
        return `- **${tm}**: ${ps.length ? ps.map((p) => "`" + p + "`").join(", ") : "<nenhuma pasta detectada: preencha ou escreva <a definir>>"}`;
      })
      .join("\n"),
    testes: [
      `- Runner de unidade/integração: ${d.runner || "<runner do projeto>"}`,
      `- E2E e componente: Cypress, ${d.cypress ? "já configurado" : "ainda não configurado; o Maestro oferece configurar na primeira tarefa de E2E e só instala com sua confirmação"}`,
      "- Mobile nativo (se houver): <Detox, Maestro ou <a definir>>",
    ].join("\n"),
  };
  t = t.replace("<nome>", nome);
  for (const [k, v] of Object.entries(bloco)) t = t.replace(`<!-- modo-deus:${k} -->`, v);
  return t;
}

const camposAbertos = (texto) => texto.replace(/<a definir>/g, "").replace(/<!--[\s\S]*?-->/g, "").match(/<[A-Za-zÀ-ÿ][^>\n]*>/g) || [];

// ---------- settings.local.json ----------
function lerSettings(raiz) {
  const f = path.join(raiz, SETTINGS);
  if (!fs.existsSync(f)) return { existe: false, dados: {} };
  try {
    return { existe: true, dados: JSON.parse(fs.readFileSync(f, "utf8")) };
  } catch {
    throw new ErroUso(`${SETTINGS} não é JSON válido; não alterei nada`);
  }
}

// ---------- exclude ----------
function blocoExclude(texto, entradas) {
  const linhas = texto.split(/\r?\n/);
  const fora = [];
  let dentro = false;
  for (const l of linhas) {
    if (l === MARCA_INI) dentro = true;
    else if (l === MARCA_FIM) dentro = false;
    else if (!dentro) fora.push(l);
  }
  while (fora.length && fora[fora.length - 1] === "") fora.pop();
  const novo = entradas ? [...fora, MARCA_INI, ...entradas, MARCA_FIM] : fora;
  return novo.join("\n") + "\n";
}

// ---------- ações ----------
function executor(dryRun, log) {
  return (descricao, fazer) => {
    log(dryRun ? `[simulação] ${descricao}` : descricao);
    if (!dryRun) fazer();
  };
}

export function instalar(caminho, { perfil = null, times = {}, dryRun = false, semGrafo = false, log = console.log } = {}) {
  const raiz = raizDoRepo(caminho);
  const pasta = path.join(raiz, PASTA);
  if (versionado(raiz, PASTA)) throw new ErroUso(`${PASTA} já é versionado pelo projeto; não vou sobrescrever`);
  const fazer = executor(dryRun, log);
  const manifestoF = path.join(pasta, "instalados.json");
  const anterior = fs.existsSync(manifestoF) ? lerJson(manifestoF) : null;
  const configF = path.join(pasta, "config.json");
  const configAnt = fs.existsSync(configF) ? lerJson(configF) : {};
  const config = {
    versao_kit: kit.versao,
    perfil: perfil || configAnt.perfil || kit.perfil_padrao,
    times: { ...Object.fromEntries(Object.keys(kit.sinais_sob_demanda).map((t) => [t, "auto"])), ...configAnt.times, ...times },
  };
  const d = detectar(raiz);

  fazer(`pasta    ${PASTA}/ (telemetria/, retro/)`, () => {
    for (const p of ["telemetria", "retro"]) fs.mkdirSync(path.join(pasta, p), { recursive: true });
  });

  const regrasF = path.join(pasta, "REGRAS.md");
  if (fs.existsSync(regrasF)) log("regras   REGRAS.md já existe, mantido");
  else {
    const texto = renderRegras(raiz, d, config.times);
    const n = camposAbertos(texto).length;
    fazer(`regras   REGRAS.md criado com o que foi detectado (${n} campo(s) <...> para preencher)`, () => fs.writeFileSync(regrasF, texto));
  }

  fazer(`config   perfil ${config.perfil}; times sob demanda: ${Object.entries(config.times).map(([t, m]) => `${t}=${m}${m === "auto" ? (d.sobDemanda[t] ? " (detectado)" : " (não detectado)") : ""}`).join(", ")}`, () =>
    fs.writeFileSync(configF, JSON.stringify(config, null, 2) + "\n"),
  );

  // deny-list: só registra o que o kit acrescentou, para remover depois sem tocar no que é do usuário
  let denyNovos = anterior?.deny || [];
  let criouSettings = anterior?.criou_settings || false;
  if (versionado(raiz, SETTINGS)) {
    log(`AVISO    ${SETTINGS} é versionado pelo projeto; deny-list não aplicado`);
  } else {
    const s = lerSettings(raiz);
    const deny = lerJson(path.join(KIT, "modelos", "settings.deny.json")).deny;
    const atual = s.dados.permissions?.deny || [];
    const faltam = deny.filter((r) => !atual.includes(r));
    denyNovos = [...new Set([...denyNovos.filter((r) => atual.includes(r)), ...faltam])];
    criouSettings ||= !s.existe;
    if (faltam.length) {
      fazer(`settings ${SETTINGS}: ${faltam.length} regra(s) de deny acrescentada(s)`, () => {
        s.dados.permissions = { ...s.dados.permissions, deny: [...atual, ...faltam] };
        fs.mkdirSync(path.dirname(path.join(raiz, SETTINGS)), { recursive: true });
        fs.writeFileSync(path.join(raiz, SETTINGS), JSON.stringify(s.dados, null, 2) + "\n");
      });
    } else log(`settings ${SETTINGS}: deny-list já completo`);
  }

  // Grafo do projeto: base de mapeamento para os agentes. Só código (AST), sem LLM e sem custo de tokens.
  // Os hooks do próprio graphify não são usados: eles alteram o .gitattributes, que é versionado.
  const grafoVersionado = versionado(raiz, GRAFO);
  let criouGrafo = anterior?.criou_grafo || false;
  if (semGrafo) log("grafo    pulado (--sem-grafo)");
  else if (grafoVersionado) log(`grafo    ${GRAFO}/ é versionado pelo projeto; mantido como está`);
  else {
    const v = graphifyVersao();
    if (!v) log("AVISO    graphify não encontrado: rode `node instalar.mjs dependencias` e instale de novo");
    else if (cmpVersao(v, kit.dependencias.graphify.minimo) < 0) log(`AVISO    graphify ${v} é mais antigo que ${kit.dependencias.graphify.minimo}: atualize e instale de novo`);
    else {
      const novo = !fs.existsSync(path.join(raiz, GRAFO, "graph.json"));
      fazer(`grafo    ${GRAFO}/ ${novo ? "criado" : "atualizado"} com graphify ${v} (código por AST, sem LLM)`, () => {
        if (rodar("graphify", ["update", "."], raiz) === null) log("AVISO    graphify update falhou; rode `graphify update .` no projeto para ver o erro");
        criouGrafo ||= novo && fs.existsSync(path.join(raiz, GRAFO, "graph.json"));
      });
    }
  }

  const exc = arquivoExclude(raiz);
  fazer(`exclude  ${path.relative(raiz, exc).replace(/\\/g, "/")} (vale também para worktrees)`, () => {
    fs.mkdirSync(path.dirname(exc), { recursive: true });
    const atual = fs.existsSync(exc) ? fs.readFileSync(exc, "utf8") : "";
    fs.writeFileSync(exc, blocoExclude(atual, [`${PASTA}/`, SETTINGS, ...(grafoVersionado ? [] : [`${GRAFO}/`])]));
  });

  const manifesto = { versao_kit: kit.versao, deny: denyNovos, criou_settings: criouSettings, criou_grafo: criouGrafo };
  fazer("manifesto instalados.json", () => fs.writeFileSync(manifestoF, JSON.stringify(manifesto, null, 2) + "\n"));

  log("");
  log(`${dryRun ? "Simulação concluída" : "Pronto"} em ${raiz} (perfil ${config.perfil}).`);
  if (!d.cypress) log("Cypress não encontrado: o Maestro vai oferecer configurar quando houver tarefa de E2E.");
  log("Próximo passo: revisar .claude/modo-deus/REGRAS.md e rodar `node instalar.mjs doctor`.");
  return { raiz, config, deteccao: d };
}

export function remover(caminho, { dryRun = false, log = console.log } = {}) {
  const raiz = raizDoRepo(caminho);
  const pasta = path.join(raiz, PASTA);
  const fazer = executor(dryRun, log);
  const manifestoF = path.join(pasta, "instalados.json");
  if (!fs.existsSync(manifestoF)) throw new ErroUso(`modo-deus não está instalado em ${raiz} (sem ${PASTA}/instalados.json)`);
  if (versionado(raiz, PASTA)) throw new ErroUso(`${PASTA} é versionado pelo projeto; remova pelo git`);
  const manifesto = lerJson(manifestoF);

  // Guarda o que é do usuário (REGRAS.md, telemetria, retro) fora do repositório.
  const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(home(), ".claude", "modo-deus", "backups", `${path.basename(raiz)}-${carimbo}`);
  fazer(`backup   ${backup}`, () => fs.cpSync(pasta, backup, { recursive: true }));

  if (!versionado(raiz, SETTINGS) && fs.existsSync(path.join(raiz, SETTINGS))) {
    const s = lerSettings(raiz);
    fazer(`settings ${SETTINGS}: ${manifesto.deny.length} regra(s) do kit removida(s)`, () => {
      const deny = (s.dados.permissions?.deny || []).filter((r) => !manifesto.deny.includes(r));
      if (deny.length) s.dados.permissions.deny = deny;
      else if (s.dados.permissions) delete s.dados.permissions.deny;
      if (s.dados.permissions && !Object.keys(s.dados.permissions).length) delete s.dados.permissions;
      if (manifesto.criou_settings && !Object.keys(s.dados).length) fs.rmSync(path.join(raiz, SETTINGS));
      else fs.writeFileSync(path.join(raiz, SETTINGS), JSON.stringify(s.dados, null, 2) + "\n");
    });
  }

  fazer(`pasta    ${PASTA}/ removida`, () => fs.rmSync(pasta, { recursive: true, force: true }));
  if (manifesto.criou_grafo && !versionado(raiz, GRAFO) && fs.existsSync(path.join(raiz, GRAFO))) {
    fazer(`grafo    ${GRAFO}/ removido (criado pelo kit; recriável com graphify update .)`, () => fs.rmSync(path.join(raiz, GRAFO), { recursive: true, force: true }));
  }

  const exc = arquivoExclude(raiz);
  if (fs.existsSync(exc)) fazer("exclude  bloco do modo-deus removido", () => fs.writeFileSync(exc, blocoExclude(fs.readFileSync(exc, "utf8"), null)));

  log("");
  log(`${dryRun ? "Simulação concluída" : "Removido"} de ${raiz}. Backup em ${backup}`);
  return { raiz, backup };
}

export function doctor(caminho, { log = console.log } = {}) {
  const res = [];
  const ok = (m) => res.push(["ok", m]);
  const aviso = (m) => res.push(["aviso", m]);
  const erro = (m) => res.push(["ERRO", m]);

  const nodeMaior = Number(process.versions.node.split(".")[0]);
  nodeMaior >= kit.node_minimo ? ok(`node ${process.versions.node}`) : erro(`node ${process.versions.node}; precisa de ${kit.node_minimo}+`);

  const plugF = path.join(home(), ".claude", "plugins", "installed_plugins.json");
  let plugins = [];
  try { plugins = Object.keys(lerJson(plugF).plugins || {}); } catch { /* sem plugins */ }
  const temPlugin = (id) => plugins.some((p) => p === id || p.startsWith(id.split("@")[0] + "@"));
  temPlugin("modo-deus@kit-agentes") ? ok("plugin modo-deus instalado") : aviso("plugin modo-deus não instalado (claude plugin marketplace add <kit> && claude plugin install modo-deus@kit-agentes)");
  for (const dep of kit.dependencias.plugins) temPlugin(dep) ? ok(`plugin ${dep.split("@")[0]}`) : erro(`plugin ${dep} ausente (node instalar.mjs dependencias)`);

  const gv = graphifyVersao();
  const gmin = kit.dependencias.graphify.minimo;
  if (!gv) erro("graphify não encontrado (node instalar.mjs dependencias)");
  else if (cmpVersao(gv, gmin) < 0) erro(`graphify ${gv}; precisa de ${gmin}+`);
  else ok(`graphify ${gv}`);
  fs.existsSync(path.join(home(), ".claude", "skills", kit.dependencias.graphify.skill, "SKILL.md")) ? ok("skill graphify") : erro("skill graphify ausente (graphify install --platform claude)");

  const globais = path.join(home(), ".claude", "skills");
  const dup = Object.keys(kit.skills.incluidas).filter((n) => fs.existsSync(path.join(globais, n)));
  if (dup.length && temPlugin("modo-deus@kit-agentes")) aviso(`${dup.length} skill(s) do kit também em ~/.claude/skills (sobra da v1): ${dup.join(", ")}`);

  let raiz = null;
  try { raiz = raizDoRepo(caminho); } catch { erro(`${caminho} não é um repositório git`); }
  if (raiz) {
    const pasta = path.join(raiz, PASTA);
    if (!fs.existsSync(path.join(pasta, "instalados.json"))) erro("kit não instalado neste projeto (node instalar.mjs <caminho>)");
    else {
      let config = {};
      try { config = lerJson(path.join(pasta, "config.json")); } catch { erro("config.json ausente ou inválido"); }
      if (config.perfil) kit.perfis[config.perfil] ? ok(`perfil ${config.perfil}`) : erro(`perfil desconhecido: ${config.perfil}`);
      if (config.versao_kit && config.versao_kit !== kit.versao) aviso(`instalado com o kit ${config.versao_kit}; atual ${kit.versao}: rode o instalador de novo`);

      const regrasF = path.join(pasta, "REGRAS.md");
      if (!fs.existsSync(regrasF)) erro("REGRAS.md ausente");
      else {
        const abertos = camposAbertos(fs.readFileSync(regrasF, "utf8"));
        abertos.length ? aviso(`REGRAS.md com ${abertos.length} campo(s) <...> sem preencher`) : ok("REGRAS.md preenchido");
      }

      let s = null;
      try { s = lerSettings(raiz); } catch (e) { erro(e.message); }
      if (s) {
        const deny = lerJson(path.join(KIT, "modelos", "settings.deny.json")).deny;
        const faltam = deny.filter((r) => !(s.dados.permissions?.deny || []).includes(r));
        faltam.length ? erro(`deny-list incompleto: faltam ${faltam.length} regra(s)`) : ok("deny-list aplicado");
      }

      const exc = arquivoExclude(raiz);
      fs.existsSync(exc) && fs.readFileSync(exc, "utf8").includes(MARCA_INI) ? ok("exclude configurado") : erro("bloco do modo-deus ausente no .git/info/exclude");

      const sujos = (git(raiz, "status", "--porcelain", "--", ".claude") || "").split("\n").filter((l) => l.includes(PASTA) || l.includes(SETTINGS));
      sujos.length ? erro(`arquivos do kit aparecem no git status: ${sujos.join("; ")}`) : ok("git status limpo dos arquivos do kit");

      detectar(raiz).cypress ? ok("Cypress configurado") : aviso("Cypress não configurado (o Maestro oferece na primeira tarefa de E2E)");

      const velho = grafoDesatualizado(raiz);
      if (velho === null) aviso(`grafo ausente: rode \`graphify update .\` no projeto (ou instale de novo)`);
      else if (velho) aviso("grafo mais antigo que o último commit: rode `graphify update .` (sem LLM, segundos)");
      else ok("grafo do projeto atualizado");
    }
  }

  for (const [nivel, m] of res) log(`${nivel.padEnd(6)} ${m}`);
  const erros = res.filter(([n]) => n === "ERRO").length;
  log("");
  log(erros ? `${erros} erro(s).` : "Nenhum erro.");
  return { erros, resultados: res };
}

// Instala o que falta: marketplaces, plugins obrigatórios e graphify. Nunca o que está em dependencias.fora.
export function planoDependencias({ instalados = null, marketplaces = null, graphify = graphifyVersao(), skillGraphify = null, ferramentas = null } = {}) {
  const lerChaves = (f, sub) => { try { const j = lerJson(path.join(home(), ".claude", "plugins", f)); return Object.keys(sub ? j[sub] || {} : j); } catch { return []; } };
  instalados ??= lerChaves("installed_plugins.json", "plugins");
  marketplaces ??= lerChaves("known_marketplaces.json");
  skillGraphify ??= fs.existsSync(path.join(home(), ".claude", "skills", kit.dependencias.graphify.skill, "SKILL.md"));
  ferramentas ??= { uv: existeBin("uv"), pipx: existeBin("pipx") };
  const passos = [];
  for (const [nome, repo] of Object.entries(kit.dependencias.marketplaces)) {
    if (!marketplaces.includes(nome)) passos.push({ descricao: `marketplace ${nome}`, bin: "claude", args: ["plugin", "marketplace", "add", repo] });
  }
  for (const id of kit.dependencias.plugins) {
    if (Object.keys(kit.dependencias.fora).some((f) => id.startsWith(f + "@"))) continue;
    if (!instalados.includes(id)) passos.push({ descricao: `plugin ${id}`, bin: "claude", args: ["plugin", "install", id] });
  }
  const pacote = kit.dependencias.graphify.pacote;
  if (!graphify || cmpVersao(graphify, kit.dependencias.graphify.minimo) < 0) {
    const verbo = graphify ? "upgrade" : "install";
    passos.push(
      ferramentas.uv ? { descricao: `graphify (${pacote}) via uv`, bin: "uv", args: ["tool", verbo === "install" ? "install" : "upgrade", pacote] }
      : ferramentas.pipx ? { descricao: `graphify (${pacote}) via pipx`, bin: "pipx", args: [verbo, pacote] }
      : { descricao: `graphify (${pacote}) via pip`, bin: "python", args: ["-m", "pip", "install", "--user", "--upgrade", pacote] },
    );
  }
  if (!skillGraphify) passos.push({ descricao: "skill graphify no Claude Code", bin: "graphify", args: ["install", "--platform", "claude"] });
  return passos;
}

export function dependencias({ dryRun = false, log = console.log } = {}) {
  const passos = planoDependencias();
  if (!passos.length) {
    log("Todas as dependências já estão instaladas.");
    return { falhas: 0, passos };
  }
  let falhas = 0;
  for (const p of passos) {
    const linha = `${p.bin} ${p.args.join(" ")}`;
    if (dryRun) { log(`[simulação] ${p.descricao}: ${linha}`); continue; }
    log(`...      ${p.descricao}: ${linha}`);
    const saida = rodar(p.bin, p.args);
    if (saida === null) { falhas++; log(`FALHOU   ${p.descricao}`); }
    else log(`ok       ${p.descricao}`);
  }
  log("");
  log(dryRun ? `${passos.length} passo(s) a executar.` : falhas ? `${falhas} falha(s).` : "Dependências instaladas. Abra uma sessão nova do Claude Code.");
  log(`Fora do kit, de propósito: ${Object.entries(kit.dependencias.fora).map(([n, m]) => `${n} (${m})`).join("; ")}.`);
  return { falhas, passos };
}

// ---------- CLI ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = args(process.argv.slice(2));
    if (o.comando === "doctor") process.exitCode = doctor(o.caminho).erros ? 1 : 0;
    else if (o.comando === "dependencias") process.exitCode = dependencias(o).falhas ? 1 : 0;
    else if (o.comando === "remover") remover(o.caminho, o);
    else instalar(o.caminho, o);
  } catch (e) {
    if (!(e instanceof ErroUso)) throw e;
    if (e.message) console.error(`erro: ${e.message}`);
    console.error("uso: node instalar.mjs [caminho] [--perfil leve|estrito|deus] [--times dev-mobile=ligado,...] [--sem-grafo] [--dry-run]\n     node instalar.mjs --remover [caminho] [--dry-run]\n     node instalar.mjs doctor [caminho]\n     node instalar.mjs dependencias [--dry-run]");
    process.exitCode = 1;
  }
}
