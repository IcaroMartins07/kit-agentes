// agents-mode.mjs: ordem dos passos e argumentos de cada um.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { montarPassos, ErroUso } from "../agents-mode.mjs";

test("agents-mode: instala o plugin, as dependências, o kit no projeto e confere, cada passo com os seus argumentos", () => {
  const { passos, caminho, dry } = montarPassos(["proj", "--perfil", "deus", "--escopo", "user", "--statusline", "--enxuto", "--dry-run"]);
  assert.equal(caminho, path.resolve("proj"));
  assert.equal(dry, true);
  assert.deepEqual(passos.map((p) => p.descricao), ["registrar o marketplace do kit", "instalar o plugin modo-deus", "instalar o mod painel-agentes", "dependências (plugins e graphify)", "dependências do MCP Orca (terminais dos agentes)", "kit no projeto", "conferência (doctor)"]);
  assert.deepEqual(passos[2].args, ["plugin", "install", "painel-agentes@kit-agentes", "--scope", "user"], "o painel de agentes vem por padrão");
  // npm install (não npm ci): idempotente e não apaga o node-pty que um daemon em execução tem carregado.
  // Roda dentro de mcp-orca/ (cwd), sem --prefix: da raiz do kit, que também é pacote, o npm instalaria o kit lá dentro.
  const orca = passos[4];
  assert.equal(orca.bin, "npm");
  assert.equal(orca.args[0], "install");
  assert.ok(!orca.args.includes("--prefix"));
  assert.ok(orca.cwd.replace(/\\/g, "/").endsWith("/mcp-orca"));
  const [, , , deps, , inst, doc] = passos.map((p) => p.args.slice(1));
  assert.deepEqual(deps, ["dependencias", caminho, "--escopo", "user", "--dry-run"]);
  assert.deepEqual(inst, [caminho, "--perfil", "deus", "--statusline", "--enxuto", "--dry-run"]);
  assert.deepEqual(doc, ["doctor", caminho]);
});

test("agents-mode: com o kit já instalado, atualiza em vez de instalar de novo; opção errada é recusada", () => {
  const { passos } = montarPassos([], { marketplaces: ["kit-agentes"], plugins: ["modo-deus@kit-agentes", "painel-agentes@kit-agentes", "temas@kit-agentes", "superpowers@claude-plugins-official"] });
  assert.ok(!passos.some((p) => p.descricao === "instalar o mod painel-agentes"), "painel já instalado não é reinstalado");
  assert.deepEqual(passos.filter((p) => p.descricao.startsWith("atualizar o mod")).map((p) => p.args[2]), ["painel-agentes@kit-agentes", "temas@kit-agentes"], "mods do kit instalados são atualizados; plugin de fora não");
  assert.deepEqual(passos[0].args, ["plugin", "marketplace", "update", "kit-agentes"]);
  assert.deepEqual(passos[1].args, ["plugin", "update", "modo-deus@kit-agentes"]);
  assert.throws(() => montarPassos(["--escopo", "global"]), ErroUso);
  assert.throws(() => montarPassos(["--perfil"]), ErroUso);
  assert.throws(() => montarPassos(["--forcar"]), ErroUso);
  assert.throws(() => montarPassos(["--mods", "mod-que-nao-existe"]), ErroUso);
  assert.deepEqual(montarPassos(["--mods", "nenhum"]).mods, []);
  assert.deepEqual(montarPassos(["--mods", "todos"]).passos.filter((p) => p.descricao.startsWith("instalar o mod")).length, montarPassos(["--mods", "todos"]).mods.length);
});
