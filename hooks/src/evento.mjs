// SubagentStart, SubagentStop e Stop: telemetria e contrato de saída da Revisão.
// Os detectores V5–V8 entram na F5.
import { lerEntrada, acharProjeto, lerConfig, registrar, monitorLigado } from "./comum.mjs";
import { contratoDe } from "./plano.mjs";

const entrada = lerEntrada();
const proj = acharProjeto(entrada);
if (!proj) process.exit(0);
const agente = (entrada.agent_type || "principal").split(":").pop() || "principal";

// Agentes do kit só encerram entregando o bloco no formato do seu papel (entrega, regressão,
// veredito, auditoria). Na segunda tentativa (stop_hook_active) deixa encerrar, para não
// prender o subagente em laço, e registra.
const ler = entrada.hook_event_name === "SubagentStop" && (entrada.agent_type || "").startsWith("modo-deus:") ? contratoDe(agente) : null;
let contrato = null;
if (ler) {
  const { erros } = ler(entrada.last_assistant_message);
  if (erros.length) {
    contrato = erros;
    if (!entrada.stop_hook_active) {
      registrar(proj.raiz, { sessao: entrada.session_id, evento: "SubagentStop", agente, agent_id: entrada.agent_id || null, resultado: "bloqueado", regra: "contrato", motivo: erros.join("; ") });
      const lista = erros.map((x) => `- ${x}`).join("\n");
      process.stderr.write(`[modo-deus · contrato] Sua resposta final não segue o formato combinado:\n${lista}\nRefaça a resposta final terminando com o bloco json pedido.\n`);
      process.exit(2);
    }
  }
}
if (!monitorLigado(lerConfig(proj.raiz)) && !contrato) process.exit(0);

registrar(proj.raiz, {
  sessao: entrada.session_id,
  evento: entrada.hook_event_name,
  agente,
  agent_id: entrada.agent_id || null,
  ...(contrato ? { resultado: "contrato_falhou", motivo: contrato.join("; ") } : {}),
  ultima_mensagem: entrada.last_assistant_message ? String(entrada.last_assistant_message).slice(0, 300) : undefined,
});
