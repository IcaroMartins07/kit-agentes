// F3: contrato do plano, contrato da Revisão e do auditor, hooks que os aplicam, e coerência dos agentes.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validarPlano, lerVeredito, lerAuditoria } from "../hooks/src/plano.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kit = JSON.parse(fs.readFileSync(path.join(KIT, "kit.json"), "utf8"));
const ler = (rel) => fs.readFileSync(path.join(KIT, rel), "utf8");
const ultimoJson = (texto) => [...texto.matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1]);

// O exemplo da própria skill é a referência de plano válido.
const exemplo = () => JSON.parse(ultimoJson(ler("skills/proprias/modo-deus/SKILL.md"))[0]);

// ---------- plano ----------
test("o plano de exemplo da skill modo-deus é válido", () => {
  assert.deepEqual(validarPlano(exemplo()), []);
});

const invalido = (nome, mexer, trecho) =>
  test(`plano inválido: ${nome}`, () => {
    const p = exemplo();
    mexer(p);
    const erros = validarPlano(p, { config: { times: { "dev-mobile": "desligado" } } });
    assert.ok(erros.some((e) => e.includes(trecho)), `esperava "${trecho}" em: ${JSON.stringify(erros)}`);
  });

invalido("esforço não bate com a classe", (p) => (p.tarefas[1].esforco = "high"), "esforco deve ser medium");
invalido("tarefa reprovada continua em medium", (p) => (p.tarefas[1].rodadas_revisao = 1), "esforco deve ser high");
invalido("time que não existe", (p) => (p.tarefas[0].time = "dev-quantico"), 'time "dev-quantico" não existe');
invalido("tarefa para a Revisão", (p) => (p.tarefas[0].time = "revisor"), "só vai para Dev ou QA");
invalido("time sob demanda desligado", (p) => (p.tarefas[0].time = "dev-mobile"), "dev-mobile está desligado");
invalido("dependência inexistente", (p) => (p.tarefas[1].depende_de = ["T9"]), "depende de T9");
invalido("dependência circular", (p) => (p.tarefas[0].depende_de = ["T2"]), "dependência circular");
invalido("paralelas com escopo sobreposto", (p) => (p.tarefas[2].escopo = ["src/server/auth/callback.ts"]), "escopo sobreposto");
invalido("critério que não existe na spec", (p) => (p.tarefas[0].criterios = ["CA7"]), "CA7 não existe");
invalido("aprovado sem data", (p) => (p.status = "aprovado"), "aprovado_em");
invalido("branch principal", (p) => (p.branch = "main"), "nunca a principal");
invalido("escopo com ..", (p) => (p.tarefas[0].escopo = ["../fora/**"]), "sem ..");
invalido("terceira rodada sem escalar", (p) => { p.tarefas[0].rodadas_revisao = 3; p.status = "revisao"; p.aprovado_em = "2026-11-15"; }, "escalado");
invalido("sem critério de aceite", (p) => (p.spec.criterios_aceite = []), "pelo menos um critério");

test("plano: dependência resolve sobreposição de escopo", () => {
  const p = exemplo();
  p.tarefas[2].escopo = ["src/server/auth/callback.ts"];
  p.tarefas[2].depende_de = ["T1"];
  assert.deepEqual(validarPlano(p), []);
});

// ---------- veredito e auditoria ----------
test("os exemplos de veredito dos revisores e do auditor seguem o contrato", () => {
  for (const f of ["agents/revisor.md", "agents/revisor-seguranca.md"]) assert.deepEqual(lerVeredito(ler(f)).erros, [], f);
  assert.deepEqual(lerAuditoria(ler("agents/auditor-de-fatos.md")).erros, []);
});

