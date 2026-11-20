#!/usr/bin/env node
// Custo de uma sessão por agente: tempo ativo, espera pelo Maestro, chamadas, tokens e maior contexto.
// Serve de linha de base para comparar versões do kit na mesma tarefa.
//
// Uso: node hooks/ferramentas/custo.mjs <transcrição da sessão .jsonl> [--json]
//      A transcrição fica em ~/.claude/projects/<projeto>/<sessão>.jsonl; os subagentes, em <sessão>/subagents/.
import fs from "node:fs";
import path from "node:path";
import { usoDaTranscricao } from "../src/custo.mjs";

const [arq, ...opts] = process.argv.slice(2);
if (!arq) {
  console.error("uso: node hooks/ferramentas/custo.mjs <transcrição da sessão .jsonl> [--json]");
  process.exit(1);
}

const linhas = [{ agente: "principal", id: "", uso: usoDaTranscricao(arq) }];
const dirSub = path.join(arq.replace(/\.jsonl$/, ""), "subagents");
let subs = [];
try { subs = fs.readdirSync(dirSub).filter((f) => f.endsWith(".jsonl")); } catch { /* sessão sem subagentes */ }
for (const f of subs) {
  let tipo = "";
  try { tipo = JSON.parse(fs.readFileSync(path.join(dirSub, f.replace(/\.jsonl$/, ".meta.json")), "utf8")).agentType || ""; } catch { /* sem meta */ }
  linhas.push({ agente: tipo.split(":").pop() || "subagente", id: f.slice(6, -6), uso: usoDaTranscricao(path.join(dirSub, f)) });
}
const agentes = linhas.filter((l) => l.uso).map(({ agente, id, uso }) => ({ agente, id, ...uso }));

const soma = (k) => Math.round(agentes.reduce((s, a) => s + a[k], 0) * 10) / 10;
const total = {
  minutos_ativos: soma("minutos_ativos"),
  minutos_espera: soma("minutos_espera"),
  chamadas: soma("chamadas"),
  tokens: Object.fromEntries(Object.keys(agentes[0]?.tokens || {}).map((k) => [k, agentes.reduce((s, a) => s + a.tokens[k], 0)])),
};

if (opts.includes("--json")) {
  console.log(JSON.stringify({ agentes, total }, null, 2));
} else {
  const mil = (n) => `${Math.round(n / 1000)}K`;
  console.table(agentes.sort((a, b) => b.tokens.cache_lido - a.tokens.cache_lido).map((a) => ({
    agente: a.agente, id: a.id.slice(-6), ativo_min: a.minutos_ativos, espera_min: a.minutos_espera, chamadas: a.chamadas,
    cache_lido: mil(a.tokens.cache_lido), cache_escrito: mil(a.tokens.cache_escrito), saida: mil(a.tokens.saida), contexto_max: mil(a.contexto_max),
  })));
  console.log(`total: ${total.minutos_ativos} min ativos, ${total.minutos_espera} min de espera, ${total.chamadas} chamadas, ` +
    `cache lido ${mil(total.tokens.cache_lido || 0)}, cache escrito ${mil(total.tokens.cache_escrito || 0)}, saída ${mil(total.tokens.saida || 0)}`);
}
