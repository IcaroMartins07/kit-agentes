#!/usr/bin/env node
// Painel do modo-deus: resumo em texto e .claude/modo-deus/painel/index.html (autocontido, sem CDN)
// com a linha do tempo de cada agente. Lê plano.json e a telemetria.
//
// Uso: node mods/painel/gerar.mjs [caminho do projeto] [--sessao <id> | --todas]
//      Sem --sessao, usa a sessão do evento mais recente.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acharProjeto, lerConfig, kit, PASTA } from "../../hooks/src/comum.mjs";
import { STATUS_PLANO, STATUS_TAREFA } from "../../hooks/src/plano.mjs";
import { lerPlano } from "../../hooks/src/vigia.mjs";

function lerTelemetria(raiz) {
  const dir = path.join(raiz, PASTA, "telemetria");
  let arqs = [];
  try { arqs = fs.readdirSync(dir).filter((f) => /^\d{4}-\d\d-\d\d\.jsonl$/.test(f)).sort(); } catch { return []; }
  const out = [];
  for (const f of arqs) {
    for (const l of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      if (!l) continue;
      try { out.push(JSON.parse(l)); } catch { /* linha ruim */ }
    }
  }
  return out.filter((e) => e.ts).sort((a, b) => a.ts.localeCompare(b.ts));
}

const minutos = (ms) => (ms >= 60000 ? `${Math.round(ms / 60000)} min` : `${Math.round(ms / 1000)} s`);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function dadosDoPainel(raiz, { sessao = null, todas = false } = {}) {
  const config = lerConfig(raiz);
  const plano = lerPlano(raiz);
  let ev = lerTelemetria(raiz);
  if (!todas) {
    const alvo = sessao || [...ev].reverse().find((e) => e.sessao)?.sessao || null;
    if (alvo) ev = ev.filter((e) => e.sessao === alvo);
    sessao = alvo;
  }

  const agentes = new Map();
  for (const e of ev) {
    const id = e.agent_id || "principal";
    const a = agentes.get(id) || { id, agente: e.agente || "principal", inicio: e.ts, fim: e.ts, chamadas: 0, alertas: 0, bloqueios: 0, encerrou: false, marcas: [] };
    if (e.agente && e.agente !== "principal") a.agente = e.agente;
    a.fim = e.ts;
    if (e.evento === "PreToolUse") a.chamadas++;
    if (e.evento === "SubagentStop") a.encerrou = true;
    if (e.resultado === "bloqueado") { a.bloqueios++; a.marcas.push({ ts: e.ts, tipo: "bloqueio", regra: e.regra, motivo: e.motivo }); }
    else if (e.alerta) { a.alertas++; a.marcas.push({ ts: e.ts, tipo: "alerta", regra: e.regra, motivo: e.motivo }); }
    agentes.set(id, a);
  }

  const regras = {};
  for (const e of ev) {
    if (!(e.resultado === "bloqueado" || e.alerta) || !e.regra) continue;
    regras[e.regra] ??= { alertas: 0, bloqueios: 0 };
    regras[e.regra][e.resultado === "bloqueado" ? "bloqueios" : "alertas"]++;
  }

  const tarefas = {};
  const porTime = {};
  for (const t of plano?.tarefas || []) {
    tarefas[t.status] = (tarefas[t.status] || 0) + 1;
    const time = kit().agentes[t.time]?.time || t.time;
    porTime[time] ??= { total: 0, concluidas: 0 };
    porTime[time].total++;
    if (t.status === "concluida") porTime[time].concluidas++;
  }

  const t0 = ev.length ? Date.parse(ev[0].ts) : null;
  const t1 = ev.length ? Date.parse(ev[ev.length - 1].ts) : null;
  return { raiz, perfil: config.perfil, sessao, plano, tarefas, porTime, agentes: [...agentes.values()], regras, t0, t1, eventos: ev.length };
}

