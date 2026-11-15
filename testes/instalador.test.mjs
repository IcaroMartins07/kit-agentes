// node --test testes/
// Repositório e HOME temporários; não toca no seu ~/.claude.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
  const r = ler(".claude/modo-deus/REGRAS.md");
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
  fs.mkdirSync(path.join(wt, ".claude", "modo-deus"), { recursive: true });
  fs.writeFileSync(path.join(wt, ".claude", "modo-deus", "REGRAS.md"), "x");
  fs.writeFileSync(path.join(wt, ".claude", "settings.local.json"), "{}");
  assert.equal(status(wt), "");
});

test("reinstalação preserva REGRAS.md editado e não duplica deny", () => {
  instalar(repo, { log: silencio });
  escrever(".claude/modo-deus/REGRAS.md", "minhas regras");
  instalar(repo, { log: silencio });
  assert.equal(ler(".claude/modo-deus/REGRAS.md"), "minhas regras");
  const deny = lerJson(".claude/settings.local.json").permissions.deny;
  assert.equal(deny.length, new Set(deny).size);
});

test("settings do usuário é preservado na instalação e na remoção", () => {
  escrever(".claude/settings.local.json", JSON.stringify({ permissions: { allow: ["Bash(npm test)"], deny: ["Read(./segredo.txt)", "Bash(git reset --hard:*)"] }, model: "sonnet" }));
  instalar(repo, { log: silencio });
  let s = lerJson(".claude/settings.local.json");
  assert.deepEqual(s.permissions.allow, ["Bash(npm test)"]);
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
  escrever(".claude/modo-deus/REGRAS.md", "do projeto");
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
  escrever(".claude/modo-deus/REGRAS.md", "minhas regras");
  const { backup } = remover(repo, { log: silencio });
  assert.equal(status(), "");
  assert.ok(!fs.existsSync(path.join(repo, ".claude", "modo-deus")));
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
  const regras = ler(".claude/modo-deus/REGRAS.md");
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
  pluginsFake("modo-deus@kit-agentes", "superpowers@claude-plugins-official", "claude-security@claude-plugins-official", "frontend-design@claude-plugins-official");
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
  pluginsFake("superpowers@claude-plugins-official", "claude-security@claude-plugins-official", "frontend-design@claude-plugins-official");
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

test("dependências: instala só o que falta e nunca o caveman", () => {
  const passos = planoDependencias({ instalados: ["superpowers@claude-plugins-official"], marketplaces: [], graphify: null, skillGraphify: false, ferramentas: { uv: false, pipx: true } });
  const linhas = passos.map((p) => [p.bin, ...p.args].join(" "));
  assert.deepEqual(linhas, [
    "claude plugin marketplace add anthropics/claude-plugins-official",
    "claude plugin install claude-security@claude-plugins-official",
    "claude plugin install frontend-design@claude-plugins-official",
    "pipx install graphifyy",
    "graphify install --platform claude",
  ]);
  assert.ok(!linhas.some((l) => /caveman|claude-code-setup/.test(l)));
});

test("dependências: tudo instalado não gera passo; graphify antigo é atualizado", () => {
  const todos = ["superpowers@claude-plugins-official", "claude-security@claude-plugins-official", "frontend-design@claude-plugins-official"];
  assert.deepEqual(planoDependencias({ instalados: todos, marketplaces: ["claude-plugins-official"], graphify: "9.9.9", skillGraphify: true, ferramentas: {} }), []);
  const p = planoDependencias({ instalados: todos, marketplaces: ["claude-plugins-official"], graphify: "0.1.0", skillGraphify: true, ferramentas: { uv: true } });
  assert.deepEqual(p.map((x) => [x.bin, ...x.args].join(" ")), ["uv tool upgrade graphifyy"]);
});
