// Medição de custo por agente a partir da transcrição: tempo ativo, espera pelo Maestro, chamadas e tokens.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { usoDaTranscricao } from "../hooks/src/custo.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const T0 = Date.parse("2026-11-18T10:00:00Z");
const em = (seg) => new Date(T0 + seg * 1000).toISOString();
const usage = (i, cw, cr, o) => ({ input_tokens: i, cache_creation_input_tokens: cw, cache_read_input_tokens: cr, output_tokens: o });

// Briefing, uma chamada de ferramenta, a resposta dividida em duas linhas com o mesmo id (o Claude Code grava
// assim), 20 min parado esperando o Maestro, e a retomada.
function transcricao() {
  const linhas = [
    { type: "user", timestamp: em(0), message: { role: "user", content: "Tarefa T2: ..." } },
    { type: "assistant", timestamp: em(10), message: { id: "m1", model: "claude-sonnet-5-5", usage: usage(10, 100, 0, 5), content: [{ type: "tool_use", id: "u1", name: "Bash", input: {} }] } },
    { type: "user", timestamp: em(70), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "u1", content: "ok" }] } },
    { type: "assistant", timestamp: em(80), message: { id: "m2", model: "claude-sonnet-5-5", usage: usage(1, 50, 100, 20), content: [{ type: "text", text: "pronto" }] } },
    { type: "assistant", timestamp: em(80), message: { id: "m2", model: "claude-sonnet-5-5", usage: usage(1, 50, 100, 20), content: [{ type: "text", text: "```json {} ```" }] } },
    { type: "user", timestamp: em(80 + 20 * 60), message: { role: "user", content: "The coordinator sent a message while you were working: rodada 2" } },
    { type: "assistant", timestamp: em(80 + 20 * 60 + 10), message: { id: "m3", model: "claude-sonnet-5-5", usage: usage(0, 0, 300, 3), content: [{ type: "text", text: "ok" }] } },
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "modo-deus-custo-"));
  const f = path.join(dir, "agent-x.jsonl");
  fs.writeFileSync(f, linhas.map((l) => JSON.stringify(l)).join("\n") + "\n{linha cortada");
  return f;
}

test("custo: separa tempo ativo da espera pelo Maestro e não conta duas vezes a mesma mensagem", () => {
  const u = usoDaTranscricao(transcricao());
  assert.equal(u.minutos, 21.5);
  assert.equal(u.minutos_espera, 20);
  assert.equal(u.minutos_ativos, 1.5);
  assert.equal(u.chamadas, 1);
  assert.deepEqual(u.tokens, { entrada: 11, cache_escrito: 150, cache_lido: 400, saida: 28 });
  assert.equal(u.contexto_max, 300);
  assert.equal(u.modelo, "claude-sonnet-5-5");
});

test("custo: a ferramenta resume a sessão por agente, com o tipo do meta e o total", () => {
  const sessao = transcricao(); // a "sessão principal"
  const sub = path.join(path.dirname(sessao), "agent-x", "subagents");
  fs.mkdirSync(sub, { recursive: true });
  fs.copyFileSync(sessao, path.join(sub, "agent-a1.jsonl"));
  fs.writeFileSync(path.join(sub, "agent-a1.meta.json"), JSON.stringify({ agentType: "modo-deus:dev-front" }));
  const r = spawnSync(process.execPath, [path.join(KIT, "hooks", "ferramentas", "custo.mjs"), sessao, "--json"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const { agentes, total } = JSON.parse(r.stdout);
  assert.deepEqual(agentes.map((a) => a.agente), ["principal", "dev-front"]);
  assert.equal(total.tokens.cache_lido, 800);
  assert.equal(total.minutos_ativos, 3);
});

test("custo: transcrição que não existe não derruba", () => {
  assert.equal(usoDaTranscricao(path.join(os.tmpdir(), "nao-existe.jsonl")), null);
});

test("custo: o SubagentStop grava o uso do agente na telemetria", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "modo-deus-custo-repo-"));
  spawnSync("git", ["init", "-q", repo]);
  fs.mkdirSync(path.join(repo, ".modo-deus"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".modo-deus", "config.json"), JSON.stringify({ perfil: "estrito" }));
  const r = spawnSync(process.execPath, [path.join(KIT, "hooks", "src", "evento.mjs")], {
    input: JSON.stringify({ session_id: "s1", cwd: repo, hook_event_name: "SubagentStop", agent_type: "Explore", agent_id: "x", agent_transcript_path: transcricao(), last_assistant_message: "achei" }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  const dir = path.join(repo, ".modo-deus", "telemetria");
  const ev = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".jsonl"))), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const stop = ev.find((e) => e.evento === "SubagentStop");
  assert.equal(stop.uso.minutos_ativos, 1.5);
  assert.equal(stop.uso.tokens.cache_lido, 400);
  fs.rmSync(repo, { recursive: true, force: true });
});