export function textoDoPainel(d) {
  const l = [];
  l.push(`modo-deus · perfil ${d.perfil}${d.sessao ? ` · sessão ${d.sessao}` : ""}`);
  if (d.plano) {
    l.push("", `Fase: ${STATUS_PLANO.map((s) => (s === d.plano.status ? `[${s}]` : s)).join(" → ")}`);
    l.push(`Pedido: ${d.plano.pedido || "?"}`);
    l.push(`Tarefas: ${STATUS_TAREFA.filter((s) => d.tarefas[s]).map((s) => `${s} ${d.tarefas[s]}`).join(", ") || "nenhuma"}`);
    l.push(`Por time: ${Object.entries(d.porTime).map(([t, v]) => `${t} ${v.concluidas}/${v.total}`).join(", ")}`);
  } else l.push("", "Sem plano.json: nenhuma feature em andamento.");

  l.push("", `Agentes (${d.agentes.length}):`);
  for (const a of d.agentes) {
    const dur = Date.parse(a.fim) - Date.parse(a.inicio);
    l.push(`- ${a.agente}${a.id !== "principal" ? ` (${a.id})` : ""}: ${a.chamadas} chamada(s), ${minutos(dur)}, ${a.alertas} alerta(s), ${a.bloqueios} bloqueio(s)${a.encerrou ? ", encerrado" : ""}`);
  }
  const rs = Object.entries(d.regras).sort();
  l.push("", rs.length ? `Alertas e bloqueios por regra: ${rs.map(([r, v]) => `${r} ${v.alertas}a/${v.bloqueios}b`).join(", ")}` : "Nenhum alerta ou bloqueio.");
  if (d.t0) l.push(`Tempo: ${minutos(d.t1 - d.t0)} (${d.eventos} evento(s))`);
  return l.join("\n");
}

