// palco: um terminal (PTY) por agente, controlado pela CLI `palco` através de um daemon local.
// Usa node-pty (binário nativo): sem `npm install` em palco/, a suíte pula este arquivo.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(KIT, "palco", "src", "cli.mjs");
const temDeps = fs.existsSync(path.join(KIT, "palco", "node_modules", "node-pty"));
let home, eco;

const palco = (...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args, "--json"], { encoding: "utf8", env: { ...process.env, PALCO_HOME: home }, timeout: 20000 });
  assert.equal(r.status, 0, `palco ${args.join(" ")}: ${r.stderr}`);
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
  home = fs.mkdtempSync(path.join(os.tmpdir(), "palco-"));
  eco = path.join(home, "eco.mjs");
  // Um "agente" de mentira: responde cada linha recebida, como uma CLI interativa.
  fs.writeFileSync(eco, 'process.stdin.setEncoding("utf8");process.stdout.write("pronto\\r\\n");process.stdin.on("data",(d)=>process.stdout.write("eco: "+d.trim()+"\\r\\n"));\n');
});
after(() => {
  if (!temDeps) return;
  spawnSync(process.execPath, [CLI, "parar"], { env: { ...process.env, PALCO_HOME: home }, timeout: 10000 });
  fs.rmSync(home, { recursive: true, force: true });
});

test("palco: abre um terminal, lista, manda texto, lê a tela e fecha", { skip: !temDeps && "rode npm install em palco/" }, () => {
  const { id } = palco("abrir", "--cmd", process.execPath, "--arg", eco, "--nome", "eco", "--cwd", home);
  assert.ok(id);
  const lista = palco("listar");
  const t = lista.terminais.find((x) => x.id === id);
  assert.equal(t.nome, "eco");
  assert.equal(t.estado, "rodando");
  assert.ok(esperar(() => palco("ler", id).linhas.includes("pronto")), "a tela mostra a saída do processo");

  palco("enviar", id, "roda os testes; rm -rf /"); // vai como texto para o processo, nunca por um shell
  const tela = esperar(() => {
    const l = palco("ler", id).linhas;
    return l.includes("eco: roda os testes; rm -rf /") && l;
  });
  assert.ok(tela, "o processo recebeu a linha");

  palco("fechar", id);
  const depois = esperar(() => palco("listar").terminais.find((x) => x.id === id)?.estado === "encerrado");
  assert.ok(depois, "fechado aparece como encerrado");
});

test("palco: id que não existe é erro claro, não derruba o daemon", { skip: !temDeps && "rode npm install em palco/" }, () => {
  const r = spawnSync(process.execPath, [CLI, "ler", "nao-existe", "--json"], { encoding: "utf8", env: { ...process.env, PALCO_HOME: home }, timeout: 20000 });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /terminal nao-existe não existe/);
  assert.ok(Array.isArray(palco("listar").terminais), "o daemon segue de pé");
});

test("palco: perfis das IAs conhecidas e comando livre", { skip: !temDeps && "rode npm install em palco/" }, async () => {
  const { comandoDe } = await import("../palco/src/perfis.mjs");
  for (const cli of ["claude", "codex", "gemini"]) assert.equal(comandoDe({ cli }).nome, cli);
  assert.deepEqual(comandoDe({ cmd: "aider", args: ["--yes"] }).argv.slice(-2), ["aider", "--yes"]);
  assert.throws(() => comandoDe({ cli: "inexistente" }), /CLI desconhecida: inexistente/);
});
