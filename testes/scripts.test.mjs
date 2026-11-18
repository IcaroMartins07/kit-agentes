// skills/atualizar-terceiros.mjs.
// Sem rede: a origem das skills é um repositório git criado no temp. HOME e projetos também são temporários.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { atualizar, lerTabela, alteracoesLocais, ErroUso as ErroAtualizar } from "../skills/atualizar-terceiros.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const silencio = () => {};
let tmp;

const git = (dir, ...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const commitar = (dir, msg) => {
  git(dir, "add", "-A");
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", msg);
  return git(dir, "rev-parse", "HEAD");
};
const escrever = (f, c) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, c);
};
const ler = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
function arvore(dir) {
  const out = {};
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      const rel = path.relative(dir, abs).replace(/\\/g, "/");
      if (e.name === ".git") {
        const exc = path.join(abs, "info", "exclude");
        if (fs.existsSync(exc)) out[`${rel}/info/exclude`] = ler(exc);
        continue;
      }
      if (e.isDirectory()) andar(abs);
      else out[rel] = crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex");
    }
  };
  if (fs.existsSync(dir)) andar(dir);
  return out;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "modo-deus-scripts-"));
  process.env.MODO_DEUS_HOME = path.join(tmp, "home");
  process.env.MODO_DEUS_SEM_GRAPHIFY = "1";
});
afterEach(() => {
  delete process.env.MODO_DEUS_HOME;
  delete process.env.MODO_DEUS_SEM_GRAPHIFY;
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ================= atualizar-terceiros =================

test("a tabela real de skills/terceiros/README.md é lida inteira", () => {
  const texto = fs.readFileSync(path.join(KIT, "skills", "terceiros", "README.md"), "utf8");
  const t = lerTabela(texto);
  assert.equal(t.length, 6);
  const pw = t.find((e) => e.skill === "playwright-skill");
  assert.deepEqual([pw.pacote, pw.owner, pw.repo, pw.pasta, pw.commit], ["playwright", "lackeyjb", "playwright-skill", "skills/playwright-skill", "dd47a6a"]);
  const as = t.find((e) => e.pacote === "agent-skills");
  assert.equal(as.skill, null);
  assert.match(alteracoesLocais(texto), /using-agent-skills/);
});

// Kit falso com dois pacotes e origens locais em <tmp>/origem/<owner>/<repo>.
function montarTerceiros() {
  const origem = path.join(tmp, "origem");
  const ra = path.join(origem, "dono", "repo-a");
  const rb = path.join(origem, "dono", "repo-b");
  fs.mkdirSync(ra, { recursive: true });
  fs.mkdirSync(rb, { recursive: true });
  git(ra, "init", "-q");
  git(rb, "init", "-q");
  escrever(path.join(ra, "README.md"), "repo a\n");
  escrever(path.join(ra, "skills", "skill-x", "SKILL.md"), "---\nname: skill-x\n---\nv1\n");
  // Cópia da mesma skill para outra ferramenta, mais rasa e diferente: vale a que mais se parece com o local.
  for (const f of ["SKILL.md", "a.md", "b.md"]) escrever(path.join(ra, "skill-x", f), "cópia gerada\n");
  const a1 = commitar(ra, "a1");
  escrever(path.join(ra, "skills", "skill-x", "SKILL.md"), "---\nname: skill-x\n---\nv2\n");
  escrever(path.join(ra, "skills", "skill-x", "ref", "extra.md"), "extra\n");
  escrever(path.join(ra, "skills", "skill-y", "SKILL.md"), "---\nname: skill-y\n---\nnova\n");
  const a2 = commitar(ra, "a2");
  escrever(path.join(rb, "skills", "skill-b", "SKILL.md"), "---\nname: skill-b\n---\nb1\n");
  escrever(path.join(rb, "LICENSE"), "MIT\n");
  const b1 = commitar(rb, "b1");

  const kitDir = path.join(tmp, "kit");
  const ter = path.join(kitDir, "skills", "terceiros");
  escrever(path.join(ter, "pacote-a", "skill-x", "SKILL.md"), "---\nname: skill-x\n---\nv1\n");
  escrever(path.join(ter, "pacote-b", "skill-b", "SKILL.md"), "---\nname: skill-b\n---\nb1\n");
  escrever(path.join(ter, "pacote-b", "skill-b", "velho.md"), "saiu da origem\n");
  escrever(path.join(ter, "pacote-b", "skill-b", "LICENSE"), "MIT\n"); // copiado da raiz da origem, como no kit real
  escrever(path.join(ter, "README.md"), [
    "# skills/", "", "| Pacote | Origem | Commit |", "|---|---|---|",
    `| \`pacote-a\\\` | dono/repo-a | ${a1.slice(0, 7)} |`,
    `| \`pacote-b\\skill-b\` | dono/repo-b (pasta \`skills/skill-b\`) | ${b1.slice(0, 7)} |`,
    "", "Alterações locais em relação à origem:", "", "- `pacote-a\\skill-x\\SKILL.md`: acréscimo local para refazer.", "", "## Outra seção", "",
  ].join("\n"));
  return { origem, kitDir, ter, a1, a2, b1 };
}

test("atualizar-terceiros: simulação no commit pinado não altera nada e acusa só a diferença local", () => {
  const m = montarTerceiros();
  const antes = arvore(m.kitDir);
  const log = [];
  const res = atualizar({ kitDir: m.kitDir, origem: m.origem, log: (l) => log.push(l) });
  assert.deepEqual(arvore(m.kitDir), antes);
  const a = res.find((r) => r.entrada.pacote === "pacote-a");
  assert.equal(a.sha, m.a1);
  assert.deepEqual(a.pares.map((p) => [p.skill, p.novos.length + p.alterados.length + p.removidos.length]), [["skill-x", 0]]);
  const b = res.find((r) => r.entrada.pacote === "pacote-b");
  assert.deepEqual(b.pares[0].removidos, ["velho.md"]);
  assert.ok(log.some((l) => /Simulação: nada foi alterado/.test(l)));
});

test("atualizar-terceiros: simulação com --ultimo mostra novos, alterados e skill nova sem tocar em nada", () => {
  const m = montarTerceiros();
  const antes = arvore(m.kitDir);
  const log = [];
  const res = atualizar({ kitDir: m.kitDir, origem: m.origem, pacote: "pacote-a", ultimo: true, log: (l) => log.push(l) });
  assert.deepEqual(arvore(m.kitDir), antes);
  assert.equal(res.length, 1);
  assert.equal(res[0].sha, m.a2);
  const x = res[0].pares.find((p) => p.skill === "skill-x");
  assert.deepEqual(x.alterados, ["SKILL.md"]);
  assert.deepEqual(x.novos, ["ref/extra.md"]);
  assert.deepEqual(res[0].novas, ["skill-y"]);
  assert.ok(log.some((l) => /^nova\s+skill-y/.test(l)));
});

test("atualizar-terceiros: --aplicar copia, remove o que saiu, atualiza a tabela e lembra das alterações locais", () => {
  const m = montarTerceiros();
  const log = [];
  atualizar({ kitDir: m.kitDir, origem: m.origem, ultimo: true, aplicar: true, log: (l) => log.push(l) });
  assert.match(ler(path.join(m.ter, "pacote-a", "skill-x", "SKILL.md")), /v2/);
  assert.equal(ler(path.join(m.ter, "pacote-a", "skill-x", "ref", "extra.md")), "extra\n");
  assert.match(ler(path.join(m.ter, "pacote-a", "skill-y", "SKILL.md")), /nova/);
  assert.ok(!fs.existsSync(path.join(m.ter, "pacote-a", "README.md")), "arquivo de fora da pasta da skill não entra");
  assert.ok(!fs.existsSync(path.join(m.ter, "pacote-b", "skill-b", "velho.md")));
  assert.equal(ler(path.join(m.ter, "pacote-b", "skill-b", "LICENSE")), "MIT\n", "LICENSE da raiz da origem fica");
  const readme = ler(path.join(m.ter, "README.md"));
  assert.ok(readme.includes("| `pacote-a\\` | dono/repo-a | " + m.a2.slice(0, 7) + " |"), readme);
  assert.ok(readme.includes("(pasta `skills/skill-b`) | " + m.b1.slice(0, 7) + " |"), readme);
  assert.match(readme, /## Outra seção/);
  const i = log.findIndex((l) => /Refaça à mão/.test(l));
  assert.ok(i >= 0);
  assert.ok(log.slice(i).some((l) => /acréscimo local para refazer/.test(l)));
  // De novo: já está em dia.
  const res = atualizar({ kitDir: m.kitDir, origem: m.origem, log: silencio });
  for (const r of res) for (const p of r.pares) assert.equal(p.novos.length + p.alterados.length + p.removidos.length, 0, p.skill);
});

test("atualizar-terceiros: --commit de um pacote só; erro de origem não derruba os outros", () => {
  const m = montarTerceiros();
  assert.throws(() => atualizar({ kitDir: m.kitDir, origem: m.origem, commit: m.a2, log: silencio }), ErroAtualizar);
  const res = atualizar({ kitDir: m.kitDir, origem: m.origem, pacote: "pacote-a", commit: m.a2.slice(0, 10), log: silencio });
  assert.equal(res[0].sha, m.a2);
  fs.rmSync(path.join(m.origem, "dono", "repo-b"), { recursive: true, force: true });
  const r2 = atualizar({ kitDir: m.kitDir, origem: m.origem, log: silencio });
  assert.ok(r2.find((r) => r.entrada.pacote === "pacote-b").erro);
  assert.ok(!r2.find((r) => r.entrada.pacote === "pacote-a").erro);
});
