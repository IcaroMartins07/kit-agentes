// PreToolUse (Edit, Write, MultiEdit, NotebookEdit, Bash, Read, Grep, Glob):
// cerca (V9) → território (V2) → trava de fase → contrato do plano → monitor (V1, V3, V7, V8, V10, V11).
// Bloqueia com exit 2 e a mensagem no stderr, que volta para o agente. Alerta do monitor volta
// como hookSpecificOutput.additionalContext, sem bloquear.
// Projeto sem o kit instalado: sai na hora, sem regra nenhuma.
import { lerEntrada, acharProjeto, lerConfig, agenteDa, registrar, monitorLigado, kit, Bloqueio } from "./comum.mjs";
import { checarCerca } from "./cerca.mjs";
import { checarTerritorio } from "./territorio.mjs";
import { checarTrava, criarInvocou } from "./trava.mjs";
import { checarPlano } from "./plano-hook.mjs";
import { vigiarPre, vigiarPlano, ocorrencia, textoAlertas } from "./vigia.mjs";

const entrada = lerEntrada();
const proj = acharProjeto(entrada);
if (!proj) process.exit(0);

const config = lerConfig(proj.raiz);
const perfil = kit().perfis[config.perfil] || kit().perfis[kit().perfil_padrao];
const agente = agenteDa(entrada);
const ctx = { raiz: proj.raiz, trabalho: proj.trabalho, agente, config, invocou: criarInvocou(entrada, proj.raiz) };
const monitor = monitorLigado(config);

let bloqueio = null;
let alerta = null;
let falha = null;
let alertas = [];
try {
  if (perfil.cerca !== false) checarCerca(entrada, ctx);
  alerta = checarTerritorio(entrada, ctx);
  if (perfil.trava !== false) checarTrava(entrada, ctx);
  const plano = checarPlano(entrada, ctx);
  if (monitor) {
    alertas = vigiarPre(entrada, ctx);
    if (plano) vigiarPlano(plano, ctx, entrada.session_id);
  }
} catch (e) {
  if (e instanceof Bloqueio) bloqueio = e;
  else falha = e; // erro do próprio hook: não trava o trabalho, mas fica registrado
}

const i = entrada.tool_input || {};
const ferramenta = entrada.tool_name;
const busca = ferramenta === "Read" || ferramenta === "Grep" || ferramenta === "Glob";
if (bloqueio || falha || alerta || alertas.length || (monitor && !busca)) {
  registrar(proj.raiz, {
    sessao: entrada.session_id,
    evento: "PreToolUse",
    agente: agente.nome,
    agent_id: agente.id,
    ferramenta,
    alvo: String(i.file_path || i.notebook_path || i.command || i.pattern || i.skill || "").slice(0, 200),
    resultado: bloqueio ? "bloqueado" : falha ? "erro_hook" : "ok",
    regra: bloqueio?.regra || alertas[0]?.regra || alerta?.regra || null,
    motivo: bloqueio?.message || (alertas.length ? alertas.map((a) => a.motivo).join(" | ") : null) || alerta?.alerta || falha?.message || null,
    ...(alertas.length && !bloqueio ? { alerta: true } : {}),
    duracao_ms: Math.round(performance.now()),
  });
}

const base = { agente: agente.nome, agent_id: agente.id, ferramenta };
if (bloqueio) {
  ocorrencia(proj.raiz, entrada.session_id, { tipo: "bloqueio", regra: bloqueio.regra, ...base, motivo: bloqueio.message.slice(0, 300) });
  process.stderr.write(`[modo-deus · ${bloqueio.regra}] ${bloqueio.message}\n`);
  process.exit(2);
}
if (alertas.length) {
  for (const a of alertas) ocorrencia(proj.raiz, entrada.session_id, { tipo: "alerta", regra: a.regra, ...base, motivo: a.motivo.slice(0, 300) });
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: textoAlertas(alertas) } }) + "\n");
}
process.exit(0);
