// Gravar .claude/modo-deus/plano.json só com plano válido. O conteúdo final é calculado
// (Write: content; Edit/MultiEdit: aplica as trocas no arquivo atual) e validado pelo contrato.
import fs from "node:fs";
import path from "node:path";
import { Bloqueio, PASTA, relativo } from "./comum.mjs";
import { validarPlano } from "./plano.mjs";

const ALVO = `${PASTA}/plano.json`;

function aplicar(atual, e) {
  if (typeof e?.old_string !== "string") return atual;
  if (!atual.includes(e.old_string)) return null; // a própria ferramenta vai recusar
  return e.replace_all ? atual.split(e.old_string).join(e.new_string ?? "") : atual.replace(e.old_string, () => e.new_string ?? "");
}

export function checarPlano(entrada, ctx) {
  const t = entrada.tool_name;
  if (!["Write", "Edit", "MultiEdit"].includes(t)) return;
  const i = entrada.tool_input || {};
  if (relativo(ctx.raiz, ctx.trabalho, i.file_path) !== ALVO) return;

  let conteudo;
  if (t === "Write") conteudo = i.content ?? "";
  else {
    let atual;
    try { atual = fs.readFileSync(path.join(ctx.raiz, ALVO), "utf8"); } catch { return; }
    conteudo = atual;
    for (const e of t === "Edit" ? [i] : i.edits || []) {
      conteudo = aplicar(conteudo, e);
      if (conteudo === null) return;
    }
  }

  let plano;
  try {
    plano = JSON.parse(conteudo);
  } catch (x) {
    throw new Bloqueio("plano", `plano.json não é JSON válido (${x.message}).`);
  }
  const erros = validarPlano(plano, { config: ctx.config });
  if (erros.length) throw new Bloqueio("plano", `plano.json fora do contrato:\n${erros.map((x) => `- ${x}`).join("\n")}\nCorrija e grave de novo. Formato na skill modo-deus.`);
}
