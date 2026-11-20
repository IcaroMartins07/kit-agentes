#!/usr/bin/env node
// MCP Orca: terminais de agentes (claude, codex, gemini ou qualquer comando) controlados pela linha de comando.
//
//   mcp-orca abrir (--cli claude|codex|gemini | --cmd <comando> [--arg <a>]...) [--nome <n>] [--cwd <pasta>]
//   mcp-orca listar
//   mcp-orca ler <id> [--linhas <n>]
//   mcp-orca enviar <id> <texto> [--sem-enter]
//   mcp-orca fechar <id>
//   mcp-orca parar                     encerra o daemon e todos os terminais
//   --json em qualquer comando: saída em JSON (para o painel e o MCP)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pasta, arqInfo } from "./local.mjs";

const DAEMON = path.join(path.dirname(fileURLToPath(import.meta.url)), "daemon.mjs");

function opcoes(argv) {
  const o = { pos: [], args: [], json: false, enter: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valor = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} precisa de um valor`);
      return v;
    };
    if (a === "--json") o.json = true;
    else if (a === "--sem-enter") o.enter = false;
    else if (a === "--arg") o.args.push(valor());
    else if (["--cli", "--cmd", "--nome", "--cwd", "--linhas"].includes(a)) o[a.slice(2)] = valor();
    else if (a.startsWith("--")) throw new Error(`opção desconhecida: ${a}`);
    else o.pos.push(a);
  }
  return o;
}

function pedir(info, metodo, args) {
  return new Promise((ok, falha) => {
    const req = http.request({ socketPath: info.endereco, path: "/", method: "POST", headers: { "x-mcp-orca-token": info.token } }, (res) => {
      let corpo = "";
      res.on("data", (c) => (corpo += c));
      res.on("end", () => {
        try {
          const r = JSON.parse(corpo);
          r.ok ? ok(r.valor) : falha(new Error(r.erro));
        } catch {
          falha(new Error(`resposta inválida do daemon (HTTP ${res.statusCode})`));
        }
      });
    });
    req.on("error", falha);
    req.end(JSON.stringify({ metodo, args }));
  });
}

const lerInfo = () => { try { return JSON.parse(fs.readFileSync(arqInfo(), "utf8")); } catch { return null; } };
const vivo = async (info) => !!info && (await pedir(info, "listar", []).then(() => true, () => false));

async function daemon({ subir = true } = {}) {
  let info = lerInfo();
  if (await vivo(info)) return info;
  if (!subir) return null;
  fs.mkdirSync(pasta(), { recursive: true });
  try { fs.rmSync(arqInfo()); } catch { /* sem daemon antigo */ }
  const log = fs.openSync(path.join(pasta(), "daemon.log"), "a");
  spawn(process.execPath, [DAEMON], { detached: true, stdio: ["ignore", log, log], windowsHide: true, env: process.env }).unref();
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    info = lerInfo();
    if (await vivo(info)) return info;
  }
  throw new Error(`o daemon não subiu; veja ${path.join(pasta(), "daemon.log")}`);
}

async function main() {
  const [verbo, ...resto] = process.argv.slice(2);
  const o = opcoes(resto);
  const id = o.pos[0];
  const precisaId = () => { if (!id) throw new Error(`uso: mcp-orca ${verbo} <id>`); return id; };
  let valor;
  if (verbo === "parar") {
    const info = await daemon({ subir: false });
    valor = info ? await pedir(info, "parar", []) : { ok: true };
  } else {
    const info = await daemon();
    if (verbo === "abrir") valor = await pedir(info, "abrir", [{ cli: o.cli, cmd: o.cmd, args: o.args, cwd: o.cwd && path.resolve(o.cwd), nome: o.nome }]);
    else if (verbo === "listar") valor = await pedir(info, "listar", []);
    else if (verbo === "ler") valor = await pedir(info, "ler", [precisaId(), o.linhas ? { linhas: Number(o.linhas) } : {}]);
    else if (verbo === "enviar") {
      if (o.pos.length < 2) throw new Error("uso: mcp-orca enviar <id> <texto>");
      valor = await pedir(info, "enviar", [precisaId(), o.pos.slice(1).join(" "), { enter: o.enter }]);
    } else if (verbo === "fechar") valor = await pedir(info, "fechar", [precisaId()]);
    else throw new Error("uso: mcp-orca abrir|listar|ler|enviar|fechar|parar (veja o topo de mcp-orca/src/cli.mjs)");
  }
  if (o.json) console.log(JSON.stringify(valor));
  else if (verbo === "listar") for (const t of valor.terminais) console.log(`${t.id}\t${t.estado}\t${t.nome}\t${t.cwd}`);
  else if (verbo === "ler") console.log(valor.linhas.join("\n"));
  else if (verbo === "abrir") console.log(valor.id);
}

main().catch((e) => {
  console.error(`erro: ${e.message}`);
  process.exitCode = 1;
});
