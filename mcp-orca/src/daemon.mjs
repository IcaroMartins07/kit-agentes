// Daemon do MCP Orca: guarda os terminais vivos entre um comando e outro (e depois que a sessão do Claude fecha).
// Escuta só no endereço local e exige o token de daemon.json em cada pedido. A CLI sobe o daemon sozinha.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { criarTerminais } from "./terminais.mjs";
import { pasta, arqInfo, endereco } from "./local.mjs";

const METODOS = ["abrir", "listar", "ler", "enviar", "fechar", "parar"];
const terminais = criarTerminais();
const token = crypto.randomBytes(24).toString("hex");
const end = endereco();

const srv = http.createServer(async (req, res) => {
  if (req.headers["x-mcp-orca-token"] !== token) {
    res.writeHead(401).end();
    return;
  }
  let corpo = "";
  for await (const c of req) corpo += c;
  try {
    const { metodo, args = [] } = JSON.parse(corpo || "{}");
    if (!METODOS.includes(metodo)) throw new Error(`método desconhecido: ${metodo}`);
    if (metodo === "parar") {
      res.end(JSON.stringify({ ok: true, valor: { ok: true } }));
      encerrar();
      return;
    }
    res.end(JSON.stringify({ ok: true, valor: terminais[metodo](...args) }));
  } catch (e) {
    res.writeHead(400).end(JSON.stringify({ ok: false, erro: e.message }));
  }
});

function encerrar() {
  terminais.fecharTodos();
  try { fs.rmSync(arqInfo()); } catch { /* já saiu */ }
  srv.close();
  setTimeout(() => process.exit(0), 200);
}

fs.mkdirSync(pasta(), { recursive: true });
if (process.platform !== "win32") try { fs.rmSync(end); } catch { /* sem socket velho */ }
srv.listen(end, () => fs.writeFileSync(arqInfo(), JSON.stringify({ endereco: end, token, pid: process.pid }), { mode: 0o600 }));
process.on("SIGTERM", encerrar);
process.on("SIGINT", encerrar);
