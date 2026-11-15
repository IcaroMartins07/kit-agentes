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
  out.push(fs.readFileSync(path.join(KIT, "modelos", "CLAUDE.md"), "utf8").trim());
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

if (avisos.length) out.push("", "## Atenção", "", ...avisos.map((a) => `- ${a}`));
process.stdout.write(out.join("\n") + "\n");

if (monitorLigado(config)) {
  registrar(raiz, { sessao: entrada.session_id, evento: "SessionStart", origem: entrada.source || null, agente: (entrada.agent_type || "principal").split(":").pop(), avisos: avisos.length });
}
