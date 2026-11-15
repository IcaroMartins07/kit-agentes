// V2 · fuga de território. Vale só para os agentes do kit (agent_type modo-deus:*);
// a sessão principal sem --agent não é restrita por território.
//
// Regra de sobreposição (decidida na revisão da F1):
//  - Revisão (somente_leitura): não escreve nada.
//  - Maestro: só escreve em .claude/modo-deus/ (plano, retro).
//  - QA: só escreve em arquivo que case com o território "testes".
//  - Dev: escreve no próprio território, inclusive testes que estejam dentro dele (TDD).
//    Arquivo de teste fora do território do Dev (cypress/, e2e/) é do QA.
//    Arquivo que casa só com o território de outro time é bloqueado.
//    Arquivo que não casa com nenhum território (package.json da raiz, configs) é permitido e registrado.
import { Bloqueio, PASTA, casaGlob, lerRegras, territoriosDe, relativo } from "./comum.mjs";
import { alvosDeEscrita } from "./trava.mjs";

const ESCRITA = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

function alvos(entrada) {
  const i = entrada.tool_input || {};
  if (ESCRITA.includes(entrada.tool_name)) return [i.file_path || i.notebook_path || ""].filter(Boolean);
  if (entrada.tool_name === "Bash") return alvosDeEscrita(i.command || "").filter((a) => !/^\/dev\/(null|stdout|stderr)$/.test(a) && !/^&?\d$/.test(a));
  return [];
}

export function checarTerritorio(entrada, ctx) {
  const { nome, def } = ctx.agente;
  if (!def) return null; // sessão principal ou subagente que não é do kit
  const arqs = alvos(entrada);
  if (!arqs.length) return null;

  let terr = null;
  const territorios = () => (terr ??= territoriosDe(lerRegras(ctx.raiz)));
  const casa = (rel, time) => (territorios()[time] || []).some((g) => casaGlob(rel, g));

  for (const a of arqs) {
    // Numa worktree de tarefa (inclusive em .claude/worktrees/ dentro do repositório) o território
    // vale relativo à própria worktree, que é uma cópia do projeto.
    const naWorktree = ctx.trabalho !== ctx.raiz ? relativo(ctx.trabalho, ctx.trabalho, a) : null;
    const alvo = naWorktree && !naWorktree.startsWith("..") ? naWorktree : relativo(ctx.raiz, ctx.trabalho, a);
    if (alvo.startsWith("..") || /^[A-Za-z]:/.test(alvo)) throw new Bloqueio("V2", `${nome} tentou escrever fora do projeto (${a}).`);

    if (def.somente_leitura) throw new Bloqueio("V2", `${nome} é somente leitura e tentou escrever em ${alvo}. Devolva o item ao Maestro com arquivo, linha e motivo.`);

    if (def.time === "maestro") {
      if (!alvo.startsWith(PASTA + "/")) throw new Bloqueio("V2", `O Maestro não edita código nem arquivos do projeto (${alvo}). Despache a tarefa para o time dono.`);
      continue;
    }

    const doTeste = casa(alvo, "testes");
    if (def.time === "qa") {
      if (!doTeste) throw new Bloqueio("V2", `${nome} só escreve testes e fixtures; ${alvo} não está no território "testes". Bug no código vira item para o Dev no plano.`);
      continue;
    }

    // dev
    const meu = def.territorio;
    if (casa(alvo, meu)) continue;
    if (doTeste) throw new Bloqueio("V2", `${alvo} é teste fora do território ${meu}: é do QA. Peça ao Maestro.`);
    const donos = Object.keys(territorios()).filter((t) => t !== "testes" && t !== meu && casa(alvo, t));
    if (donos.length) throw new Bloqueio("V2", `${alvo} é do território ${donos.join(", ")}, não de ${meu}. Peça ao Maestro para ampliar o escopo ou despachar o time dono.`);
    return { regra: "V2", alerta: `sem território: ${alvo}` }; // permitido, mas registrado
  }
  return null;
}