export function htmlDoPainel(d) {
  const total = Math.max(1, (d.t1 || 0) - (d.t0 || 0));
  const pct = (ts) => (((Date.parse(ts) - d.t0) / total) * 100).toFixed(2);
  const linhas = d.agentes.map((a) => {
    const ini = pct(a.inicio);
    const larg = Math.max(0.8, pct(a.fim) - ini).toFixed(2);
    const marcas = a.marcas.map((m) => `<span class="m ${m.tipo}" style="left:${pct(m.ts)}%" title="${esc(`${m.regra || ""} ${m.tipo}: ${m.motivo || ""}`)}"></span>`).join("");
    return `<div class="linha"><div class="nome">${esc(a.agente)}<small>${esc(a.id !== "principal" ? a.id : "")}</small></div><div class="trilho"><span class="barra" style="left:${ini}%;width:${larg}%"></span>${marcas}</div><div class="num">${a.chamadas} · ${a.alertas}a · ${a.bloqueios}b</div></div>`;
  }).join("\n");
  const regras = Object.entries(d.regras).sort().map(([r, v]) => `<tr><td>${esc(r)}</td><td>${v.alertas}</td><td>${v.bloqueios}</td></tr>`).join("") || `<tr><td colspan="3">nenhum</td></tr>`;
  const tarefas = (d.plano?.tarefas || []).map((t) => `<tr><td>${esc(t.id)}</td><td>${esc(t.time)}</td><td>${esc(t.classe)}</td><td class="st ${esc(t.status)}">${esc(t.status)}</td><td>${esc(t.titulo)}</td></tr>`).join("") || `<tr><td colspan="5">sem plano</td></tr>`;
  const fases = STATUS_PLANO.map((s) => `<li class="${d.plano?.status === s ? "atual" : ""}">${esc(s)}</li>`).join("");
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>modo-deus · painel</title>
<style>
:root{--fundo:#fafaf7;--texto:#1d1d1b;--fraco:#6b6b66;--linha:#e3e2dc;--barra:#3d6b8c;--alerta:#c98a12;--bloqueio:#b3261e}
@media (prefers-color-scheme:dark){:root{--fundo:#161614;--texto:#ecebe6;--fraco:#9a9a93;--linha:#2c2c29;--barra:#6fa0c4}}
*{box-sizing:border-box}body{margin:0;padding:32px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--fundo);color:var(--texto);max-width:1100px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 10px}.sub{color:var(--fraco)}
ol.fases{display:flex;gap:6px;list-style:none;padding:0;margin:8px 0;flex-wrap:wrap}ol.fases li{padding:2px 10px;border:1px solid var(--linha);border-radius:12px;color:var(--fraco)}ol.fases li.atual{color:var(--texto);border-color:var(--barra);font-weight:600}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:4px 8px;border-bottom:1px solid var(--linha);vertical-align:top}th{color:var(--fraco);font-weight:500}
.st.concluida{color:var(--barra)}.st.reprovada{color:var(--bloqueio)}
.linha{display:grid;grid-template-columns:180px 1fr 120px;gap:12px;align-items:center;padding:6px 0;border-bottom:1px solid var(--linha)}
.nome small{display:block;color:var(--fraco);font-size:11px;overflow:hidden;text-overflow:ellipsis}
.trilho{position:relative;height:14px;background:var(--linha);border-radius:7px}
.barra{position:absolute;top:0;height:14px;background:var(--barra);border-radius:7px;opacity:.8}
.m{position:absolute;top:-3px;width:4px;height:20px;border-radius:2px;margin-left:-2px}.m.alerta{background:var(--alerta)}.m.bloqueio{background:var(--bloqueio)}
.num{color:var(--fraco);font-variant-numeric:tabular-nums;text-align:right}
.legenda span{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 12px;vertical-align:middle}
</style></head><body>
<h1>modo-deus · painel</h1>
<div class="sub">perfil ${esc(d.perfil)}${d.sessao ? ` · sessão ${esc(d.sessao)}` : ""} · ${d.eventos} evento(s)${d.t0 ? ` · ${esc(minutos(d.t1 - d.t0))}` : ""} · gerado ${esc(new Date().toISOString().slice(0, 16).replace("T", " "))}</div>
${d.plano ? `<p>${esc(d.plano.pedido)}</p>` : ""}
<ol class="fases">${fases}</ol>
<h2>Linha do tempo por agente</h2>
<div class="legenda sub">chamadas · alertas · bloqueios<span style="background:var(--alerta)"></span>alerta<span style="background:var(--bloqueio)"></span>bloqueio</div>
${linhas || '<p class="sub">Sem telemetria.</p>'}
<h2>Tarefas</h2>
<table><tr><th>id</th><th>time</th><th>classe</th><th>status</th><th>título</th></tr>${tarefas}</table>
<h2>Alertas e bloqueios por regra</h2>
<table><tr><th>regra</th><th>alertas</th><th>bloqueios</th></tr>${regras}</table>
</body></html>
`;
}

export function gerarPainel(raiz, opcoes = {}) {
  const d = dadosDoPainel(raiz, opcoes);
  const arquivo = path.join(raiz, PASTA, "painel", "index.html");
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, htmlDoPainel(d));
  return { texto: textoDoPainel(d), arquivo, dados: d };
}

// ---------- CLI ----------
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const args = process.argv.slice(2);
  const o = { todas: false, sessao: null };
  let caminho = process.cwd();
  while (args.length) {
    const a = args.shift();
    if (a === "--todas") o.todas = true;
    else if (a === "--sessao") o.sessao = args.shift();
    else caminho = path.resolve(a);
  }
  const proj = acharProjeto({ cwd: caminho });
  if (!proj) {
    console.error(`modo-deus não está instalado em ${caminho} (sem ${PASTA}/config.json).`);
    process.exitCode = 1;
  } else {
    const r = gerarPainel(proj.raiz, o);
    console.log(r.texto);
    console.log(`\nPainel: ${r.arquivo}`);
  }
}
