// PreToolUse (Edit, Write, MultiEdit, NotebookEdit, Bash, Read): cerca (V9) → território (V2) → trava de fase.
// Bloqueia com exit 2 e a mensagem no stderr, que volta para o agente.
// Projeto sem o kit instalado: sai na hora, sem regra nenhuma.
import { lerEntrada, acharProjeto, lerConfig, agenteDa, registrar, monitorLigado, kit, Bloqueio } from "./comum.mjs";
import { checarCerca } from "./cerca.mjs";
import { checarTerritorio } from "./territorio.mjs";
import { checarTrava, criarInvocou } from "./trava.mjs";

const entrada = lerEntrada();
const proj = acharProjeto(entrada);
if (!proj) process.exit(0);

const config = lerConfig(proj.raiz);
const perfil = kit().perfis[config.perfil] || kit().perfis[kit().perfil_padrao];
const agente = agenteDa(entrada);
const ctx = { raiz: proj.raiz, trabalho: proj.trabalho, agente, config, invocou: criarInvocou(entrada) };

let bloqueio = null;
let alerta = null;
let falha = null;
try {
  if (perfil.cerca !== false) checarCerca(entrada, ctx);
  alerta = checarTerritorio(entrada, ctx);
  if (perfil.trava !== false) checarTrava(entrada, ctx);
} catch (e) {
  if (e instanceof Bloqueio) bloqueio = e;
  else falha = e; // erro do próprio hook: não trava o trabalho, mas fica registrado
}

const i = entrada.tool_input || {};
const ferramenta = entrada.tool_name;
if (bloqueio || falha || alerta || (monitorLigado(config) && ferramenta !== "Read")) {
  registrar(proj.raiz, {
    sessao: entrada.session_id,
    evento: "PreToolUse",
    agente: agente.nome,
    agent_id: agente.id,
    ferramenta,
    alvo: String(i.file_path || i.notebook_path || i.command || "").slice(0, 200),
    resultado: bloqueio ? "bloqueado" : falha ? "erro_hook" : "ok",
    regra: bloqueio?.regra || alerta?.regra || null,
    motivo: bloqueio?.message || alerta?.alerta || falha?.message || null,
    duracao_ms: Math.round(performance.now()),
  });
}

if (bloqueio) {
  process.stderr.write(`[modo-deus · ${bloqueio.regra}] ${bloqueio.message}\n`);
  process.exit(2);
}
process.exit(0);
