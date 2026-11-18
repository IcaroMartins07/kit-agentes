#!/usr/bin/env node
// Parte por projeto do modo-deus. Skills, agentes, comandos e hooks vêm do plugin;
// aqui ficam REGRAS.md, config do perfil, deny-list e exclude, tudo fora do git.
//
// Uso:
//   node instalar.mjs [caminho] [--perfil leve|estrito|deus] [--times dev-mobile=ligado,...] [--dry-run]
//   node instalar.mjs [caminho] --statusline       também grava a status line do kit no .claude/settings.local.json
//   node instalar.mjs --remover [caminho] [--dry-run]
//   node instalar.mjs doctor [caminho]
//   node instalar.mjs dependencias [caminho] [--escopo local|user] [--dry-run]     plugins obrigatórios e graphify (nunca o caveman)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { comandosDe, camposAbertos } from "./hooks/src/comum.mjs";

const KIT = path.dirname(fileURLToPath(import.meta.url));
const lerJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
// Os conectores (plugins, marketplaces, graphify) ficam em hooks/conectores.json; o resto em kit.json.
const kit = { ...lerJson(path.join(KIT, "kit.json")), dependencias: lerJson(path.join(KIT, "hooks", "conectores.json")) };
const MARCA_INI = "# modo-deus (kit local)";
const MARCA_FIM = "# /modo-deus";
const PASTA = ".modo-deus";
const PASTA_ANTIGA = ".claude/modo-deus";
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
  const o = { comando: "instalar", caminho: process.cwd(), perfil: null, times: {}, dryRun: false, semGrafo: false, statusline: false };
  const resto = [...argv];
  while (resto.length) {
    const a = resto.shift();
    if (a === "doctor") o.comando = "doctor";
    else if (a === "dependencias") o.comando = "dependencias";
    else if (a === "--remover") o.comando = "remover";
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--sem-grafo") o.semGrafo = true;
    else if (a === "--escopo") {
      o.escopo = resto.shift();
      if (!["local", "user"].includes(o.escopo)) throw new ErroUso("--escopo precisa ser local ou user");
    }
    else if (a === "--statusline") o.statusline = true;
    else if (a === "--perfil") {
      o.perfil = resto.shift();
      if (!o.perfil || o.perfil.startsWith("-")) throw new ErroUso("--perfil precisa de um valor");
    }
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

// Condição extra de um sinal ou padrão (kit.json > condicoes): outro arquivo existir,
// ou um JSON ter certa chave. Evita falso positivo (app.json do Heroku, lib/ de Node).
function condicaoOk(raiz, c) {
  if (!c) return true;
  if (c.existe && !c.existe.some((p) => padraoExiste(raiz, p))) return false;
  if (c.json_tem) {
    try {
      const j = lerJson(path.join(raiz, c.json_tem.arquivo));
      if (!c.json_tem.chaves.some((k) => k in j)) return false;
    } catch { return false; }
  }
  return true;
}

// ---------- detecção do projeto ----------
// Serviços externos reconhecidos pela dependência (prefixo de pacote vale para escopos, ex.: @aws-sdk/...).
const INTEGRACOES_NODE = [
  ["stripe", "Stripe (pagamento)"], ["@stripe", "Stripe (pagamento)"], ["@aws-sdk", "AWS SDK"], ["aws-sdk", "AWS SDK"],
  ["firebase", "Firebase"], ["firebase-admin", "Firebase Admin"], ["@supabase/supabase-js", "Supabase"], ["openai", "OpenAI API"],
  ["@anthropic-ai/sdk", "Anthropic API"], ["@sentry", "Sentry (erros)"], ["next-auth", "NextAuth (autenticação)"], ["@auth/core", "Auth.js (autenticação)"],
  ["@clerk", "Clerk (autenticação)"], ["resend", "Resend (e-mail)"], ["nodemailer", "SMTP via Nodemailer"], ["@sendgrid", "SendGrid (e-mail)"],
  ["twilio", "Twilio (SMS)"], ["redis", "Redis"], ["ioredis", "Redis"], ["bullmq", "BullMQ (fila)"], ["kafkajs", "Kafka"], ["amqplib", "RabbitMQ"],
  ["mongoose", "MongoDB"], ["mongodb", "MongoDB"], ["pg", "PostgreSQL"], ["mysql2", "MySQL"], ["@prisma/client", "Prisma (banco)"],
  ["@google-cloud", "Google Cloud"], ["googleapis", "APIs do Google"], ["posthog-js", "PostHog (analytics)"], ["@vercel/analytics", "Vercel Analytics"],
]
const INTEGRACOES_PY = [
  ["boto3", "AWS SDK"], ["stripe", "Stripe (pagamento)"], ["openai", "OpenAI API"], ["anthropic", "Anthropic API"], ["sentry-sdk", "Sentry (erros)"],
  ["redis", "Redis"], ["celery", "Celery (fila)"], ["psycopg", "PostgreSQL"], ["psycopg2", "PostgreSQL"], ["sqlalchemy", "SQLAlchemy (banco)"],
  ["firebase-admin", "Firebase Admin"], ["supabase", "Supabase"], ["pymongo", "MongoDB"], ["requests", "HTTP (requests)"], ["httpx", "HTTP (httpx)"],
]
// Configs que dizem o padrão de código do projeto.
const CONFIGS = [
  [["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml"], "Lint: ESLint"],
  [[".prettierrc", ".prettierrc.json", ".prettierrc.js", ".prettierrc.cjs", ".prettierrc.yml", "prettier.config.js", "prettier.config.mjs"], "Formatação: Prettier"],
  [["biome.json", "biome.jsonc"], "Lint e formatação: Biome"],
  [[".editorconfig"], "Editor: EditorConfig"],
  [["ruff.toml", ".ruff.toml"], "Lint e formatação: Ruff"],
  [[".flake8"], "Lint: flake8"],
  [[".golangci.yml", ".golangci.yaml"], "Lint: golangci-lint"],
  [["rustfmt.toml", ".rustfmt.toml"], "Formatação: rustfmt"],
  [["analysis_options.yaml"], "Lint: Dart analyzer"],
  [[".stylelintrc", ".stylelintrc.json", "stylelint.config.js"], "Lint de CSS: Stylelint"],
]
// Comandos que muitos projetos não têm: sem detecção, viram pendência assumida, não aviso.
const OPCIONAIS = new Set(["Desempenho", "Segredos"])
const existeAlgum = (raiz, nomes) => nomes.some((n) => fs.existsSync(path.join(raiz, n)))

function detectar(raiz) {
  const d = { stack: [], comandos: {}, territorios: {}, sobDemanda: {}, cypress: false, runner: null, manifestos: [], convencoes: [], integracoes: [] };
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
    // o "test" que o npm init cria só falha; não é comando de teste
    const placeholder = (cmd) => /no test specified/i.test(cmd);
    const achar = (...nomes) => nomes.find((n) => s[n] && !placeholder(s[n]));
    const rodar = (n) => (n ? `${pm} run ${n}` : null);
    d.comandos = {
      Instalar: `${pm} install`,
      "Rodar local": rodar(achar("dev", "start", "serve")),
      Testes: rodar(achar("test", "test:unit")),
      Lint: rodar(achar("lint")),
      Tipos: rodar(achar("typecheck", "type-check", "types", "tsc", "check-types")),
      Build: rodar(achar("build")),
      E2E: rodar(achar("test:e2e", "e2e", "cypress:run", "cy:run")),
      Desempenho: rodar(achar("perf", "bench", "benchmark", "lighthouse", "test:perf")),
      Segredos: rodar(achar("secrets", "gitleaks", "scan:secrets")),
      Auditoria: s.audit ? rodar("audit") : pm === "bun" ? null : pm === "yarn" ? "yarn npm audit" : `${pm} audit`,
    };
    for (const [dep, nome] of INTEGRACOES_NODE) if (Object.keys(deps).some((k) => k === dep || k.startsWith(dep + "/"))) d.integracoes.push(nome);
    if (deps.husky || deps["lint-staged"]) d.convencoes.push("Hooks de commit: " + ["husky", "lint-staged"].filter((n) => deps[n]).join(" + "));
    if (deps["@commitlint/cli"] || existeAlgum(raiz, ["commitlint.config.js", "commitlint.config.cjs", "commitlint.config.mjs", "commitlint.config.ts", ".commitlintrc", ".commitlintrc.json"])) d.convencoes.push("Commits: Conventional Commits (commitlint)");
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
  // Python: integrações e auditoria pelo texto dos manifestos.
  const py = ["pyproject.toml", "requirements.txt"].filter(existe).map((f) => fs.readFileSync(path.join(raiz, f), "utf8").toLowerCase()).join("\n");
  if (py) {
    for (const [dep, nome] of INTEGRACOES_PY) if (new RegExp(`(^|[\\s"'])${dep}([\\s=<>~\\[;"']|$)`, "m").test(py)) d.integracoes.push(nome);
    if (/pip-audit/.test(py)) d.comandos.Auditoria ||= "pip-audit";
    if (/\[tool\.ruff/.test(py)) d.convencoes.push("Lint e formatação: Ruff (pyproject.toml)");
    if (/\[tool\.black/.test(py)) d.convencoes.push("Formatação: Black (pyproject.toml)");
    if (/\[tool\.mypy/.test(py)) d.convencoes.push("Tipos: mypy (pyproject.toml)");
  }
  for (const [nomes, texto] of CONFIGS) {
    const achado = nomes.find((n) => existe(n));
    if (achado) d.convencoes.push(`${texto} (${achado})`);
  }
  if (pkg?.prettier && !d.convencoes.some((c) => c.startsWith("Formatação: Prettier"))) d.convencoes.push("Formatação: Prettier (package.json)");
  try {
    const ts = fs.readFileSync(path.join(raiz, "tsconfig.json"), "utf8");
    if (/"strict"\s*:\s*true/.test(ts)) d.convencoes.push("TypeScript em modo strict (tsconfig.json)");
  } catch { /* sem tsconfig */ }
  // Variáveis de ambiente: só os nomes do .env.example (nunca valores, nunca o .env de verdade).
  for (const f of [".env.example", ".env.sample", ".env.template"]) {
    if (!existe(f)) continue;
    const nomes = fs.readFileSync(path.join(raiz, f), "utf8").split(/\r?\n/).map((l) => /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(l)?.[1]).filter(Boolean);
    if (nomes.length) d.integracoes.push(`Variáveis de ambiente (${f}): ${nomes.slice(0, 30).map((n) => "`" + n + "`").join(", ")}${nomes.length > 30 ? "…" : ""}`);
    break;
  }
  d.integracoes = [...new Set(d.integracoes)];
  d.cypress ||= fs.readdirSync(raiz).some((n) => /^cypress\.config\./.test(n));

  for (const [t, padroes] of Object.entries(kit.territorios)) {
    if (t.startsWith("$")) continue;
    d.territorios[t] = padroes.filter((p) => padraoExiste(raiz, p) && condicaoOk(raiz, kit.condicoes?.[p]));
  }
  for (const [time, sinais] of Object.entries(kit.sinais_sob_demanda)) {
    d.sobDemanda[time] = sinais.some((s) => padraoExiste(raiz, s) && condicaoOk(raiz, kit.condicoes?.[s]));
  }
  return d;
}

// ---------- REGRAS.md ----------
function renderRegras(raiz, d, times) {
  let t = fs.readFileSync(path.join(KIT, "docs", "modelos", "REGRAS.md"), "utf8");
  const nome = path.basename(raiz);
  const ph = "`<...>`";
  const bloco = {
    stack: d.stack.length
      ? d.stack.map((x) => `- ${x}`).join("\n") + `\n- Confirme versões em: ${d.manifestos.join(", ")}`
      : "- Linguagem e versão: <ex.: TypeScript 5.x, Node 22>\n- Framework: <ex.: Next.js 15>\n- Banco: <ex.: PostgreSQL via Supabase>\n- Confirme versões em: <package.json, pyproject.toml...>",
    comandos:
      "| Ação | Comando |\n|---|---|\n" +
      ["Instalar", "Rodar local", "Testes", "Lint", "Tipos", "Build", "E2E", "Auditoria", "Desempenho", "Segredos"].map((a) => `| ${a} | ${d.comandos[a] ? "`" + d.comandos[a] + "`" : OPCIONAIS.has(a) ? "<a definir>" : ph} |`).join("\n"),
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
    convencoes: d.convencoes.length ? d.convencoes.map((x) => `- ${x}`).join("\n") : "- Nenhuma config de lint ou formatação detectada: <ferramentas e regras de estilo, ou <a definir>>",
    integracoes: d.integracoes.length ? d.integracoes.map((x) => `- ${x}`).join("\n") + "\n- Confirme e complete: <serviços sem SDK, como APIs chamadas por HTTP; ou <a definir>>" : "- Nenhum SDK de serviço externo detectado: <APIs, filas, pagamento, e-mail; ou <a definir>>",
    testes: [
      `- Runner de unidade/integração: ${d.runner || "<runner do projeto>"}`,
      `- E2E e componente: Cypress, ${d.cypress ? "já configurado" : "ainda não configurado; o Maestro oferece configurar na primeira tarefa de E2E e só instala com sua confirmação"}`,
      "- Mobile nativo (se houver): <Detox, Maestro ou <a definir>>",
    ].join("\n"),
  };
  t = t.replace("<nome>", () => nome);
  for (const [k, v] of Object.entries(bloco)) t = t.replace(`<!-- modo-deus:${k} -->`, () => v);
  return t;
}


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

// ---------- status line ----------
export const comandoStatusline = () => `node "${path.join(KIT, "hooks", "ferramentas", "statusline.mjs").replace(/\\/g, "/")}"`;

// ---------- allowlist ----------
// Comandos do REGRAS.md e consultas que só leem: liberados sem pergunta. A cerca (V9) continua valendo.
const ALLOW_FIXO = [
  "Bash(graphify query:*)", "Bash(graphify explain:*)", "Bash(graphify path:*)", "Bash(graphify affected:*)",
  "Bash(graphify god-nodes:*)", "Bash(graphify update:*)",
  "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)", "Bash(git branch --show-current)",
];
export function allowlist(regrasTexto) {
  const regras = [];
  for (const [acao, c] of Object.entries(comandosDe(regrasTexto || ""))) {
    if (/[;&|><`$]/.test(c)) continue; // nada composto
    // Instalar só na forma exata: `npm install` sem argumento instala o lockfile; com argumento
    // traria dependência nova, que pede aprovação do usuário.
    regras.push(acao === "Instalar" ? `Bash(${c})` : `Bash(${c}:*)`);
  }
  return [...new Set([...regras, ...ALLOW_FIXO])];
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

export function instalar(caminho, { perfil = null, times = {}, dryRun = false, semGrafo = false, statusline = false, log = console.log } = {}) {
  const raiz = raizDoRepo(caminho);
  const pasta = path.join(raiz, PASTA);
  if (versionado(raiz, PASTA)) throw new ErroUso(`${PASTA} já é versionado pelo projeto; não vou sobrescrever`);
  // Até a 0.1.0 os dados ficavam em .claude/modo-deus/, que o Claude Code trata como arquivo sensível
  // (pede aprovação a cada escrita do Maestro). Move para .modo-deus/ na primeira reinstalação.
  const antiga = path.join(raiz, PASTA_ANTIGA);
  if (fs.existsSync(antiga) && !fs.existsSync(pasta) && !versionado(raiz, PASTA_ANTIGA)) {
    executor(dryRun, log)(`migra    ${PASTA_ANTIGA}/ → ${PASTA}/`, () => fs.renameSync(antiga, pasta));
  }
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
  let regrasTexto;
  if (fs.existsSync(regrasF)) {
    regrasTexto = fs.readFileSync(regrasF, "utf8");
    log("regras   REGRAS.md já existe, mantido");
  } else {
    const texto = (regrasTexto = renderRegras(raiz, d, config.times));
    const n = camposAbertos(texto).length;
    fazer(`regras   REGRAS.md criado com o que foi detectado (${n} campo(s) <...> para preencher)`, () => fs.writeFileSync(regrasF, texto));
  }

  fazer(`config   perfil ${config.perfil}; times sob demanda: ${Object.entries(config.times).map(([t, m]) => `${t}=${m}${m === "auto" ? (d.sobDemanda[t] ? " (detectado)" : " (não detectado)") : ""}`).join(", ")}`, () =>
    fs.writeFileSync(configF, JSON.stringify(config, null, 2) + "\n"),
  );

  // Permissões: deny-list fixo e allowlist (comandos do REGRAS.md + consultas ao grafo e ao git).
  // Só registra o que o kit acrescentou, para remover depois sem tocar no que é do usuário.
  const registro = { deny: anterior?.deny || [], allow: anterior?.allow || [], statusline: anterior?.statusline || null };
  let criouSettings = anterior?.criou_settings || false;
  if (versionado(raiz, SETTINGS)) {
    log(`AVISO    ${SETTINGS} é versionado pelo projeto; deny-list e allowlist não aplicados${statusline ? " (nem a status line)" : ""}`);
  } else {
    const s = lerSettings(raiz);
    criouSettings ||= !s.existe;
    const desejado = { deny: lerJson(path.join(KIT, "hooks", "settings.deny.json")).deny, allow: allowlist(regrasTexto) };
    const mudancas = [];
    for (const chave of ["deny", "allow"]) {
      const atual = s.dados.permissions?.[chave] || [];
      const meus = registro[chave].filter((r) => atual.includes(r));
      const saem = chave === "allow" ? meus.filter((r) => !desejado.allow.includes(r)) : []; // comando que saiu do REGRAS.md
      const faltam = desejado[chave].filter((r) => !atual.includes(r));
      registro[chave] = [...new Set([...meus.filter((r) => !saem.includes(r)), ...faltam])];
      if (faltam.length || saem.length) {
        s.dados.permissions = { ...s.dados.permissions, [chave]: [...atual.filter((r) => !saem.includes(r)), ...faltam] };
        mudancas.push(`${chave} +${faltam.length}${saem.length ? ` -${saem.length}` : ""}`);
      }
    }
    // Status line (opcional, --statusline): plugin não pode definir statusLine, então vai no settings.local.json.
    // Só troca a que o próprio kit gravou; a do usuário fica.
    if (statusline) {
      const cmd = comandoStatusline();
      const atual = s.dados.statusLine;
      if (!atual || (registro.statusline && atual.command === registro.statusline)) {
        if (atual?.command !== cmd) {
          s.dados.statusLine = { type: "command", command: cmd, padding: 0 };
          mudancas.push("statusLine");
        }
        registro.statusline = cmd;
      } else log(`AVISO    ${SETTINGS} já tem statusLine do usuário; mantida (apague-a para usar a do kit)`);
    }
    if (mudancas.length) {
      fazer(`settings ${SETTINGS}: ${mudancas.join(", ")}`, () => {
        fs.mkdirSync(path.dirname(path.join(raiz, SETTINGS)), { recursive: true });
        fs.writeFileSync(path.join(raiz, SETTINGS), JSON.stringify(s.dados, null, 2) + "\n");
      });
    } else log(`settings ${SETTINGS}: deny-list e allowlist em dia`);
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

  const manifesto = { versao_kit: kit.versao, deny: registro.deny, allow: registro.allow, ...(registro.statusline ? { statusline: registro.statusline } : {}), criou_settings: criouSettings, criou_grafo: criouGrafo };
  fazer("manifesto instalados.json", () => fs.writeFileSync(manifestoF, JSON.stringify(manifesto, null, 2) + "\n"));

  log("");
  log(`${dryRun ? "Simulação concluída" : "Pronto"} em ${raiz} (perfil ${config.perfil}).`);
  if (!d.cypress) log("Cypress não encontrado: o Maestro vai oferecer configurar quando houver tarefa de E2E.");
  log("Próximo passo: revisar .modo-deus/REGRAS.md e rodar `node instalar.mjs doctor`.");
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
    const meus = { deny: manifesto.deny || [], allow: manifesto.allow || [] };
    fazer(`settings ${SETTINGS}: ${meus.deny.length + meus.allow.length} regra(s) do kit removida(s)${manifesto.statusline ? " e status line" : ""}`, () => {
      for (const chave of ["deny", "allow"]) {
        const resta = (s.dados.permissions?.[chave] || []).filter((r) => !meus[chave].includes(r));
        if (resta.length) s.dados.permissions[chave] = resta;
        else if (s.dados.permissions) delete s.dados.permissions[chave];
      }
      if (manifesto.statusline && s.dados.statusLine?.command === manifesto.statusline) delete s.dados.statusLine;
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
    if (fs.existsSync(path.join(raiz, PASTA_ANTIGA, "instalados.json")) && !fs.existsSync(pasta)) erro(`kit no local antigo (${PASTA_ANTIGA}/): rode o instalador de novo para migrar para ${PASTA}/`);
    else if (!fs.existsSync(path.join(pasta, "instalados.json"))) erro("kit não instalado neste projeto (node instalar.mjs <caminho>)");
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
      if (versionado(raiz, SETTINGS)) aviso(`${SETTINGS} é versionado pelo projeto: o deny-list do kit não foi aplicado; confira as regras de segurança nele`);
      else try { s = lerSettings(raiz); } catch (e) { erro(e.message); }
      if (s) {
        const deny = lerJson(path.join(KIT, "hooks", "settings.deny.json")).deny;
        const faltam = deny.filter((r) => !(s.dados.permissions?.deny || []).includes(r));
        faltam.length ? erro(`deny-list incompleto: faltam ${faltam.length} regra(s)`) : ok("deny-list aplicado");
        const regras = fs.existsSync(path.join(pasta, "REGRAS.md")) ? fs.readFileSync(path.join(pasta, "REGRAS.md"), "utf8") : "";
        const semAllow = allowlist(regras).filter((r) => !(s.dados.permissions?.allow || []).includes(r));
        semAllow.length ? aviso(`allowlist fora de sincronia com o REGRAS.md (${semAllow.length} regra(s)): rode o instalador de novo`) : ok("allowlist em dia com o REGRAS.md");
      }

      const exc = arquivoExclude(raiz);
      fs.existsSync(exc) && fs.readFileSync(exc, "utf8").includes(MARCA_INI) ? ok("exclude configurado") : erro("bloco do modo-deus ausente no .git/info/exclude");

      const sujos = (git(raiz, "status", "--porcelain", "--", ".claude") || "").split("\n").filter((l) => l.includes(PASTA) || l.includes(SETTINGS));
      sujos.length ? erro(`arquivos do kit aparecem no git status: ${sujos.join("; ")}`) : ok("git status limpo dos arquivos do kit");

      const det = detectar(raiz);
      const regrasTxt = fs.existsSync(regrasF) ? fs.readFileSync(regrasF, "utf8") : "";
      const novas = det.convencoes.filter((c) => !regrasTxt.includes(c));
      novas.length ? aviso(`convenções do projeto fora do REGRAS.md (mudaram depois da instalação?): ${novas.join("; ")}`) : ok("convenções do REGRAS.md em dia");
      det.cypress ? ok("Cypress configurado") : aviso("Cypress não configurado (o Maestro oferece na primeira tarefa de E2E)");

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
// escopo "local": marketplace e plugins só no projeto (rodados com cwd no projeto); "user": globais.
export function planoDependencias({ instalados = null, marketplaces = null, graphify = graphifyVersao(), skillGraphify = null, ferramentas = null, escopo = kit.dependencias.escopo_padrao || "local", projeto = null, externas = null, mcps = null } = {}) {
  const lerChaves = (f, sub) => { try { const j = lerJson(path.join(home(), ".claude", "plugins", f)); return Object.keys(sub ? j[sub] || {} : j); } catch { return []; } };
  // Instalado vale se for global (user) ou, no escopo local, se for deste projeto.
  if (!instalados) {
    instalados = [];
    try {
      const todos = lerJson(path.join(home(), ".claude", "plugins", "installed_plugins.json")).plugins || {};
      const mesmo = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
      for (const [id, entradas] of Object.entries(todos)) {
        const lista = Array.isArray(entradas) ? entradas : [entradas];
        if (lista.some((x) => !x?.scope || x.scope === "user" || (escopo === "local" && mesmo(x.projectPath, projeto)))) instalados.push(id);
      }
    } catch { /* sem plugins */ }
  }
  marketplaces ??= lerChaves("known_marketplaces.json");
  skillGraphify ??= fs.existsSync(path.join(home(), ".claude", "skills", kit.dependencias.graphify.skill, "SKILL.md"));
  ferramentas ??= { uv: existeBin("uv"), pipx: existeBin("pipx") };
  const passos = [];
  for (const [nome, repo] of Object.entries(kit.dependencias.marketplaces)) {
    if (!marketplaces.includes(nome)) passos.push({ descricao: `marketplace ${nome}`, bin: "claude", args: ["plugin", "marketplace", "add", repo, "--scope", escopo] });
  }
  for (const id of kit.dependencias.plugins) {
    if (Object.keys(kit.dependencias.fora).some((f) => id.startsWith(f + "@"))) continue;
    if (!instalados.includes(id)) passos.push({ descricao: `plugin ${id}`, bin: "claude", args: ["plugin", "install", id, "--scope", escopo] });
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

  // Ferramentas de linha de comando com MCP (SkillSpector): a CLI é da máquina; o MCP fica no escopo pedido.
  for (const [nome, fer] of Object.entries(kit.dependencias.ferramentas || {})) {
    const tem = externas ? !!externas[nome] : existeBin(fer.binario);
    if (!tem) {
      passos.push(
        ferramentas.uv ? { descricao: `${nome} via uv`, bin: "uv", args: ["tool", "install", ...(fer.python ? ["--python", fer.python] : []), fer.pacote], fornece: nome }
        : ferramentas.pipx ? { descricao: `${nome} via pipx`, bin: "pipx", args: ["install", ...(fer.python ? ["--python", fer.python] : []), fer.pacote], fornece: nome }
        : { descricao: `${nome} via pip`, bin: "python", args: ["-m", "pip", "install", "--user", fer.pacote], fornece: nome },
      );
    }
    if (fer.mcp) {
      const registrado = mcps ? mcps.includes(fer.mcp.nome) : rodar("claude", ["mcp", "get", fer.mcp.nome], projeto || undefined) !== null;
      if (!registrado) passos.push({ descricao: `MCP ${fer.mcp.nome}`, bin: "claude", args: ["mcp", "add", "--scope", escopo, fer.mcp.nome, "--", fer.binario, ...fer.mcp.args], requer: nome });
    }
  }
  return passos;
}

export function dependencias({ caminho = process.cwd(), escopo = kit.dependencias.escopo_padrao || "local", dryRun = false, log = console.log } = {}) {
  if (!["local", "user"].includes(escopo)) throw new ErroUso(`escopo inválido: ${escopo} (use local|user)`);
  const raiz = escopo === "local" ? raizDoRepo(caminho) : process.cwd();
  log(`escopo   ${escopo}${escopo === "local" ? ` (só em ${raiz})` : " (todas as sessões)"}`);
  const passos = planoDependencias({ escopo, projeto: raiz });
  if (!passos.length) {
    log("Todas as dependências já estão instaladas.");
    return { falhas: 0, passos };
  }
  let falhas = 0;
  const falhou = new Set();
  for (const p of passos) {
    if (p.requer && falhou.has(p.requer)) { log(`pulado   ${p.descricao}: ${p.requer} não instalou`); continue; }
    const linha = `${p.bin} ${p.args.join(" ")}`;
    if (dryRun) { log(`[simulação] ${p.descricao}: ${linha}`); continue; }
    log(`...      ${p.descricao}: ${linha}`);
    const saida = rodar(p.bin, p.args, p.bin === "claude" ? raiz : undefined);
    if (saida === null) { falhas++; if (p.fornece) falhou.add(p.fornece); log(`FALHOU   ${p.descricao}`); }
    else log(`ok       ${p.descricao}`);
  }
  log("");
  log(dryRun ? `${passos.length} passo(s) a executar.` : falhas ? `${falhas} falha(s).` : "Dependências instaladas. Abra uma sessão nova do Claude Code.");
  const precisa = Object.entries(kit.dependencias.configuracao || {});
  if (precisa.length) {
    log("");
    log("Precisam de configuração sua (o kit não inventa chaves nem faz login):");
    for (const [id, o] of precisa) log(`  - ${id.split("@")[0]}: ${o}`);
  }
  log(`Fora do kit, de propósito: ${Object.entries(kit.dependencias.fora).map(([n, m]) => `${n} (${m})`).join("; ")}.`);
  return { falhas, passos };
}

// ---------- CLI ----------
// Compara caminhos reais: chamado por junction/symlink, argv[1] e import.meta.url diferem.
const mesmoArquivo = (a, b) => {
  const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
  const [x, y] = [real(a), real(b)];
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
};
if (process.argv[1] && mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const o = args(process.argv.slice(2));
    if (o.comando === "doctor") process.exitCode = doctor(o.caminho).erros ? 1 : 0;
    else if (o.comando === "dependencias") process.exitCode = dependencias(o).falhas ? 1 : 0;
    else if (o.comando === "remover") remover(o.caminho, o);
    else instalar(o.caminho, o);
  } catch (e) {
    if (!(e instanceof ErroUso)) throw e;
    if (e.message) console.error(`erro: ${e.message}`);
    console.error("uso: node instalar.mjs [caminho] [--perfil leve|estrito|deus] [--times dev-mobile=ligado,...] [--sem-grafo] [--statusline] [--dry-run]\n     node instalar.mjs --remover [caminho] [--dry-run]\n     node instalar.mjs doctor [caminho]\n     node instalar.mjs dependencias [caminho] [--escopo local|user] [--dry-run]");
    process.exitCode = 1;
  }
}
