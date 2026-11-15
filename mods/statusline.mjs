#!/usr/bin/env node
// Status line do modo-deus (protocolo de status line do Claude Code: JSON da sessão no stdin,
// primeira linha do stdout vira a barra). Exemplo:
//   deus · executando · dev 3/5 · qa 2/4 · 1 alerta · 22 min
// Projeto sem o kit: saída vazia. Plugins não podem definir statusLine; o instalar.mjs grava
// no .claude/settings.local.json do projeto com --statusline.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lerEntrada, acharProjeto, lerConfig, kit } from "../hooks/src/comum.mjs";
import { lerPlano, lerOcorrencias, resumoOcorrencias } from "../hooks/src/vigia.mjs";

export function linhaDeStatus(entrada) {
  const cwd = entrada.workspace?.current_dir || entrada.cwd || process.cwd();
  const proj = acharProjeto({ cwd });
  if (!proj) return "";
  const { perfil } = lerConfig(proj.raiz);
  const partes = [perfil || kit().perfil_padrao];

  const plano = lerPlano(proj.raiz);
  if (plano) {
    partes.push(plano.status || "?");
    const por = {};
    for (const t of plano.tarefas || []) {
      const time = kit().agentes[t?.time]?.time;
      if (!time) continue;
      por[time] ??= [0, 0];
      por[time][1]++;
      if (t.status === "concluida") por[time][0]++;
    }
    for (const time of ["dev", "qa"]) if (por[time]) partes.push(`${time} ${por[time][0]}/${por[time][1]}`);
  } else partes.push("sem plano");

  const r = resumoOcorrencias(lerOcorrencias(proj.raiz, entrada.session_id));
  if (r.alertas) partes.push(`${r.alertas} alerta${r.alertas > 1 ? "s" : ""}`);
  if (r.bloqueios) partes.push(`${r.bloqueios} bloqueio${r.bloqueios > 1 ? "s" : ""}`);

  const ms = Number(entrada.cost?.total_duration_ms);
  if (ms > 0) partes.push(`${Math.round(ms / 60000)} min`);
  return partes.join(" · ");
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    process.stdout.write(linhaDeStatus(lerEntrada()) + "\n");
  } catch {
    process.stdout.write("\n");
  }
}
