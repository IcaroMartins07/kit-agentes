// F6: retrospectiva determinística (coleta, causas, proposta, PENDENTE) e estrutura dos evals.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { coletar, concluir, escreverProposta, falsosPositivos, MAX_EXEMPLOS } from "../hooks/src/retro.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RETRO = path.join(KIT, "hooks", "src", "retro.mjs");

function projeto() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "retro-"));
  fs.mkdirSync(path.join(raiz, ".claude", "modo-deus", "telemetria"), { recursive: true });
  fs.writeFileSync(path.join(raiz, ".claude", "modo-deus", "config.json"), JSON.stringify({ perfil: "estrito" }));
  return raiz;
}
const gravarDia = (raiz, dia, eventos) =>
  fs.writeFileSync(path.join(raiz, ".claude", "modo-deus", "telemetria", `${dia}.jsonl`), eventos.map((e) => JSON.stringify(e)).join("\n") + "\n");

const ev = (dia, i, campos) => ({ ts: `${dia}T10:00:${String(i).padStart(2, "0")}.000Z`, sessao: "s1", evento: "PreToolUse", agente: "dev-front", ...campos });

function cenario() {
  const raiz = projeto();
  const d1 = "2026-11-10";
  const d2 = "2026-11-12";
  const dia1 = [
    // 7 bloqueios V1 de dev-front: exemplos devem parar em 5
    ...Array.from({ length: 7 }, (_, i) => ev(d1, i, { ferramenta: "Edit", alvo: `src/fora${i}.ts`, resultado: "bloqueado", regra: "V1", motivo: "fora do escopo da T1" })),
    ev(d1, 10, { ferramenta: "Edit", alvo: "src/app.ts", resultado: "bloqueado", regra: "trava", motivo: "sem plano aprovado" }),
    ev(d1, 11, { agente: "qa-unit", ferramenta: "Read", alvo: "src/app.ts", resultado: "ok", regra: "V10", motivo: "QA lendo implementação" }),
    ev(d1, 12, { agente: "revisor", evento: "SubagentStop", resultado: "bloqueado", regra: "contrato", motivo: "falta veredito" }),
    ev(d1, 13, { agente: "revisor", evento: "SubagentStop", resultado: "contrato_falhou", motivo: "falta veredito" }),
    ev(d1, 14, { ferramenta: "Bash", alvo: "npm run x", resultado: "erro_hook", motivo: "boom" }),
    ev(d1, 15, { ferramenta: "Edit", alvo: "src/a.ts", resultado: "ok", regra: null }),
  ];
  gravarDia(raiz, d1, dia1);
  // dia 2, outra sessão: falso positivo suspeito (V3 2x no mesmo alvo, depois Edit ok em outro alvo)
  gravarDia(raiz, d2, [
    ev(d2, 1, { sessao: "s2", agente: "dev-back", ferramenta: "Edit", alvo: "src/api/x.ts", resultado: "bloqueado", regra: "V3", motivo: "old_string não encontrado" }),
    ev(d2, 2, { sessao: "s2", agente: "dev-back", ferramenta: "Edit", alvo: "src/api/x.ts", resultado: "bloqueado", regra: "V3", motivo: "old_string não encontrado" }),
    ev(d2, 3, { sessao: "s2", agente: "dev-back", ferramenta: "Edit", alvo: "src/api/y.ts", resultado: "ok", regra: null }),
    ev(d2, 4, { sessao: "s2", agente: "dev-back", ferramenta: "Bash", alvo: "npm test", resultado: "ok", regra: "V7", motivo: "mesma ação 4x" }),
  ]);
  fs.appendFileSync(path.join(raiz, ".claude", "modo-deus", "telemetria", `${d2}.jsonl`), "isto não é json\n");
  fs.writeFileSync(path.join(raiz, ".claude", "modo-deus", "plano.json"), JSON.stringify({
    versao: 1, pedido: "x", status: "revisao",
    tarefas: [
      { id: "T1", titulo: "campo novo", time: "dev-front", classe: "simples", esforco: "high", status: "reprovada", rodadas_revisao: 1 },
      { id: "T2", titulo: "migração", time: "dev-db", classe: "complexa", esforco: "high", status: "concluida", rodadas_revisao: 2 },
      { id: "T3", titulo: "texto", time: "dev-front", classe: "simples", esforco: "medium", status: "concluida" },
    ],
    itens_revisao: [
      { id: "R1", tarefa: "T1", gravidade: "alta", motivo: "quebra o contrato da API", status: "aberto" },
      { id: "R2", tarefa: "T2", gravidade: "media", motivo: "falta índice", status: "resolvido" },
      { id: "R3", tarefa: "T1", gravidade: "baixa", motivo: "nome", status: "aberto" },
    ],
  }));
  return raiz;
}

