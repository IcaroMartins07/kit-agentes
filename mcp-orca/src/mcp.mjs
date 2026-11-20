#!/usr/bin/env node
// Servidor MCP do MCP Orca (stdio, JSON-RPC uma mensagem por linha): o Claude lista, abre, lê, manda texto e
// fecha os terminais dos agentes pelo daemon. Sem SDK: são cinco ferramentas e o protocolo básico.
//
// Pelo MCP só abre IA conhecida (claude, codex, gemini). Ferramenta MCP não passa pelos hooks do kit (cerca,
// território), então comando livre fica só na CLI, nas mãos do usuário.
import readline from "node:readline";
import { chamar } from "./cliente.mjs";
import { PERFIS } from "./perfis.mjs";

const VERSOES = ["2024-11-05", "2025-03-26", "2025-06-18"];
const id = { type: "string", description: "id do terminal (t1, t2…), de terminais_listar" };

const FERRAMENTAS = [
  {
    name: "terminais_listar",
    description: "Lista os terminais de agentes do MCP Orca: id, nome, CLI, pasta, estado (rodando ou encerrado).",
    inputSchema: { type: "object", properties: {} },
    rodar: () => chamar("listar"),
  },
  {
    name: "terminal_abrir",
    description: "Abre um terminal novo com uma IA (claude, codex ou gemini) numa pasta e devolve o id. A IA começa como se você a tivesse aberto no terminal; ela pode perguntar se confia na pasta.",
    inputSchema: {
      type: "object",
      properties: {
        cli: { type: "string", enum: Object.keys(PERFIS) },
        cwd: { type: "string", description: "pasta absoluta onde a IA roda" },
        nome: { type: "string", description: "nome curto para achar o terminal depois (ex.: front, revisor)" },
      },
      required: ["cli", "cwd"],
      additionalProperties: false,
    },
    rodar: ({ cli, cwd, nome, ...resto }) => {
      if (Object.keys(resto).length) throw new Error(`pelo MCP só abre IA conhecida, com cli, cwd e nome; ${Object.keys(resto).join(", ")} não vale (comando livre é pela CLI mcp-orca)`);
      if (!PERFIS[cli]) throw new Error(`cli deve ser uma de: ${Object.keys(PERFIS).join(", ")}`);
      return chamar("abrir", [{ cli, cwd, nome }]);
    },
  },
  {
    name: "terminal_ler",
    description: "Lê a tela atual de um terminal, como ela aparece (sem cores). Use para ver o que o agente respondeu ou se está esperando você.",
    inputSchema: { type: "object", properties: { id, linhas: { type: "integer", minimum: 1, description: "últimas N linhas (padrão: a tela)" } }, required: ["id"] },
    rodar: async ({ id: t, linhas }) => {
      const v = await chamar("ler", [t, linhas ? { linhas } : {}]);
      return `[${v.id} · ${v.estado}]\n${v.linhas.join("\n")}`;
    },
  },
  {
    name: "terminal_enviar",
    description: "Digita um texto no terminal e aperta Enter (enter: false para não apertar). O texto vai direto para a IA do terminal, sem passar por shell.",
    inputSchema: { type: "object", properties: { id, texto: { type: "string" }, enter: { type: "boolean" } }, required: ["id", "texto"] },
    rodar: ({ id: t, texto, enter = true }) => chamar("enviar", [t, texto, { enter }]),
  },
  {
    name: "terminal_fechar",
    description: "Encerra o processo de um terminal.",
    inputSchema: { type: "object", properties: { id }, required: ["id"] },
    rodar: ({ id: t }) => chamar("fechar", [t]),
  },
];

const responder = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");

async function tratar(msg) {
  const { id: rid, method, params = {} } = msg;
  if (rid === undefined) return; // notificação (notifications/initialized etc.)
  if (method === "initialize") {
    const v = VERSOES.includes(params.protocolVersion) ? params.protocolVersion : VERSOES.at(-1);
    return responder({ id: rid, result: { protocolVersion: v, capabilities: { tools: {} }, serverInfo: { name: "mcp-orca", version: "0.1.0" } } });
  }
  if (method === "ping") return responder({ id: rid, result: {} });
  if (method === "tools/list") return responder({ id: rid, result: { tools: FERRAMENTAS.map(({ rodar, ...f }) => f) } });
  if (method === "tools/call") {
    const f = FERRAMENTAS.find((x) => x.name === params.name);
    if (!f) return responder({ id: rid, error: { code: -32602, message: `ferramenta desconhecida: ${params.name}` } });
    try {
      const v = await f.rodar(params.arguments || {});
      return responder({ id: rid, result: { content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v) }] } });
    } catch (e) {
      return responder({ id: rid, result: { content: [{ type: "text", text: e.message }], isError: true } });
    }
  }
  responder({ id: rid, error: { code: -32601, message: `método desconhecido: ${method}` } });
}

readline.createInterface({ input: process.stdin }).on("line", (l) => {
  if (!l.trim()) return;
  let msg;
  try { msg = JSON.parse(l); } catch { return responder({ id: null, error: { code: -32700, message: "JSON inválido" } }); }
  tratar(msg).catch((e) => responder({ id: msg.id ?? null, error: { code: -32603, message: e.message } }));
});
