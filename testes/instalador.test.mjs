// node --test testes/
// Repositório e HOME temporários; não toca no seu ~/.claude.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { instalar, remover, doctor, planoDependencias } from "../instalar.mjs";

let tmp, repo;
const silencio = () => {};
const git = (dir, ...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" }).trim();
const status = (dir = repo) => git(dir, "status", "--porcelain");
const ler = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");
const lerJson = (rel) => JSON.parse(ler(rel));
const escrever = (rel, conteudo) => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), conteudo);
};
const commitar = (msg = "c") => {
  git(repo, "add", "-A");
  git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", msg);
};
const skillGraphifyFake = () => {
  const d = path.join(process.env.MODO_DEUS_HOME, ".claude", "skills", "graphify");
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "SKILL.md"), "x");
};
const temGraphify = (() => { try { execFileSync("graphify", ["--version"], { stdio: "ignore", shell: process.platform === "win32" }); return true; } catch { return false; } })();
const CONECTORES = JSON.parse(fs.readFileSync(new URL("../hooks/conectores.json", import.meta.url), "utf8"));
const TODOS_PLUGINS = CONECTORES.plugins;
const pluginsFake = (...ids) => {
  const f = path.join(process.env.MODO_DEUS_HOME, ".claude", "plugins", "installed_plugins.json");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ version: 2, plugins: Object.fromEntries(ids.map((i) => [i, [{ scope: "user" }]])) }));
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "modo-deus-"));
  process.env.MODO_DEUS_HOME = path.join(tmp, "home");
  process.env.MODO_DEUS_SEM_GRAPHIFY = "1"; // rápido e independente da máquina; o teste do grafo real liga de volta
  repo = path.join(tmp, "repo");
  fs.mkdirSync(repo);
  git(repo, "init", "-q");
  escrever("package.json", JSON.stringify({ scripts: { dev: "vite", test: "vitest", lint: "eslint .", typecheck: "tsc", build: "vite build" }, devDependencies: { vitest: "^3.0.0", typescript: "^5.6.0" } }));
  fs.mkdirSync(path.join(repo, "src", "components"), { recursive: true });
  fs.mkdirSync(path.join(repo, "migrations"));
  commitar("init");
});

