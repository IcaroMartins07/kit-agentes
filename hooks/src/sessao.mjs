// SessionStart: injeta o CLAUDE.md base, as regras do projeto e os avisos; reconstrói o grafo
// em segundo plano quando ele está ausente ou mais velho que o último commit.
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { KIT, PASTA, lerEntrada, acharProjeto, lerConfig, lerRegras, camposAbertos, registrar, monitorLigado, kit } from "./comum.mjs";

const entrada = lerEntrada();
const proj = acharProjeto(entrada);
if (!proj) process.exit(0);

const { raiz } = proj;
const config = lerConfig(raiz);
const avisos = [];
const out = [];

out.push(`# modo-deus ativo · perfil ${config.perfil} · kit ${kit().versao}`);
out.push("");
try {
  const base = fs.readFileSync(path.join(KIT, "docs", "modelos", "CLAUDE.md"), "utf8").trim();
  out.push(base);
  // Os subagentes não herdam o contexto desta sessão: a mesma base fica em .modo-deus/REGRAS-GERAIS.md,
  // que todo agente do kit lê no passo "Regras" (e o SubagentStart também injeta).
  const geral = path.join(raiz, PASTA, "REGRAS-GERAIS.md");
  const atual = fs.existsSync(geral) ? fs.readFileSync(geral, "utf8") : "";
  if (atual !== base + "\n") fs.writeFileSync(geral, base + "\n");
} catch {
  avisos.push("CLAUDE.md base do kit não encontrado; reinstale o plugin.");
}

const regras = lerRegras(raiz);
if (regras) {
  out.push("", `## Regras deste projeto (${PASTA}/REGRAS.md)`, "", regras.replace(/^# .*\n/, "").trim());
  const abertos = camposAbertos(regras);
  if (abertos.length) avisos.push(`REGRAS.md tem ${abertos.length} campo(s) sem preencher; peça ao usuário ou marque <a definir>.`);
} else {
  avisos.push(`${PASTA}/REGRAS.md não existe: rode o instalar.mjs de novo.`);
}

const sob = Object.entries(config.times || {}).map(([t, m]) => `${t}=${m}`).join(", ");
if (sob) out.push("", `Times sob demanda: ${sob}. "auto" aciona só quando a tarefa toca o território do time.`);

// Grafo: ausente ou mais velho que o último commit → graphify update em segundo plano (só código, sem LLM).
const grafo = path.join(raiz, "graphify-out", "graph.json");
let ultimoCommit = 0;
try {
  ultimoCommit = Number(execFileSync("git", ["-C", raiz, "log", "-1", "--format=%ct"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()) * 1000;
} catch { /* repositório sem commit */ }
const velho = !fs.existsSync(grafo) || fs.statSync(grafo).mtimeMs < ultimoCommit;
if (velho && !process.env.MODO_DEUS_SEM_GRAPHIFY) {
  try {
    const p = spawn("graphify", ["update", "."], { cwd: raiz, detached: true, stdio: "ignore", windowsHide: true });
    p.on("error", () => {});
    p.unref();
    avisos.push("Grafo do projeto sendo atualizado em segundo plano (graphify update .); se uma consulta falhar, espere alguns segundos.");
  } catch {
    avisos.push("graphify não encontrado: mapa do projeto indisponível; rode `node instalar.mjs dependencias`.");
  }
}

// Marcador da F5: a sessão anterior teve alerta ou bloqueio e a retro (F6) ainda não rodou.
try {
  const p = JSON.parse(fs.readFileSync(path.join(raiz, PASTA, "retro", "PENDENTE.json"), "utf8"));
  avisos.push(`retrospectiva pendente: rode /modo-deus:retro (${p.alertas || 0} alerta(s), ${p.bloqueios || 0} bloqueio(s)).`);
} catch { /* sem marcador */ }

// Estado do monitor (estado-*.json, ocorrencias-*.jsonl) de sessões com mais de 3 dias sai.
try {
  const tele = path.join(raiz, PASTA, "telemetria");
  const limite = Date.now() - 3 * 86400000;
  for (const f of fs.readdirSync(tele)) {
    if (/^(estado-.*\.json|ocorrencias-.*\.jsonl)$/.test(f) && fs.statSync(path.join(tele, f)).mtimeMs < limite) fs.rmSync(path.join(tele, f), { force: true });
  }
} catch { /* sem telemetria */ }

if (avisos.length) out.push("", "## Atenção", "", ...avisos.map((a) => `- ${a}`));
process.stdout.write(out.join("\n") + "\n");

if (monitorLigado(config)) {
  registrar(raiz, { sessao: entrada.session_id, evento: "SessionStart", origem: entrada.source || null, agente: (entrada.agent_type || "principal").split(":").pop(), avisos: avisos.length });
}
