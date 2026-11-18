// SubagentStart, SubagentStop, Stop e PostToolUseFailure: telemetria, contrato de saída dos agentes
// e os detectores que dependem do fim do trabalho ou da falha de uma ferramenta.
//  - PostToolUseFailure: V4 (comando inexistente), V7 (mesmo erro repetido), V3 (falha de arquivo).
//  - SubagentStop de Dev/QA com entrega "pronta": V5 (testes depois da última edição) e V6 (comando citado sem lastro).
//  - Stop: marcador de retrospectiva quando a sessão teve alerta ou bloqueio.
import fs from "node:fs";
import path from "node:path";
import { KIT, lerEntrada, acharProjeto, lerConfig, registrar, monitorLigado, agenteDa } from "./comum.mjs";
import { contratoDe } from "./plano.mjs";
import { vigiarFalha, vigiarEntrega, marcarPendente, ocorrencia, textoAlertas, lerEstado, gravarEstado } from "./vigia.mjs";

const entrada = lerEntrada();
const proj = acharProjeto(entrada);
if (!proj) process.exit(0);
const config = lerConfig(proj.raiz);
const ag = agenteDa(entrada);
const agente = ag.nome;
const ctx = { raiz: proj.raiz, trabalho: proj.trabalho, agente: ag, config };
const evento = entrada.hook_event_name;
const sessao = entrada.session_id;
const base = { agente, agent_id: entrada.agent_id || null };

// ---------- PostToolUseFailure ----------
if (evento === "PostToolUseFailure") {
  if (!monitorLigado(config)) process.exit(0);
  let alertas = [];
  try { alertas = vigiarFalha(entrada, ctx); } catch { /* monitor nunca derruba */ }
  const i = entrada.tool_input || {};
  registrar(proj.raiz, {
    sessao, evento, ...base, ferramenta: entrada.tool_name,
    alvo: String(i.file_path || i.notebook_path || i.command || "").slice(0, 200),
    resultado: "ok", erro: String(entrada.error || "").slice(0, 300),
    ...(alertas.length ? { regra: alertas[0].regra, alerta: true, motivo: alertas.map((a) => a.motivo).join(" | ") } : {}),
  });
  if (alertas.length) {
    for (const a of alertas) ocorrencia(proj.raiz, sessao, { tipo: "alerta", regra: a.regra, ...base, ferramenta: entrada.tool_name, motivo: a.motivo.slice(0, 300) });
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUseFailure", additionalContext: textoAlertas(alertas) } }) + "\n");
  }
  process.exit(0);
}

// ---------- SubagentStart: regras gerais do kit para o subagente (ele não herda o contexto da sessão) ----------
if (evento === "SubagentStart" && (entrada.agent_type || "").startsWith("modo-deus:")) {
  try {
    const base = fs.readFileSync(path.join(KIT, "docs", "modelos", "CLAUDE.md"), "utf8").trim();
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: base } }) + "\n");
  } catch { /* sem a base: o agente lê .modo-deus/REGRAS-GERAIS.md */ }
}

// ---------- SubagentStart: relógio do V8 ----------
if (evento === "SubagentStart" && monitorLigado(config) && entrada.agent_id && !lerEstado(proj.raiz, sessao, entrada.agent_id)) {
  gravarEstado(proj.raiz, sessao, entrada.agent_id, { inicio: Date.now(), chamadas: 0 });
}

// ---------- contrato de saída ----------
// Agentes do kit só encerram entregando o bloco no formato do seu papel (entrega, regressão,
// veredito, auditoria). Na segunda tentativa (stop_hook_active) deixa encerrar, para não
// prender o subagente em laço, e registra.
const ler = evento === "SubagentStop" && (entrada.agent_type || "").startsWith("modo-deus:") ? contratoDe(agente) : null;
let contrato = null;
let resultado = null;
if (ler) {
  resultado = ler(entrada.last_assistant_message);
  const { erros } = resultado;
  if (erros.length) {
    contrato = erros;
    if (!entrada.stop_hook_active) {
      registrar(proj.raiz, { sessao, evento: "SubagentStop", ...base, resultado: "bloqueado", regra: "contrato", motivo: erros.join("; ") });
      ocorrencia(proj.raiz, sessao, { tipo: "bloqueio", regra: "contrato", ...base, motivo: erros.join("; ").slice(0, 300) });
      const lista = erros.map((x) => `- ${x}`).join("\n");
      process.stderr.write(`[modo-deus · contrato] Sua resposta final não segue o formato combinado:\n${lista}\nRefaça a resposta final terminando com o bloco json pedido.\n`);
      process.exit(2);
    }
  }
}

// ---------- V5 e V6 ----------
let vig = { alertas: [], bloqueio: null };
if (!contrato && resultado?.entrega && monitorLigado(config)) {
  try { vig = vigiarEntrega(entrada, ctx, resultado.entrega); } catch { /* monitor nunca derruba */ }
}
for (const a of vig.alertas) ocorrencia(proj.raiz, sessao, { tipo: "alerta", regra: a.regra, ...base, motivo: a.motivo.slice(0, 300) });
if (vig.bloqueio) {
  const b = vig.bloqueio;
  if (!entrada.stop_hook_active) {
    registrar(proj.raiz, { sessao, evento, ...base, resultado: "bloqueado", regra: b.regra, motivo: b.motivo });
    ocorrencia(proj.raiz, sessao, { tipo: "bloqueio", regra: b.regra, ...base, motivo: b.motivo.slice(0, 300) });
    const extra = vig.alertas.length ? "\n" + textoAlertas(vig.alertas) : "";
    process.stderr.write(`[modo-deus · ${b.regra}] ${b.motivo}${extra}\n`);
    process.exit(2);
  }
  vig.alertas.push(b); // segunda tentativa: deixa encerrar, mas fica o alerta
  ocorrencia(proj.raiz, sessao, { tipo: "alerta", regra: b.regra, ...base, motivo: b.motivo.slice(0, 300) });
}

// ---------- Stop: marcador de retrospectiva ----------
if (evento === "Stop") marcarPendente(proj.raiz, sessao);

if (!monitorLigado(config) && !contrato) process.exit(0);

registrar(proj.raiz, {
  sessao,
  evento,
  ...base,
  ...(contrato ? { resultado: "contrato_falhou", motivo: contrato.join("; ") } : {}),
  ...(vig.alertas.length ? { regra: vig.alertas[0].regra, alerta: true, motivo: vig.alertas.map((a) => a.motivo).join(" | ") } : {}),
  ultima_mensagem: entrada.last_assistant_message ? String(entrada.last_assistant_message).slice(0, 300) : undefined,
});
// SubagentStop/Stop não têm additionalContext: o alerta vai como systemMessage (visto pelo usuário)
// e fica na telemetria, onde o Maestro e o /deus-status o leem.
if (vig.alertas.length) process.stdout.write(JSON.stringify({ systemMessage: textoAlertas(vig.alertas) }) + "\n");
