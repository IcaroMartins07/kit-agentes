// F4: agentes dos times Dev e QA. Coerência com o kit.json, contrato de entrega e despacho pelo Maestro.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contratoDe } from "../hooks/src/plano.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kit = JSON.parse(fs.readFileSync(path.join(KIT, "kit.json"), "utf8"));
const ler = (rel) => fs.readFileSync(path.join(KIT, rel), "utf8");
// Cada agente fica na pasta do time: maestro/, dev/, qa/ ou review/.
const PASTA = { maestro: "maestro", dev: "dev", qa: "qa", revisao: "review" };
const arquivo = (nome) => `agents/${PASTA[kit.agentes[nome].time]}/${nome}.md`;

// Frontmatter simples: "chave: valor" e listas "  - item".
const frontmatter = (texto) => {
  const m = texto.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---/);
  assert.ok(m, "sem frontmatter");
  const o = {};
  let chave = null;
  for (const l of m[1].split("\n")) {
    const kv = l.match(/^(\w+):\s*(.*)$/);
    if (kv) { chave = kv[1]; o[chave] = kv[2] || []; }
    else if (/^\s+-\s+/.test(l) && chave) o[chave].push(l.replace(/^\s+-\s+/, "").trim());
  }
  return o;
};
const corpo = (texto) => texto.replace(/^---\n[\s\S]*?\n---\n/, "");

const times = Object.entries(kit.agentes).filter(([, a]) => ["dev", "qa"].includes(a.time)).map(([n]) => n);
const devs = times.filter((n) => kit.agentes[n].time === "dev");

test("o kit tem os 12 agentes de Dev e QA", () => {
  assert.equal(times.length, 12);
  assert.equal(devs.length, 7);
});

test("todo agente do kit.json tem agents/<nome>.md com name, model e effort iguais", () => {
  for (const [nome, def] of Object.entries(kit.agentes)) {
    assert.ok(fs.existsSync(path.join(KIT, arquivo(nome))), `falta ${arquivo(nome)}`);
    const fm = frontmatter(ler(arquivo(nome)));
    assert.equal(fm.name, nome, `${nome}: name`);
    assert.equal(fm.model, def.modelo, `${nome}: model`);
    if (def.esforco) assert.equal(fm.effort, def.esforco, `${nome}: effort`);
    assert.ok(typeof fm.description === "string" && fm.description.length > 40, `${nome}: description diz quando despachar`);
  }
});

test("Dev e QA rodam em worktree e podem escrever", () => {
  for (const nome of times) {
    const fm = frontmatter(ler(arquivo(nome)));
    assert.equal(fm.isolation, "worktree", `${nome}: isolation`);
    assert.ok(!kit.agentes[nome].somente_leitura, `${nome}: não pode ser somente leitura no kit`);
    const tools = fm.tools.split(",").map((x) => x.trim());
    for (const t of ["Read", "Bash", "Edit", "Write", "Skill"]) assert.ok(tools.includes(t), `${nome}: falta ${t} em tools`);
    assert.equal(fm.disallowedTools, undefined, `${nome}: sem disallowedTools`);
    assert.ok(fm.color, `${nome}: color`);
  }
});

test("skills pré-carregadas de Dev e QA existem no kit ou no superpowers", () => {
  const existentes = { "modo-deus": new Set(Object.keys(kit.skills.incluidas)), superpowers: new Set(kit.skills.do_superpowers) };
  for (const nome of times) {
    const skills = frontmatter(ler(arquivo(nome))).skills;
    assert.ok(Array.isArray(skills) && skills.length, `${nome}: sem skills pré-carregadas`);
    for (const s of skills) {
      const [plug, sk] = s.split(":");
      assert.ok(existentes[plug]?.has(sk), `${nome}: ${s} não existe`);
    }
  }
  for (const nome of ["qa-e2e", "qa-ui"]) assert.ok(frontmatter(ler(arquivo(nome))).skills.includes("modo-deus:qa-cypress"), nome);
  assert.match(kit.skills.incluidas["qa-cypress"].dono, /qa-e2e/);
});

