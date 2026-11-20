// Fala com o daemon (usado pela CLI e pelo servidor MCP). Sobe o daemon se ele não estiver de pé.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pasta, arqInfo } from "./local.mjs";

const SRC = path.dirname(fileURLToPath(import.meta.url));
const DAEMON = path.join(SRC, "daemon.mjs");

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
  if (!fs.existsSync(path.join(SRC, "..", "node_modules", "node-pty"))) throw new Error("dependências do MCP Orca ausentes: rode npm install --prefix mcp-orca na pasta do kit");
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

// Chama um método do daemon. "parar" não sobe daemon só para pará-lo.
export async function chamar(metodo, args = []) {
  if (metodo === "parar") {
    const info = await daemon({ subir: false });
    return info ? pedir(info, "parar", []) : { ok: true };
  }
  return pedir(await daemon(), metodo, args);
}
