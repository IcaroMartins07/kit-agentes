// API HTTP mínima: GET /tarefas, POST /tarefas { titulo }, POST /tarefas/:id/concluir.
import http from "node:http";
import { criarLista } from "./tarefas.mjs";

const LIMITE_CORPO = 10_000;

export function criarServidor(lista = criarLista()) {
  return http.createServer(async (req, res) => {
    const responder = (status, corpo) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(corpo));
    };
    try {
      if (req.method === "GET" && req.url === "/tarefas") return responder(200, lista.listar());
      if (req.method === "POST" && req.url === "/tarefas") {
        const corpo = await lerJson(req);
        return responder(201, lista.adicionar(corpo.titulo));
      }
      const concluir = /^\/tarefas\/(\d+)\/concluir$/.exec(req.url ?? "");
      if (req.method === "POST" && concluir) {
        const tarefa = lista.concluir(Number(concluir[1]));
        return tarefa ? responder(200, tarefa) : responder(404, { erro: "tarefa não encontrada" });
      }
      return responder(404, { erro: "rota não encontrada" });
    } catch (erro) {
      return responder(400, { erro: erro.message });
    }
  });
}

function lerJson(req) {
  return new Promise((resolve, reject) => {
    let texto = "";
    req.on("data", (parte) => {
      texto += parte;
      if (texto.length > LIMITE_CORPO) reject(new Error("corpo grande demais"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(texto || "{}"));
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
  });
}

// Rodado direto (npm start), e não importado pelos testes.
if (process.argv[1]?.endsWith("servidor.mjs")) {
  const porta = Number(process.env.PORTA) || 3000;
  criarServidor().listen(porta, () => console.log(`tarefas em http://localhost:${porta}/tarefas`));
}