test("o exemplo de entrega de cada agente Dev e QA passa no contrato dele", () => {
  for (const nome of times) {
    const contrato = contratoDe(nome);
    assert.ok(contrato, `${nome}: sem contrato`);
    assert.deepEqual(contrato(ler(arquivo(nome))).erros, [], nome);
  }
});

test("qa-regressao entrega no contrato de regressão; os demais, no de entrega", () => {
  assert.ok(contratoDe("qa-regressao")(ler(arquivo("qa-regressao"))).regressao);
  for (const nome of times.filter((n) => n !== "qa-regressao")) assert.ok(contratoDe(nome)(ler(arquivo(nome))).entrega, nome);
  // o contrato do Dev não aceita falhou_esperado; o do QA aceita
  const comEsperado = ler(arquivo("qa-e2e"));
  assert.match(comEsperado, /"falhou_esperado"/);
  assert.ok(contratoDe("dev-front")(comEsperado).erros.some((e) => /resultado/.test(e)));
});

test("o Maestro despacha os 12 agentes de Dev e QA", () => {
  const fm = frontmatter(ler(arquivo("maestro")));
  const despacha = fm.tools.match(/Agent\(([^)]*)\)/)[1].split(",").map((x) => x.trim());
  for (const nome of times) assert.ok(despacha.includes(`modo-deus:${nome}`), `Maestro não despacha ${nome}`);
});

test("cada Dev cita o próprio território e a convenção de branch <feature>-T<n>", () => {
  for (const nome of devs) {
    const t = corpo(ler(arquivo(nome)));
    const terr = kit.agentes[nome].territorio;
    assert.ok(t.includes(`território \`${terr}\``), `${nome}: não cita o território ${terr}`);
    assert.match(t, /git switch -C <branch da feature>-<id da tarefa> <branch da feature>/, nome);
    assert.match(t, /<feature>-T<n>/, nome);
    assert.match(t, /REGRAS\.md/, nome);
    assert.match(t, /graphify (query|affected)[^\n]*--graph <raiz>\/graphify-out\/graph\.json/, nome);
    if (kit.agentes[nome].sob_demanda) assert.match(t, /sob demanda/, `${nome}: deixar claro que é sob demanda`);
  }
});

test("QA escreve a partir dos critérios, sem ler a implementação, e não corrige código", () => {
  for (const nome of times.filter((n) => kit.agentes[n].time === "qa" && n !== "qa-regressao")) {
    const t = corpo(ler(arquivo(nome)));
    assert.match(t, /Critério, não implementação/, nome);
    assert.match(t, /Não corrija o código/, nome);
    assert.match(t, /<feature>-T<n>/, nome);
  }
  const reg = corpo(ler(arquivo("qa-regressao")));
  assert.match(reg, /git switch --detach <branch da feature>/);
  assert.match(reg, /graphify affected/);
});

test("dev-devops configura Cypress com os modelos do kit; dev-db nunca altera migração aplicada", () => {
  const devops = corpo(ler(arquivo("dev-devops")));
  assert.match(devops, /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/proprias\/qa-cypress\/modelos\/cypress\//);
  assert.ok(fs.existsSync(path.join(KIT, "skills", "proprias", "qa-cypress", "modelos", "cypress", "cypress.config.ts")));
  assert.match(corpo(ler(arquivo("dev-db"))), /Migração aplicada nunca é alterada/);
  assert.match(corpo(ler(arquivo("dev-docs"))), /humanizer/);
});

test("a skill modo-deus documenta a convenção de branch e a regressão", () => {
  const s = ler("skills/proprias/modo-deus/SKILL.md");
  assert.match(s, /<feature>-T<n>/);
  assert.match(s, /configurar Cypress/);
  assert.match(s, /modo-deus:qa-regressao/);
});
