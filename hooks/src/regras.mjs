// Injeta o CLAUDE.md base em partes, no SessionStart e no SubagentStart de agente do kit.
// O Claude Code troca por uma prévia de 2 KB e um caminho de arquivo a saída de hook com mais de 10 mil
// caracteres; o arquivo inteiro (13,7 KB) chegava assim e os agentes não viam as regras. O hooks.json registra
// `regras.mjs 1`, `2` e `3`: cada processo imprime a sua parte, cortada entre seções (## ).
// Se o CLAUDE.md crescer além de 3 partes, o teste "regras gerais chegam inteiras" falha: registre a 4ª.
import fs from "node:fs";
import path from "node:path";
import { KIT, lerEntrada, acharProjeto } from "./comum.mjs";

// Caracteres por parte, com folga para o cabeçalho, o escape do JSON e os acentos (o limite conta bytes).
export const LIMITE = 8000;

export function partesDe(base, limite = LIMITE) {
  const corpo = base.trim().replace(/^# .*\n\n/, "");
  const out = [];
  let atual = "";
  for (const secao of corpo.split(/\n(?=## )/)) {
    if (atual && atual.length + 1 + secao.length > limite) { out.push(atual); atual = secao; } else atual = atual ? `${atual}\n${secao}` : secao;
  }
  if (atual) out.push(atual);
  return out.map((p, i) => `# CLAUDE.md base do modo-deus (parte ${i + 1} de ${out.length})\n\n${p.trim()}`);
}

const n = Number(process.argv[2]);
const entrada = lerEntrada();
const sub = entrada.hook_event_name === "SubagentStart";
if (!n || !acharProjeto(entrada) || (sub && !(entrada.agent_type || "").startsWith("modo-deus:"))) process.exit(0);

let base;
try { base = fs.readFileSync(path.join(KIT, "docs", "modelos", "CLAUDE.md"), "utf8"); } catch { process.exit(0); } // o sessao.mjs avisa
const parte = partesDe(base)[n - 1];
if (!parte) process.exit(0);
process.stdout.write(sub ? JSON.stringify({ hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: parte } }) + "\n" : parte + "\n");