test("veredito: sem bloco, JSON quebrado, reprovado sem item grave, aprovado com item alto", () => {
  assert.match(lerVeredito("tudo certo").erros[0], /bloco ```json/);
  assert.match(lerVeredito("```json\n{ quebrado\n```").erros[0], /não é JSON válido/);
  assert.ok(lerVeredito('```json\n{"veredito":"reprovado","itens":[{"tarefa":"T1","gravidade":"baixa","arquivo":"a.ts","motivo":"nome"}]}\n```').erros.some((e) => /exige pelo menos um item/.test(e)));
  assert.ok(lerVeredito('```json\n{"veredito":"aprovado","itens":[{"tarefa":"T1","gravidade":"alta","arquivo":"a.ts","motivo":"x"}]}\n```').erros.some((e) => /não pode ter item de gravidade alta/.test(e)));
  assert.ok(lerVeredito('```json\n{"veredito":"aprovado","itens":[{"tarefa":"X","gravidade":"baixa","motivo":"x"}]}\n```').erros.length >= 2);
});

test("auditoria: confirmada sem evidência é erro", () => {
  assert.ok(lerAuditoria('```json\n{"afirmacoes":[{"texto":"x","status":"confirmada"}]}\n```').erros.some((e) => /exige evidencia/.test(e)));
});

// ---------- hooks ----------
let tmp, repo;
const git = (dir, ...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const hook = (nome, entrada) =>
  spawnSync(process.execPath, [path.join(KIT, "hooks", "src", `${nome}.mjs`)], {
    input: JSON.stringify({ session_id: "s", cwd: repo, ...entrada }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: "", MODO_DEUS_SEM_GRAPHIFY: "1" },
  });
const planoF = () => path.join(repo, ".claude", "modo-deus", "plano.json");

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "modo-deus-f3-"));
  repo = path.join(tmp, "repo");
  fs.mkdirSync(path.join(repo, ".claude", "modo-deus"), { recursive: true });
  git(repo, "init", "-q", "-b", "feat");
  fs.writeFileSync(path.join(repo, ".claude", "modo-deus", "config.json"), JSON.stringify({ perfil: "deus", times: {} }));
  fs.writeFileSync(path.join(repo, ".claude", "modo-deus", "REGRAS.md"), "# Regras\n\n## Territórios\n\n- **front**: `src/components/**`\n");
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("hook: Maestro grava plano válido; plano inválido é bloqueado com os erros", () => {
  const ok = hook("pre", { tool_name: "Write", tool_input: { file_path: planoF(), content: JSON.stringify(exemplo()) }, agent_type: "modo-deus:maestro" });
  assert.equal(ok.status, 0, ok.stderr);
  const p = exemplo();
  p.tarefas[1].esforco = "high";
  const ruim = hook("pre", { tool_name: "Write", tool_input: { file_path: planoF(), content: JSON.stringify(p) }, agent_type: "modo-deus:maestro" });
  assert.equal(ruim.status, 2);
  assert.match(ruim.stderr, /plano\.json fora do contrato/);
  assert.match(ruim.stderr, /esforco deve ser medium/);
  const quebrado = hook("pre", { tool_name: "Write", tool_input: { file_path: planoF(), content: "{ nao e json" } });
  assert.equal(quebrado.status, 2);
});

test("hook: Edit no plano é validado pelo resultado final", () => {
  fs.writeFileSync(planoF(), JSON.stringify(exemplo(), null, 2));
  const valido = hook("pre", { tool_name: "Edit", tool_input: { file_path: planoF(), old_string: '"status": "pendente"', new_string: '"status": "em_andamento"' } });
  assert.equal(valido.status, 0, valido.stderr);
  const quebra = hook("pre", { tool_name: "Edit", tool_input: { file_path: planoF(), old_string: '"classe": "simples"', new_string: '"classe": "complexa"' } });
  assert.equal(quebra.status, 2, "complexa com esforço medium");
  assert.match(quebra.stderr, /esforco deve ser high/);
});

test("hook: revisor não encerra sem veredito no formato; na segunda tentativa encerra e fica registrado", () => {
  const base = { hook_event_name: "SubagentStop", agent_type: "modo-deus:revisor", agent_id: "r1" };
  const sem = hook("evento", { ...base, last_assistant_message: "Revisei, parece tudo bem." });
  assert.equal(sem.status, 2);
  assert.match(sem.stderr, /contrato/);
  const com = hook("evento", { ...base, last_assistant_message: 'ok\n```json\n{"veredito":"aprovado","itens":[]}\n```' });
  assert.equal(com.status, 0, com.stderr);
  const laco = hook("evento", { ...base, stop_hook_active: true, last_assistant_message: "ainda sem bloco" });
  assert.equal(laco.status, 0);
  const dir = path.join(repo, ".claude", "modo-deus", "telemetria");
  const ev = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(ev.some((e) => e.resultado === "contrato_falhou" && e.agente === "revisor"));
});

test("hook: auditor também tem contrato; outros subagentes não", () => {
  assert.equal(hook("evento", { hook_event_name: "SubagentStop", agent_type: "modo-deus:auditor-de-fatos", last_assistant_message: "conferi" }).status, 2);
  assert.equal(hook("evento", { hook_event_name: "SubagentStop", agent_type: "Explore", last_assistant_message: "achei" }).status, 0);
});

// ---------- agentes ----------
const frontmatter = (f) => {
  const m = ler(f).match(/^---\n([\s\S]*?)\n---/);
  const o = {};
  let chave = null;
  for (const l of m[1].split("\n")) {
    const kv = l.match(/^(\w+):\s*(.*)$/);
    if (kv) { chave = kv[1]; o[chave] = kv[2] || []; }
    else if (/^\s+-\s+/.test(l) && chave) o[chave].push(l.replace(/^\s+-\s+/, "").trim());
  }
  return o;
};
const agentes = fs.readdirSync(path.join(KIT, "agents")).filter((f) => f.endsWith(".md"));

test("todo agente em agents/ existe no kit.json com o mesmo modelo e esforço", () => {
  assert.ok(agentes.length >= 4);
  for (const f of agentes) {
    const fm = frontmatter(`agents/${f}`);
    const def = kit.agentes[fm.name];
    assert.ok(def, `${fm.name} não está no kit.json`);
    assert.equal(fm.model, def.modelo, `${fm.name}: model`);
    assert.equal(fm.effort, def.esforco, `${fm.name}: effort`);
  }
});

test("Revisão é só leitura também nas ferramentas", () => {
  for (const n of ["revisor", "revisor-seguranca", "auditor-de-fatos"]) {
    const fm = frontmatter(`agents/${n}.md`);
    assert.doesNotMatch(fm.tools, /\b(Edit|Write|MultiEdit|NotebookEdit)\b/, n);
    assert.match(fm.disallowedTools, /Edit/, n);
  }
});

test("skills pré-carregadas existem no plugin; o Maestro só despacha agentes que existem", () => {
  const doPlugin = new Set(Object.keys(kit.skills.incluidas));
  for (const f of agentes) for (const s of frontmatter(`agents/${f}`).skills || []) {
    const [plug, nome] = s.split(":");
    assert.equal(plug, "modo-deus", s);
    assert.ok(doPlugin.has(nome), `${f}: skill ${s} não está no plugin`);
  }
  const despacha = frontmatter("agents/maestro.md").tools.match(/Agent\(([^)]*)\)/)[1].split(",").map((x) => x.trim());
  const nomes = new Set(agentes.map((f) => frontmatter(`agents/${f}`).name));
  for (const a of despacha) if (a.startsWith("modo-deus:")) assert.ok(nomes.has(a.split(":")[1]), `${a} não existe em agents/`);
});
