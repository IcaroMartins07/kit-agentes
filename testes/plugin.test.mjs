// Coerência entre kit.json, plugin.json e os arquivos do kit.
// Substitui os cenários da v1 de "skill global copiada" e "comando copiado": agora quem entrega é o plugin.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (f) => JSON.parse(fs.readFileSync(path.join(KIT, f), "utf8"));
const kit = json("kit.json");
const plugin = json(".claude-plugin/plugin.json");
const mkt = json(".claude-plugin/marketplace.json");

test("versões alinhadas entre kit, plugin e marketplace", () => {
  assert.equal(plugin.version, kit.versao);
  assert.equal(mkt.plugins.find((p) => p.name === "modo-deus").version, kit.versao);
});

test("plugin.json lista exatamente as skills incluídas no kit.json", () => {
  const esperado = Object.values(kit.skills.incluidas).map((s) => "./" + s.caminho).sort();
  assert.deepEqual([...plugin.skills].sort(), esperado);
});

test("cada skill incluída existe e o name do SKILL.md bate com a chave", () => {
  for (const [nome, s] of Object.entries(kit.skills.incluidas)) {
    const f = path.join(KIT, s.caminho, "SKILL.md");
    assert.ok(fs.existsSync(f), `falta ${f}`);
    const m = fs.readFileSync(f, "utf8").match(/^name:\s*(.+)$/m);
    assert.equal(m?.[1].trim(), nome);
  }
});

test("nenhuma skill excluída entra no plugin", () => {
  const nomes = plugin.skills.map((p) => path.basename(p));
  for (const ex of Object.keys(kit.skills.excluidas)) assert.ok(!nomes.includes(ex), ex);
});

test("comandos não apontam para caminhos ou skills da v1", () => {
  for (const f of fs.readdirSync(path.join(KIT, "commands"))) {
    const t = fs.readFileSync(path.join(KIT, "commands", f), "utf8");
    assert.doesNotMatch(t, /\.claude\/fluxo\//, f);
    for (const ex of Object.keys(kit.skills.excluidas)) assert.doesNotMatch(t, new RegExp(`(?<![:\\w-])${ex}(?![\\w-])`), `${f} cita ${ex}`);
  }
});

test("todo agente tem modelo e time; Dev e QA têm esforço para tarefa complexa", () => {
  for (const [n, a] of Object.entries(kit.agentes)) {
    assert.ok(["opus", "sonnet", "haiku"].includes(a.modelo), n);
    if (["dev", "qa"].includes(a.time)) assert.equal(a.esforco_complexa, "high", n);
  }
  assert.equal(kit.agentes.maestro.modelo, "opus");
  assert.equal(kit.agentes.revisor.modelo, "sonnet");
  assert.equal(kit.agentes.revisor.esforco, "high");
});

test("claude plugin validate passa (pula se o CLI não existir)", (t) => {
  let saida;
  try {
    saida = execFileSync("claude", ["plugin", "validate", "--strict", path.join(KIT, ".claude-plugin", "plugin.json")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  } catch (e) {
    if (e.code === "ENOENT" || /not recognized|não é reconhecido/.test(String(e.stderr))) return t.skip("claude CLI ausente");
    assert.fail(String(e.stdout) + String(e.stderr));
  }
  assert.match(saida, /Validation passed/);
});