afterEach(() => {
  delete process.env.MODO_DEUS_HOME;
  delete process.env.MODO_DEUS_SEM_GRAPHIFY;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("instalação termina e deixa git status limpo", () => {
  const linhas = [];
  instalar(repo, { log: (l) => linhas.push(l) });
  assert.ok(linhas.some((l) => l.startsWith("Pronto em")));
  assert.equal(status(), "");
});

test("REGRAS.md nasce com stack, comandos e territórios detectados", () => {
  instalar(repo, { log: silencio });
  const r = ler(".modo-deus/REGRAS.md");
  assert.match(r, /# Regras do projeto repo/);
  assert.match(r, /\| Testes \| `npm run test` \|/);
  assert.match(r, /\| Tipos \| `npm run typecheck` \|/);
  assert.match(r, /\| E2E \| `<\.\.\.>` \|/);
  assert.match(r, /typescript \^5\.6\.0/);
  assert.match(r, /\*\*front\*\*: `src\/components\/\*\*`/);
  assert.match(r, /\*\*db\*\*: `migrations\/\*\*`/);
  assert.match(r, /Runner de unidade\/integração: Vitest/);
  assert.match(r, /Cypress, ainda não configurado/);
  assert.doesNotMatch(r, /<!-- modo-deus:/);
});

test("worktree também ignora os arquivos do kit", () => {
  instalar(repo, { log: silencio });
  const wt = path.join(tmp, "wt");
  git(repo, "worktree", "add", "-q", wt);
  fs.mkdirSync(path.join(wt, ".modo-deus"), { recursive: true });
  fs.writeFileSync(path.join(wt, ".modo-deus", "REGRAS.md"), "x");
  fs.mkdirSync(path.join(wt, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(wt, ".claude", "settings.local.json"), "{}");
  assert.equal(status(wt), "");
});

test("reinstalação preserva REGRAS.md editado e não duplica deny", () => {
  instalar(repo, { log: silencio });
  escrever(".modo-deus/REGRAS.md", "minhas regras");
  instalar(repo, { log: silencio });
  assert.equal(ler(".modo-deus/REGRAS.md"), "minhas regras");
  const deny = lerJson(".claude/settings.local.json").permissions.deny;
  assert.equal(deny.length, new Set(deny).size);
});

test("settings do usuário é preservado na instalação e na remoção", () => {
  escrever(".claude/settings.local.json", JSON.stringify({ permissions: { allow: ["Bash(npm test)"], deny: ["Read(./segredo.txt)", "Bash(git reset --hard:*)"] }, model: "sonnet" }));
  instalar(repo, { log: silencio });
  let s = lerJson(".claude/settings.local.json");
  assert.equal(s.permissions.allow[0], "Bash(npm test)", "entrada do usuário mantida, na frente");
  assert.ok(s.permissions.allow.includes("Bash(npm run test:*)"), "comando do REGRAS.md liberado");
  assert.ok(s.permissions.allow.includes("Bash(graphify query:*)"));
  assert.ok(s.permissions.deny.includes("Read(./segredo.txt)"));
  assert.ok(s.permissions.deny.includes("Read(./.env)"));
  remover(repo, { log: silencio });
  s = lerJson(".claude/settings.local.json");
  assert.deepEqual(s, { permissions: { allow: ["Bash(npm test)"], deny: ["Read(./segredo.txt)", "Bash(git reset --hard:*)"] }, model: "sonnet" });
});

test("settings.local.json inválido aborta sem alterar nada", () => {
  escrever(".claude/settings.local.json", "{ quebrado");
  assert.throws(() => instalar(repo, { log: silencio }), /não é JSON válido/);
  assert.equal(ler(".claude/settings.local.json"), "{ quebrado");
});

test("pasta do kit versionada pelo projeto aborta", () => {
  escrever(".modo-deus/REGRAS.md", "do projeto");
  commitar();
  assert.throws(() => instalar(repo, { log: silencio }), /já é versionado/);
});

test("settings.local.json versionado não é tocado", () => {
  escrever(".claude/settings.local.json", "{}\n");
  git(repo, "add", "-f", ".claude/settings.local.json"); // o gitignore global costuma ignorá-lo
  commitar();
  const linhas = [];
  instalar(repo, { log: (l) => linhas.push(l) });
  assert.equal(ler(".claude/settings.local.json"), "{}\n");
  assert.ok(linhas.some((l) => l.includes("é versionado pelo projeto")));
});

test("--dry-run não escreve nada", () => {
  const linhas = [];
  instalar(repo, { dryRun: true, log: (l) => linhas.push(l) });
  assert.ok(!fs.existsSync(path.join(repo, ".claude")));
  assert.ok(linhas.every((l) => l === "" || l.startsWith("[simulação]") || !l.includes("REGRAS.md criado")));
  assert.ok(linhas.some((l) => l.startsWith("[simulação] regras")));
  assert.ok(!fs.readFileSync(path.join(repo, ".git", "info", "exclude"), "utf8").includes("modo-deus"));
});

test("--remover limpa o projeto e guarda backup fora dele", () => {
  instalar(repo, { log: silencio });
  escrever(".modo-deus/REGRAS.md", "minhas regras");
  const { backup } = remover(repo, { log: silencio });
  assert.equal(status(), "");
  assert.ok(!fs.existsSync(path.join(repo, ".modo-deus")));
  assert.ok(!fs.existsSync(path.join(repo, ".claude", "settings.local.json")), "settings criado pelo kit some");
  assert.ok(!fs.readFileSync(path.join(repo, ".git", "info", "exclude"), "utf8").includes("modo-deus"));
  assert.equal(fs.readFileSync(path.join(backup, "REGRAS.md"), "utf8"), "minhas regras");
});

test("--remover sem instalação avisa", () => {
  assert.throws(() => remover(repo, { log: silencio }), /não está instalado/);
});

test("exclude preserva linhas do usuário", () => {
  const exc = path.join(repo, ".git", "info", "exclude");
  fs.writeFileSync(exc, "minha-linha\n");
  instalar(repo, { log: silencio });
  instalar(repo, { log: silencio });
  const t = fs.readFileSync(exc, "utf8");
  assert.ok(t.startsWith("minha-linha\n"));
  assert.equal(t.split("# modo-deus (kit local)").length, 2, "bloco único");
  remover(repo, { log: silencio });
  assert.equal(fs.readFileSync(exc, "utf8"), "minha-linha\n");
});

test("times sob demanda: detecção e modo forçado persistem", () => {
  fs.mkdirSync(path.join(repo, "android"));
  let r = instalar(repo, { log: silencio });
  assert.equal(r.deteccao.sobDemanda["dev-mobile"], true);
  assert.equal(r.deteccao.sobDemanda["dev-dados"], false);
  const regras = ler(".modo-deus/REGRAS.md");
  assert.match(regras, /\| dev-mobile \| auto \| sim \|/);
  assert.match(regras, /\*\*mobile\*\*: `android\/\*\*`/);
  assert.match(regras, /\*\*dados\*\*: time dev-dados não detectado/);
  instalar(repo, { times: { "dev-docs": "ligado" }, log: silencio });
  r = instalar(repo, { log: silencio });
  assert.equal(r.config.times["dev-docs"], "ligado");
  assert.equal(r.config.times["dev-mobile"], "auto");
});

test("perfil: padrão estrito, troca persiste", () => {
  assert.equal(instalar(repo, { log: silencio }).config.perfil, "estrito");
  instalar(repo, { perfil: "deus", log: silencio });
  assert.equal(instalar(repo, { log: silencio }).config.perfil, "deus");
});

test("doctor: projeto sem kit tem erro; instalado e com plugins não tem", () => {
  assert.ok(doctor(repo, { log: silencio }).erros > 0);
  pluginsFake("modo-deus@kit-agentes", ...TODOS_PLUGINS);
  instalar(repo, { log: silencio });
  const r = doctor(repo, { log: silencio });
  const erros = r.resultados.filter(([n]) => n === "ERRO").map(([, m]) => m);
  assert.deepEqual(erros.filter((m) => !/graphify/.test(m)), [], JSON.stringify(r.resultados));
  assert.ok(r.resultados.some(([n, m]) => n === "aviso" && /campo\(s\) <\.\.\.>/.test(m)));
});

test("doctor: dependência de plugin ausente é erro", () => {
  pluginsFake("modo-deus@kit-agentes");
  instalar(repo, { log: silencio });
  const r = doctor(repo, { log: silencio });
  assert.ok(r.resultados.some(([n, m]) => n === "ERRO" && /superpowers/.test(m)));
});

test("doctor: deny-list removido à mão é erro", () => {
  pluginsFake("modo-deus@kit-agentes", "superpowers@claude-plugins-official", "claude-security@claude-plugins-official");
  instalar(repo, { log: silencio });
  escrever(".claude/settings.local.json", "{}");
  assert.ok(doctor(repo, { log: silencio }).resultados.some(([n, m]) => n === "ERRO" && /deny-list/.test(m)));
});

test("sem graphify: instalação avisa, segue, e o doctor acusa", () => {
  const linhas = [];
  instalar(repo, { log: (l) => linhas.push(l) });
  assert.ok(linhas.some((l) => /graphify não encontrado/.test(l)));
  assert.equal(status(), "");
  assert.ok(doctor(repo, { log: silencio }).resultados.some(([n, m]) => n === "ERRO" && /graphify não encontrado/.test(m)));
});

test("--sem-grafo não tenta o graphify", () => {
  const linhas = [];
  instalar(repo, { semGrafo: true, log: (l) => linhas.push(l) });
  assert.ok(linhas.some((l) => /pulado \(--sem-grafo\)/.test(l)));
  assert.ok(!linhas.some((l) => /graphify não encontrado/.test(l)));
});

test("graphify real: grafo criado fora do git, doctor ok, remoção apaga o grafo", { skip: !temGraphify && "graphify ausente" }, () => {
  delete process.env.MODO_DEUS_SEM_GRAPHIFY;
  escrever("src/lib/mat.ts", "export function soma(a: number, b: number) { return a + b }\n");
  escrever("src/components/Botao.tsx", 'import { soma } from "../lib/mat";\nexport function Botao() { return soma(1, 2) }\n');
  commitar();
  instalar(repo, { log: silencio });
  assert.ok(fs.existsSync(path.join(repo, "graphify-out", "graph.json")));
  assert.equal(status(), "", "graphify-out/ fica no exclude");
  assert.ok(!fs.existsSync(path.join(repo, ".gitattributes")), "nada de merge driver versionado");
  skillGraphifyFake();
  pluginsFake(...TODOS_PLUGINS);
  const r = doctor(repo, { log: silencio });
  assert.equal(r.erros, 0, JSON.stringify(r.resultados));
  assert.ok(r.resultados.some(([n, m]) => n === "ok" && /grafo do projeto atualizado/.test(m)));
  remover(repo, { log: silencio });
  assert.ok(!fs.existsSync(path.join(repo, "graphify-out")));
  assert.equal(status(), "");
});

test("grafo versionado pelo projeto não é tocado nem excluído", () => {
  escrever("graphify-out/graph.json", "{}");
  commitar();
  delete process.env.MODO_DEUS_SEM_GRAPHIFY;
  const linhas = [];
  instalar(repo, { log: (l) => linhas.push(l) });
  assert.equal(ler("graphify-out/graph.json"), "{}");
  assert.ok(linhas.some((l) => /é versionado pelo projeto; mantido/.test(l)));
  assert.ok(!fs.readFileSync(path.join(repo, ".git", "info", "exclude"), "utf8").includes("graphify-out"));
});

test("dependências: instala só o que falta, só no projeto (--scope local) e nunca o caveman", () => {
  const passos = planoDependencias({ instalados: ["superpowers@claude-plugins-official"], marketplaces: [], graphify: null, skillGraphify: false, ferramentas: { uv: false, pipx: true }, externas: { skillspector: false }, mcps: [] });
  const linhas = passos.map((p) => [p.bin, ...p.args].join(" "));
  for (const repo of Object.values(CONECTORES.marketplaces)) assert.ok(linhas.includes(`claude plugin marketplace add ${repo} --scope local`), repo);
  for (const id of TODOS_PLUGINS.filter((p) => p !== "superpowers@claude-plugins-official")) assert.ok(linhas.includes(`claude plugin install ${id} --scope local`), id);
  assert.ok(!linhas.some((l) => l.includes("install superpowers@")), "o que já está instalado não repete");
  assert.ok(linhas.includes("pipx install graphifyy"));
  assert.ok(linhas.includes("graphify install --platform claude"));
  assert.ok(linhas.includes(`pipx install --python 3.12 ${CONECTORES.ferramentas.skillspector.pacote}`));
  assert.ok(linhas.includes("claude mcp add --scope local skillspector -- skillspector mcp"));
  assert.ok(!linhas.some((l) => /caveman/.test(l)));
});

test("dependências: tudo instalado não gera passo; graphify antigo é atualizado", () => {
  const tudo = { instalados: TODOS_PLUGINS, marketplaces: Object.keys(CONECTORES.marketplaces), skillGraphify: true, externas: { skillspector: true }, mcps: ["skillspector"] };
  assert.deepEqual(planoDependencias({ ...tudo, graphify: "9.9.9", ferramentas: {} }), []);
  const p = planoDependencias({ ...tudo, graphify: "0.1.0", ferramentas: { uv: true } });
  assert.deepEqual(p.map((x) => [x.bin, ...x.args].join(" ")), ["uv tool upgrade graphifyy"]);
});

test("dependências: escopo user instala global quando pedido", () => {
  const passos = planoDependencias({ instalados: [], marketplaces: Object.keys(CONECTORES.marketplaces), graphify: "9.9.9", skillGraphify: true, ferramentas: {}, escopo: "user", externas: { skillspector: true }, mcps: [] });
  const claude = passos.filter((p) => p.bin === "claude");
  assert.ok(claude.length > 0);
  assert.ok(claude.every((p) => p.args.join(" ").includes("--scope user")));
});

test("dependências: todo conector que precisa de chave ou login está declarado, sem valor inventado", () => {
  for (const [id, o] of Object.entries(CONECTORES.configuracao || {})) {
    assert.ok(TODOS_PLUGINS.includes(id), `${id} em configuracao mas fora de plugins`);
    assert.doesNotMatch(o, /sk-|pplx-[A-Za-z0-9]{8,}|=\s*[A-Za-z0-9]{12,}/, `${id}: parece conter um valor de chave`);
  }
  assert.match(CONECTORES.configuracao["perplexity@perplexity-mcp-server"], /PERPLEXITY_API_KEY/);
});

// ---------- correções da revisão da F1 ----------
const KIT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const cli = (script, ...a) => spawnSync(process.execPath, [script, ...a], { encoding: "utf8", env: process.env });

test("revisão 1: CLI chamado por junction/symlink executa", () => {
  const link = path.join(tmp, "kitlink");
  fs.symlinkSync(KIT_DIR, link, process.platform === "win32" ? "junction" : "dir");
  const r = cli(path.join(link, "instalar.mjs"), "doctor", repo);
  assert.match(r.stdout, /node \d+/, `saída vazia; stderr: ${r.stderr}`);
});

test("revisão 2: comando sem preencher conta como campo aberto", () => {
  const contar = (linhas) => Number(linhas.find((l) => l.startsWith("regras")).match(/\((\d+) campo/)[1]);
  let linhas = [];
  instalar(repo, { log: (l) => linhas.push(l) });
  const comTipos = contar(linhas);
  remover(repo, { log: silencio });
  escrever("package.json", JSON.stringify({ scripts: { dev: "vite", test: "vitest", lint: "eslint .", build: "vite build" }, devDependencies: { vitest: "^3.0.0", typescript: "^5.6.0" } }));
  linhas = [];
  instalar(repo, { log: (l) => linhas.push(l) });
  assert.equal(contar(linhas), comTipos + 1, "Tipos vazio deve somar um campo");
});

test("revisão 3: placeholder do npm init não vira comando de teste", () => {
  escrever("package.json", JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }));
  instalar(repo, { log: silencio });
  assert.match(ler(".modo-deus/REGRAS.md"), /\| Testes \| `<\.\.\.>` \|/);
});

test("revisão 4: app.json do Heroku não liga dev-mobile; lib/ só é mobile com Flutter", () => {
  escrever("app.json", JSON.stringify({ name: "api", buildpacks: [] }));
  fs.mkdirSync(path.join(repo, "lib"));
  let r = instalar(repo, { log: silencio });
  assert.equal(r.deteccao.sobDemanda["dev-mobile"], false);
  escrever("app.json", JSON.stringify({ expo: { name: "app" } }));
  r = instalar(repo, { log: silencio });
  assert.equal(r.deteccao.sobDemanda["dev-mobile"], true);
  assert.ok(!r.deteccao.territorios.mobile.includes("lib/**"), "lib/ sem pubspec.yaml não é mobile");
  escrever("pubspec.yaml", "name: app\n");
  r = instalar(repo, { log: silencio });
  assert.ok(r.deteccao.territorios.mobile.includes("lib/**"));
});

test("revisão 5: settings versionado vira aviso no doctor, não erro", () => {
  escrever(".claude/settings.local.json", "{}\n");
  git(repo, "add", "-f", ".claude/settings.local.json");
  commitar();
  instalar(repo, { log: silencio });
  const r = doctor(repo, { log: silencio });
  assert.ok(!r.resultados.some(([n, m]) => n === "ERRO" && /deny/.test(m)), JSON.stringify(r.resultados));
  assert.ok(r.resultados.some(([n, m]) => n === "aviso" && /versionado/.test(m)));
});

test("revisão 6: $ no nome do repositório não corrompe o REGRAS.md", () => {
  const estranho = path.join(tmp, "r$&x");
  fs.mkdirSync(estranho);
  git(estranho, "init", "-q");
  instalar(estranho, { log: silencio });
  assert.match(fs.readFileSync(path.join(estranho, ".modo-deus", "REGRAS.md"), "utf8"), /^# Regras do projeto r\$&x$/m);
});

test("revisão 7: --perfil sem valor é erro de uso", () => {
  const r = cli(path.join(KIT_DIR, "instalar.mjs"), repo, "--perfil");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--perfil precisa de um valor/);
});

test("revisão 2b: REGRAS.md com todos os campos preenchidos sai como preenchido", () => {
  pluginsFake(...TODOS_PLUGINS);
  instalar(repo, { log: silencio });
  const f = ".modo-deus/REGRAS.md";
  // preenche tudo o que estiver entre < > (exceto <a definir>, que é pendência assumida)
  escrever(f, ler(f).replace(/<(?!a definir>)(?:\.\.\.|[A-Za-zÀ-ÿ][^>\n]*)>/g, "preenchido"));
  const r = doctor(repo, { log: silencio });
  assert.ok(r.resultados.some(([n, m]) => n === "ok" && m === "REGRAS.md preenchido"), JSON.stringify(r.resultados.filter(([, m]) => /REGRAS/.test(m))));
});

test("allowlist acompanha o REGRAS.md: comando trocado sai, novo entra, o do usuário fica", () => {
  escrever(".claude/settings.local.json", JSON.stringify({ permissions: { allow: ["Bash(make:*)"] } }));
  instalar(repo, { log: silencio });
  const f = ".modo-deus/REGRAS.md";
  escrever(f, ler(f).replace("`npm run test`", "`npm run test:unit`"));
  instalar(repo, { log: silencio });
  const allow = lerJson(".claude/settings.local.json").permissions.allow;
  assert.ok(allow.includes("Bash(make:*)"));
  assert.ok(allow.includes("Bash(npm run test:unit:*)"));
  assert.ok(!allow.includes("Bash(npm run test:*)"));
  remover(repo, { log: silencio });
  assert.deepEqual(lerJson(".claude/settings.local.json"), { permissions: { allow: ["Bash(make:*)"] } });
});

test("allowlist ignora comando composto do REGRAS.md", async () => {
  const { allowlist } = await import("../instalar.mjs");
  const r = allowlist("## Comandos\n\n| Ação | Comando |\n|---|---|\n| Testes | `npm test && rm -rf x` |\n| Lint | `npm run lint` |\n");
  assert.ok(r.includes("Bash(npm run lint:*)"));
  assert.ok(!r.some((x) => x.includes("rm -rf")));
});

test("validação real: dados do kit fora de .claude/ (o Claude Code trata .claude/ como sensível)", () => {
  instalar(repo, { log: silencio });
  assert.ok(fs.existsSync(path.join(repo, ".modo-deus", "REGRAS.md")));
  assert.ok(!fs.existsSync(path.join(repo, ".claude", "modo-deus")));
  assert.equal(status(), "");
});

test("validação real: instalação antiga em .claude/modo-deus é migrada com o conteúdo", () => {
  instalar(repo, { log: silencio });
  fs.mkdirSync(path.join(repo, ".claude"), { recursive: true });
  fs.renameSync(path.join(repo, ".modo-deus"), path.join(repo, ".claude", "modo-deus"));
  escrever(".claude/modo-deus/REGRAS.md", "regras antigas");
  assert.ok(doctor(repo, { log: silencio }).resultados.some(([n, m]) => n === "ERRO" && /local antigo/.test(m)));
  const linhas = [];
  instalar(repo, { log: (l) => linhas.push(l) });
  assert.ok(linhas.some((l) => l.startsWith("migra")));
  assert.equal(ler(".modo-deus/REGRAS.md"), "regras antigas");
  assert.ok(!fs.existsSync(path.join(repo, ".claude", "modo-deus")));
  assert.equal(status(), "");
});

test("validação real: instalar dependência só na forma exata", async () => {
  const { allowlist } = await import("../instalar.mjs");
  const r = allowlist("## Comandos\n\n| Ação | Comando |\n|---|---|\n| Instalar | `npm install` |\n| Testes | `npm run test` |\n");
  assert.ok(r.includes("Bash(npm install)"));
  assert.ok(!r.includes("Bash(npm install:*)"));
  assert.ok(r.includes("Bash(npm run test:*)"));
});

test("REGRAS.md registra convenções, integrações (só nomes de variáveis) e o comando de auditoria", () => {
  const pkg = JSON.parse(ler("package.json"));
  pkg.dependencies = { stripe: "^14.0.0", "@aws-sdk/client-s3": "^3.0.0" };
  pkg.devDependencies.husky = "^9.0.0";
  escrever("package.json", JSON.stringify(pkg));
  escrever("eslint.config.js", "export default []");
  escrever(".prettierrc", "{}");
  escrever("tsconfig.json", '{ "compilerOptions": { "strict": true } }');
  escrever(".env.example", "DATABASE_URL=postgres://x\nSTRIPE_SECRET_KEY=sk_test_segredo\n# comentário\n");
  commitar("stack");
  instalar(repo, { log: silencio });
  const r = ler(".modo-deus/REGRAS.md");
  for (const x of ["Lint: ESLint (eslint.config.js)", "Formatação: Prettier (.prettierrc)", "TypeScript em modo strict", "Hooks de commit: husky", "Stripe (pagamento)", "AWS SDK", "`DATABASE_URL`", "`STRIPE_SECRET_KEY`", "| Auditoria | `npm audit` |", "## Desempenho"]) assert.ok(r.includes(x), x);
  assert.ok(!r.includes("sk_test_segredo"), "valor de variável de ambiente vazou para o REGRAS.md");
});
