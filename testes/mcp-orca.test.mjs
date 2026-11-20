// MCP Orca: um terminal (PTY) por agente, controlado pela CLI `mcp-orca` através de um daemon local.
// Usa node-pty (binário nativo): sem `npm install` em mcp-orca/, a suíte pula este arquivo.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(KIT, "mcp-orca", "src", "cli.mjs");
const temDeps = fs.existsSync(path.join(KIT, "mcp-orca", "node_modules", "node-pty"));
let home, eco;

const orca = (...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args, "--json"], { encoding: "utf8", env: { ...process.env, MCP_ORCA_HOME: home }, timeout: 20000 });
  assert.equal(r.status, 0, `mcp-orca ${args.join(" ")}: ${r.stderr}`);
  return JSON.parse(r.stdout);
};
const esperar = (cond, ms = 8000) => {
  const fim = Date.now() + ms;
  for (;;) {
    const v = cond();
    if (v) return v;
    if (Date.now() > fim) return null;
    spawnSync(process.execPath, ["-e", "setTimeout(()=>{},150)"]);
  }
};

before(() => {
  if (!temDeps) return;
  home = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-orca-"));
  eco = path.join(home, "eco.mjs");
  // Um "agente" de mentira: responde cada linha recebida, como uma CLI interativa.
  fs.writeFileSync(eco, 'process.stdin.setEncoding("utf8");process.stdout.write("pronto\\r\\n");process.stdin.on("data",(d)=>process.stdout.write("eco: "+d.trim()+"\\r\\n"));\n');
});
after(() => {
  if (!temDeps) return;
  spawnSync(process.execPath, [CLI, "parar"], { env: { ...process.env, MCP_ORCA_HOME: home }, timeout: 10000 });
  fs.rmSync(home, { recursive: true, force: true });
});

test("MCP Orca: abre um terminal, lista, manda texto, lê a tela e fecha", { skip: !temDeps && "rode npm install em mcp-orca/" }, () => {
  const { id } = orca("abrir", "--cmd", process.execPath, "--arg", eco, "--nome", "eco", "--cwd", home);
  assert.ok(id);
  const lista = orca("listar");
  const t = lista.terminais.find((x) => x.id === id);
  assert.equal(t.nome, "eco");
  assert.equal(t.estado, "rodando");
  assert.ok(esperar(() => orca("ler", id).linhas.includes("pronto")), "a tela mostra a saída do processo");

  orca("enviar", id, "roda os testes; rm -rf /"); // vai como texto para o processo, nunca por um shell
  const tela = esperar(() => {
    const l = orca("ler", id).linhas;
    return l.includes("eco: roda os testes; rm -rf /") && l;
  });
  assert.ok(tela, "o processo recebeu a linha");

  orca("fechar", id);
  const depois = esperar(() => orca("listar").terminais.find((x) => x.id === id)?.estado === "encerrado");
  assert.ok(depois, "fechado aparece como encerrado");
});

test("MCP Orca: id que não existe é erro claro, não derruba o daemon", { skip: !temDeps && "rode npm install em mcp-orca/" }, () => {
  const r = spawnSync(process.execPath, [CLI, "ler", "nao-existe", "--json"], { encoding: "utf8", env: { ...process.env, MCP_ORCA_HOME: home }, timeout: 20000 });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /terminal nao-existe não existe/);
  assert.ok(Array.isArray(orca("listar").terminais), "o daemon segue de pé");
});

test("MCP Orca: perfis das IAs conhecidas e comando livre", { skip: !temDeps && "rode npm install em mcp-orca/" }, async () => {
  const { comandoDe } = await import("../mcp-orca/src/perfis.mjs");
  for (const cli of ["claude", "codex", "gemini"]) assert.equal(comandoDe({ cli }).nome, cli);
  assert.deepEqual(comandoDe({ cmd: "aider", args: ["--yes"] }).argv.slice(-2), ["aider", "--yes"]);
  assert.throws(() => comandoDe({ cli: "inexistente" }), /CLI desconhecida: inexistente/);
});
