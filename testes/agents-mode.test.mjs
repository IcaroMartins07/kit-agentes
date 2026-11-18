// agents-mode.mjs: ordem dos passos e argumentos de cada um.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { montarPassos, ErroUso } from "../agents-mode.mjs";

test("agents-mode: instala o plugin, as dependências, o kit no projeto e confere, cada passo com os seus argumentos", () => {
  const { passos, caminho, dry } = montarPassos(["proj", "--perfil", "deus", "--escopo", "user", "--statusline", "--dry-run"]);
  assert.equal(caminho, path.resolve("proj"));
  assert.equal(dry, true);
  assert.deepEqual(passos.map((p) => p.descricao), ["registrar o marketplace do kit", "instalar o plugin modo-deus", "dependências (plugins e graphify)", "kit no projeto", "conferência (doctor)"]);
  const [, , deps, inst, doc] = passos.map((p) => p.args.slice(1));
  assert.deepEqual(deps, ["dependencias", caminho, "--escopo", "user", "--dry-run"]);
  assert.deepEqual(inst, [caminho, "--perfil", "deus", "--statusline", "--dry-run"]);
  assert.deepEqual(doc, ["doctor", caminho]);
});

test("agents-mode: com o kit já instalado, atualiza em vez de instalar de novo; opção errada é recusada", () => {
  const { passos } = montarPassos([], { marketplaces: ["kit-agentes"], plugins: ["modo-deus@kit-agentes", "temas@kit-agentes", "superpowers@claude-plugins-official"] });
  assert.deepEqual(passos[2].args, ["plugin", "update", "temas@kit-agentes"], "mod do kit instalado é atualizado; plugin de fora não");
  assert.equal(passos.filter((p) => p.descricao.startsWith("atualizar o mod")).length, 1);
  assert.deepEqual(passos[0].args, ["plugin", "marketplace", "update", "kit-agentes"]);
  assert.deepEqual(passos[1].args, ["plugin", "update", "modo-deus@kit-agentes"]);
  assert.throws(() => montarPassos(["--escopo", "global"]), ErroUso);
  assert.throws(() => montarPassos(["--perfil"]), ErroUso);
  assert.throws(() => montarPassos(["--forcar"]), ErroUso);
});
