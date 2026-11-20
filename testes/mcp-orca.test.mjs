// MCP Orca: um terminal (PTY) por agente, controlado pela CLI `mcp-orca` através de um daemon local.
// Usa node-pty (binário nativo): sem `npm install` em mcp-orca/, a suíte pula este arquivo.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
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

  // Depois de "--", tudo é texto: uma mensagem que começa com -- não vira opção da CLI (é o que a aba do painel manda).
  const r = spawnSync(process.execPath, [CLI, "enviar", id, "--json", "--", "--help agora"], { encoding: "utf8", env: { ...process.env, MCP_ORCA_HOME: home }, timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(esperar(() => orca("ler", id).linhas.includes("eco: --help agora")), "texto depois de -- chega como texto");

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

// ---------- servidor MCP (stdio, JSON-RPC por linha) ----------
function mcp() {
  const p = spawn(process.execPath, [path.join(KIT, "mcp-orca", "src", "mcp.mjs")], { env: { ...process.env, MCP_ORCA_HOME: home }, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "", n = 0;
  const pendentes = new Map();
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!l.trim()) continue;
      const m = JSON.parse(l);
      pendentes.get(m.id)?.(m);
    }
  });
  const pedir = (method, params = {}) => new Promise((ok) => { const id = ++n; pendentes.set(id, ok); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const ferramenta = async (name, args = {}) => (await pedir("tools/call", { name, arguments: args })).result;
  return { pedir, ferramenta, notificar: (method) => p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n"), fechar: () => p.kill() };
}

test("MCP Orca: servidor MCP lista as ferramentas e comanda os terminais pelo daemon", { skip: !temDeps && "rode npm install em mcp-orca/" }, async () => {
  const s = mcp();
  try {
    const ini = await s.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "teste", version: "1" } });
    assert.equal(ini.result.serverInfo.name, "mcp-orca");
    assert.equal(ini.result.protocolVersion, "2025-06-18");
    assert.ok(ini.result.capabilities.tools);
    s.notificar("notifications/initialized");
    const nomes = (await s.pedir("tools/list")).result.tools.map((t) => t.name).sort();
    assert.deepEqual(nomes, ["terminais_listar", "terminal_abrir", "terminal_enviar", "terminal_fechar", "terminal_ler"]);

    // o agente de eco é aberto pela CLI (comando livre é do usuário); o MCP conversa com ele
    const { id } = orca("abrir", "--cmd", process.execPath, "--arg", eco, "--nome", "eco-mcp", "--cwd", home);
    const lista = JSON.parse((await s.ferramenta("terminais_listar")).content[0].text);
    assert.ok(lista.terminais.some((t) => t.id === id && t.nome === "eco-mcp"));
    assert.equal((await s.ferramenta("terminal_enviar", { id, texto: "oi do mcp" })).isError, undefined);
    let tela = "";
    for (let i = 0; i < 40 && !tela.includes("eco: oi do mcp"); i++) {
      await new Promise((r) => setTimeout(r, 150));
      tela = (await s.ferramenta("terminal_ler", { id })).content[0].text;
    }
    assert.match(tela, /eco: oi do mcp/);
    assert.equal((await s.ferramenta("terminal_fechar", { id })).isError, undefined);

    // pelo MCP só abre IA conhecida: comando livre não passa
    const livre = await s.ferramenta("terminal_abrir", { cmd: "rm", args: ["-rf", "/"] });
    assert.equal(livre.isError, true);
    assert.match(livre.content[0].text, /cli/);
    const erro = await s.ferramenta("terminal_ler", { id: "nao-existe" });
    assert.equal(erro.isError, true);
    assert.match(erro.content[0].text, /terminal nao-existe não existe/);
    assert.equal((await s.pedir("tools/call", { name: "inventada", arguments: {} })).error.code, -32602);
  } finally {
    s.fechar();
  }
});
