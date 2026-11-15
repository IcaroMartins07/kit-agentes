// SubagentStart, SubagentStop e Stop: só telemetria por enquanto. Os detectores V5–V8 entram na F5.
import { lerEntrada, acharProjeto, lerConfig, registrar, monitorLigado } from "./comum.mjs";

const entrada = lerEntrada();
const proj = acharProjeto(entrada);
if (!proj) process.exit(0);
if (!monitorLigado(lerConfig(proj.raiz))) process.exit(0);

registrar(proj.raiz, {
  sessao: entrada.session_id,
  evento: entrada.hook_event_name,
  agente: (entrada.agent_type || "principal").split(":").pop() || "principal",
  agent_id: entrada.agent_id || null,
  ultima_mensagem: entrada.last_assistant_message ? String(entrada.last_assistant_message).slice(0, 300) : undefined,
});
