// Custo de um agente lido da transcrição dele: tempo total, tempo parado esperando o Maestro (mensagem do
// coordenador que retoma o agente), chamadas de ferramenta e tokens. O que mais pesa é o cache lido, que
// cresce com chamadas x tamanho do contexto; por isso vai também o maior contexto visto.
import fs from "node:fs";

const min = (ms) => Math.round(ms / 6000) / 10;

export function usoDaTranscricao(arquivo) {
  let txt;
  try { txt = fs.readFileSync(arquivo, "utf8"); } catch { return null; }
  const tokens = { entrada: 0, cache_escrito: 0, cache_lido: 0, saida: 0 };
  const vistas = new Set();
  let inicio = null, fim = null, espera = 0, chamadas = 0, contexto = 0, modelo = "";
  for (const l of txt.split("\n")) {
    let e;
    try { e = JSON.parse(l); } catch { continue; } // linha vazia ou cortada no fim
    const t = Date.parse(e.timestamp);
    if (!Number.isNaN(t)) {
      // Mensagem de texto do usuário depois do briefing = o Maestro retomando um agente que estava parado.
      const retomada = e.type === "user" && fim !== null && !(Array.isArray(e.message?.content) && e.message.content.some((c) => c?.type === "tool_result"));
      if (retomada) espera += Math.max(0, t - fim);
      inicio ??= t;
      fim = Math.max(fim ?? t, t); // linhas gravadas fora de ordem não andam o relógio para trás
    }
    const m = e.message;
    if (e.type !== "assistant" || !m) continue;
    for (const c of m.content || []) if (c?.type === "tool_use") chamadas++;
    // O Claude Code grava uma mensagem em várias linhas com o mesmo id e o mesmo usage.
    if (!m.usage || vistas.has(m.id)) continue;
    vistas.add(m.id);
    const u = m.usage;
    tokens.entrada += u.input_tokens || 0;
    tokens.cache_escrito += u.cache_creation_input_tokens || 0;
    tokens.cache_lido += u.cache_read_input_tokens || 0;
    tokens.saida += u.output_tokens || 0;
    contexto = Math.max(contexto, (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0));
    modelo = m.model || modelo;
  }
  if (inicio === null) return null;
  return { minutos: min(fim - inicio), minutos_espera: min(espera), minutos_ativos: min(fim - inicio - espera), chamadas, tokens, contexto_max: contexto, modelo };
}