test("coletar agrega totais por regra e por agente", () => {
  const r = coletar(cenario());
  assert.equal(r.eventos, 17);
  assert.deepEqual(r.sessoes, ["s1", "s2"]);
  assert.deepEqual(r.totais.por_regra.V1, { bloqueios: 7, alertas: 0, contrato_falhou: 0, total: 7 });
  assert.equal(r.totais.por_regra.V10.alertas, 1);
  assert.equal(r.totais.por_regra.contrato.bloqueios, 1);
  assert.equal(r.totais.por_regra.contrato.contrato_falhou, 1);
  assert.equal(r.totais.erros_hook, 1);
  assert.equal(r.totais.por_agente["dev-front"].bloqueios, 8);
  assert.equal(r.totais.por_agente.revisor.contrato_falhou, 1);
  assert.equal(r.contrato_falhou.revisor.total, 1);
});

test("exemplos limitados a 5 por causa, com alvo e motivo", () => {
  const r = coletar(cenario());
  const v1 = r.bloqueios.find((b) => b.regra === "V1");
  assert.equal(v1.total, 7);
  assert.equal(v1.exemplos.length, MAX_EXEMPLOS);
  assert.equal(v1.exemplos[0].alvo, "src/fora0.ts");
  assert.equal(v1.exemplos[0].motivo, "fora do escopo da T1");
  const fuga = r.causas.find((c) => c.causa === "fuga");
  assert.equal(fuga.total, 8); // 7 V1 + 1 V10
  assert.equal(fuga.exemplos.length, MAX_EXEMPLOS);
  assert.equal(r.causas[0].causa, "fuga"); // ordenado pelo total
});

test("causas: trava, contrato, alucinação, loop e falso positivo", () => {
  const r = coletar(cenario());
  const causa = (n) => r.causas.find((c) => c.causa === n);
  assert.equal(causa("skill_nao_disparou").total, 1);
  assert.equal(causa("instrucao_ambigua").total, 2);
  assert.equal(causa("alucinacao").total, 2);
  assert.equal(causa("loop_estouro").total, 1);
  const fp = causa("falso_positivo_suspeito");
  assert.equal(fp.total, 1);
  assert.equal(fp.exemplos[0].regra, "V3");
  assert.equal(fp.exemplos[0].sucesso.alvo, "src/api/y.ts");
  assert.equal(causa("passo_pulado"), undefined); // sem V5/V6, a causa não aparece
});

test("falso positivo exige dois bloqueios no mesmo alvo e sucesso depois", () => {
  const base = { sessao: "s", agente: "a", ferramenta: "Edit" };
  const b = { ...base, alvo: "x", resultado: "bloqueado", regra: "V1" };
  assert.equal(falsosPositivos([b, { ...base, alvo: "y", resultado: "ok" }]).length, 0);
  assert.equal(falsosPositivos([b, b]).length, 0);
  assert.equal(falsosPositivos([b, b, { ...base, alvo: "y", resultado: "ok" }]).length, 1);
  assert.equal(falsosPositivos([b, b, { ...base, agente: "outro", alvo: "y", resultado: "ok" }]).length, 0);
});

test("plano: reprovadas, rodadas, itens abertos por gravidade e V11", () => {
  const r = coletar(cenario());
  assert.deepEqual(r.plano.tarefas_reprovadas.map((t) => t.id), ["T1", "T2"]);
  assert.deepEqual(r.plano.rodadas_revisao, { T1: 1, T2: 2 });
  assert.deepEqual(r.plano.itens_abertos, { alta: 1, media: 0, baixa: 1 });
  assert.deepEqual(r.plano.v11.map((t) => t.id), ["T1"]);
  assert.ok(r.plano.v11[0].itens.some((i) => i.includes("quebra o contrato")));
  const esf = r.causas.find((c) => c.causa === "esforco_errado");
  assert.equal(esf.total, 1);
  assert.deepEqual(esf.regras, ["V11"]);
});

test("filtro por sessão e por data", () => {
  const raiz = cenario();
  const s2 = coletar(raiz, { sessao: "s2" });
  assert.equal(s2.eventos, 4);
  assert.deepEqual(s2.sessoes, ["s2"]);
  assert.equal(s2.totais.por_regra.V1, undefined);
  const desde = coletar(raiz, { desde: "2026-11-11" });
  assert.equal(desde.eventos, 4);
  assert.equal(coletar(raiz, { desde: "2026-11-13" }).eventos, 0);
  assert.throws(() => coletar(raiz, { desde: "11/11/2026" }), /AAAA-MM-DD/);
});

test("projeto sem telemetria nem plano retorna vazio sem erro", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "retro-vazio-"));
  const r = coletar(raiz);
  assert.equal(r.eventos, 0);
  assert.equal(r.vazio, true);
  assert.deepEqual(r.causas, []);
  assert.equal(r.plano.existe, false);
  assert.equal(r.pendente, null);
  assert.deepEqual(r.graphify, { licoes: null, memoria: null });
});

test("lições e memória do graphify entram quando existem", () => {
  const raiz = projeto();
  fs.mkdirSync(path.join(raiz, "graphify-out", "reflections"), { recursive: true });
  fs.mkdirSync(path.join(raiz, "graphify-out", "memory"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "graphify-out", "reflections", "LESSONS.md"), "# Lições\n- consulte auth antes\n");
  fs.writeFileSync(path.join(raiz, "graphify-out", "memory", "q1.json"), JSON.stringify({ outcome: "dead_end" }));
  fs.writeFileSync(path.join(raiz, "graphify-out", "memory", "q2.json"), JSON.stringify({ outcome: "useful" }));
  const r = coletar(raiz);
  assert.match(r.graphify.licoes, /consulte auth/);
  assert.deepEqual(r.graphify.memoria, { arquivos: 2, useful: 1, dead_end: 1, corrected: 0 });
});

test("PENDENTE.json é lido pela coleta e apagado por concluir", () => {
  const raiz = projeto();
  const dir = path.join(raiz, ".claude", "modo-deus", "retro");
  fs.mkdirSync(dir, { recursive: true });
  const pend = { sessao: "s9", ts: "2026-11-14T10:00:00Z", alertas: 3, bloqueios: 1, regras: { V3: 2, V1: 1 } };
  fs.writeFileSync(path.join(dir, "PENDENTE.json"), JSON.stringify(pend));
  assert.deepEqual(coletar(raiz).pendente, pend);
  assert.equal(concluir(raiz), true);
  assert.equal(fs.existsSync(path.join(dir, "PENDENTE.json")), false);
  assert.equal(concluir(raiz), false);
});

test("proposta gera o esqueleto com causa, evidência, alvo, diff e plano de eval", () => {
  const raiz = cenario();
  const saida = path.join(raiz, ".claude", "modo-deus", "retro", "2026-11-15-esforco.md");
  escreverProposta(saida, { causa: "esforco_errado", dados: coletar(raiz), data: "2026-11-15" });
  const t = fs.readFileSync(saida, "utf8");
  for (const s of ["## Causa", "## Evidência", "## Alvo da mudança", "## Diff sugerido", "## Plano de eval", "## Decisão"]) assert.ok(t.includes(s), s);
  assert.match(t, /esforco_errado/);
  assert.match(t, /"T1"/);
  assert.match(t, /```diff\n```/);
  assert.match(t, /evals\/regressao\/2026-11-15-/);
  assert.throws(() => escreverProposta(saida, {}), /já existe/);
});

test("CLI: coletar, proposta e concluir", () => {
  const raiz = cenario();
  const semProjeto = { ...process.env };
  delete semProjeto.CLAUDE_PROJECT_DIR;
  const rodar = (...a) => spawnSync(process.execPath, [RETRO, ...a], { encoding: "utf8", cwd: raiz, env: semProjeto });
  const c = rodar("coletar", raiz, "--sessao", "s2");
  assert.equal(c.status, 0, c.stderr);
  assert.equal(JSON.parse(c.stdout).eventos, 4);
  const cwd = rodar("coletar", "--desde=2026-11-12");
  assert.equal(JSON.parse(cwd.stdout).eventos, 4); // raiz achada pelo config.json a partir do cwd
  const saida = path.join(raiz, "prop.md");
  const p = rodar("proposta", saida, "--raiz", raiz);
  assert.equal(p.status, 0, p.stderr);
  assert.match(fs.readFileSync(saida, "utf8"), /# Retro .* · fuga/);
  assert.equal(rodar("coletar", raiz, "--desde", "ontem").status, 1);
  assert.match(rodar("concluir", raiz).stdout, /nada pendente/);
});

// ---------- evals ----------
test("evals: cada caso tem prompt.md e pelo menos um grader com type válido", () => {
  const dir = path.join(KIT, "evals");
  const casos = [];
  const varrer = (d) => {
    for (const it of fs.readdirSync(d, { withFileTypes: true })) {
      if (!it.isDirectory() || it.name === "results") continue;
      const p = path.join(d, it.name);
      if (fs.existsSync(path.join(p, "prompt.md"))) casos.push(p);
      else varrer(p);
    }
  };
  varrer(dir);
  assert.ok(casos.length >= 2, "pelo menos dois casos");
  const tipos = ["regex", "tool_used", "tool_order", "file_exists", "llm", "baseline"];
  for (const c of casos) {
    const prompt = fs.readFileSync(path.join(c, "prompt.md"), "utf8");
    assert.match(prompt, /^---\r?\n[\s\S]*?\r?\n---\r?\n\s*\S/, `${c}: frontmatter + corpo`);
    const graders = fs.readdirSync(path.join(c, "graders")).filter((f) => f.endsWith(".md"));
    assert.ok(graders.length, `${c}: sem graders`);
    for (const g of graders) {
      const m = fs.readFileSync(path.join(c, "graders", g), "utf8").match(/^---\r?\n[\s\S]*?^type:\s*(\S+)/m);
      assert.ok(m && tipos.includes(m[1]), `${c}/${g}: type inválido`);
    }
  }
});

test("integração F5×F6: depois do /retro, o Stop da mesma sessão não recria o PENDENTE com o que já foi visto", async () => {
  const { ocorrencia, marcarPendente } = await import("../hooks/src/vigia.mjs");
  const raiz = projeto();
  ocorrencia(raiz, "s9", { tipo: "bloqueio", regra: "V9", agente: "principal" });
  assert.equal(marcarPendente(raiz, "s9").bloqueios, 1);
  assert.equal(concluir(raiz), true);
  assert.ok(fs.existsSync(path.join(raiz, ".claude", "modo-deus", "retro", "ULTIMA.json")));
  await new Promise((r) => setTimeout(r, 5)); // ts de ocorrência e de corte são ISO com milissegundos
  assert.equal(marcarPendente(raiz, "s9"), null, "nada novo desde a retro");
  ocorrencia(raiz, "s9", { tipo: "alerta", regra: "V4", agente: "dev-back" });
  const p = marcarPendente(raiz, "s9");
  assert.equal(p.alertas, 1);
  assert.equal(p.bloqueios, 0);
  fs.rmSync(raiz, { recursive: true, force: true });
});
