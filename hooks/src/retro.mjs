// Retrospectiva (F6): junta telemetria, plano e lições do graphify num diagnóstico determinístico.
// Não chama LLM: quem escreve a proposta e o diff é o Claude, seguindo a skill retrospectiva.
//
// CLI: node retro.mjs coletar [raiz] [--sessao X] [--desde AAAA-MM-DD]  → JSON no stdout
//      node retro.mjs proposta <arquivo-saida> [--raiz R] [--causa C] [--sessao X] [--desde D] [--forcar]
//      node retro.mjs concluir [raiz]                                   → apaga retro/PENDENTE.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PASTA, acharProjeto } from "./comum.mjs";

export const MAX_EXEMPLOS = 5;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

// Causa → regras que a alimentam. Uma regra pode alimentar mais de uma causa (V6 é passo pulado e alucinação).
export const CAUSAS = {
  skill_nao_disparou: { regras: ["trava"], descricao: "a trava de fase bloqueou: a skill ou o passo que deveria ter rodado antes não disparou" },
  instrucao_ambigua: { regras: ["contrato"], descricao: "o agente não entregou no formato combinado (contrato): instrução ambígua ou incompleta" },
  passo_pulado: { regras: ["V5", "V6"], descricao: "pronto sem prova ou afirmação sem lastro: um passo do fluxo foi pulado" },
  esforco_errado: { regras: ["V11"], descricao: "tarefa classificada como simples reprovou ou estourou: a regra de esforço errou" },
  fuga: { regras: ["V1", "V2", "V10"], descricao: "fuga de escopo, de território ou teste moldado ao código" },
  alucinacao: { regras: ["V3", "V4", "V6"], descricao: "arquivo, símbolo, comando ou afirmação que não existem" },
  loop_estouro: { regras: ["V7", "V8"], descricao: "loop ou estouro de tempo/chamadas" },
  falso_positivo_suspeito: { regras: [], descricao: "a mesma regra bloqueou o mesmo alvo várias vezes e o agente seguiu por outro caminho com sucesso" },
};

const lista = (v) => (Array.isArray(v) ? v : []);
const lerJson = (f) => {
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; }
};

// ---------- telemetria ----------
export function lerTelemetria(raiz, { sessao = null, desde = null } = {}) {
  const dir = path.join(raiz, PASTA, "telemetria");
  let arquivos = [];
  try { arquivos = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort(); } catch { return []; }
  if (desde) arquivos = arquivos.filter((f) => f.slice(0, 10) >= desde);
  const eventos = [];
  for (const f of arquivos) {
    let texto = "";
    try { texto = fs.readFileSync(path.join(dir, f), "utf8"); } catch { continue; }
    for (const linha of texto.split(/\r?\n/)) {
      if (!linha.trim()) continue;
      let ev;
      try { ev = JSON.parse(linha); } catch { continue; } // linha quebrada não derruba a retro
      if (!ev || typeof ev !== "object") continue;
      if (sessao && ev.sessao !== sessao) continue;
      if (desde && typeof ev.ts === "string" && ev.ts.slice(0, 10) < desde) continue;
      eventos.push(ev);
    }
  }
  return eventos;
}

// Classifica um evento: bloqueio, alerta, contrato_falhou, erro_hook ou null (evento comum).
export function tipoDe(ev) {
  if (ev.resultado === "contrato_falhou") return "contrato_falhou";
  if (ev.resultado === "erro_hook") return "erro_hook";
  if (ev.resultado === "bloqueado") return "bloqueio";
  if (ev.regra) return "alerta"; // regra presente sem bloqueio: o detector só avisou
  return null;
}

const exemplo = (ev) => ({
  ts: ev.ts || null,
  sessao: ev.sessao || null,
  agente: ev.agente || "principal",
  ferramenta: ev.ferramenta || null,
  alvo: ev.alvo || null,
  motivo: ev.motivo ? String(ev.motivo).slice(0, 300) : null,
});

function agrupar(eventos, chave) {
  const m = new Map();
  for (const ev of eventos) {
    const k = chave(ev);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(ev);
  }
  return [...m.entries()]
    .map(([k, evs]) => ({ chave: k, total: evs.length, exemplos: evs.slice(0, MAX_EXEMPLOS).map(exemplo) }))
    .sort((a, b) => b.total - a.total || String(a.chave).localeCompare(String(b.chave)));
}

// Falso positivo suspeito (heurística, documentada na skill):
// na mesma sessão, o mesmo agente levou >= 2 bloqueios da mesma regra no mesmo alvo e, depois do último,
// teve um evento bem-sucedido (sem regra) com a mesma ferramenta em outro alvo. Sinal de que o detector
// barrou algo legítimo e o agente contornou. É só suspeita: a retro confere o trecho antes de propor mudar o detector.
export function falsosPositivos(eventos) {
  const grupos = new Map();
  eventos.forEach((ev, i) => {
    if (tipoDe(ev) !== "bloqueio" || !ev.regra || !ev.alvo) return;
    const k = [ev.sessao, ev.agente, ev.regra, ev.alvo].join("\u0000");
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(i);
  });
  const achados = [];
  for (const idx of grupos.values()) {
    if (idx.length < 2) continue;
    const ult = eventos[idx[idx.length - 1]];
    const depois = eventos.slice(idx[idx.length - 1] + 1).find((ev) =>
      ev.sessao === ult.sessao && ev.agente === ult.agente && !ev.regra &&
      (ev.resultado === "ok" || ev.resultado === undefined) && ev.ferramenta && ev.ferramenta === ult.ferramenta && ev.alvo && ev.alvo !== ult.alvo);
    if (depois) achados.push({ regra: ult.regra, bloqueios: idx.length, bloqueio: exemplo(ult), sucesso: exemplo(depois) });
  }
  return achados;
}

// ---------- plano ----------
export function analisarPlano(raiz) {
  const plano = lerJson(path.join(raiz, PASTA, "plano.json"));
  const vazio = { existe: false, tarefas_reprovadas: [], rodadas_revisao: {}, itens_abertos: { alta: 0, media: 0, baixa: 0 }, itens_abertos_lista: [], v11: [] };
  if (!plano || typeof plano !== "object") return vazio;
  const tarefas = lista(plano.tarefas);
  const reprovada = (t) => t?.status === "reprovada" || (t?.rodadas_revisao || 0) > 0;
  const resumo = (t) => ({ id: t.id, titulo: t.titulo || null, time: t.time || null, classe: t.classe || null, esforco: t.esforco || null, status: t.status || null, rodadas_revisao: t.rodadas_revisao || 0 });
  const rodadas = {};
  for (const t of tarefas) if ((t?.rodadas_revisao || 0) > 0) rodadas[t.id] = t.rodadas_revisao;
  const abertos = lista(plano.itens_revisao).filter((r) => r?.status === "aberto");
  const itens_abertos = { alta: 0, media: 0, baixa: 0 };
  for (const r of abertos) if (r.gravidade in itens_abertos) itens_abertos[r.gravidade]++;
  const motivosDe = (id) => lista(plano.itens_revisao).filter((r) => r?.tarefa === id).map((r) => `${r.gravidade}: ${r.motivo}`);
  return {
    existe: true,
    status: plano.status || null,
    pedido: plano.pedido || null,
    tarefas_reprovadas: tarefas.filter(reprovada).map(resumo),
    rodadas_revisao: rodadas,
    itens_abertos,
    itens_abertos_lista: abertos.slice(0, 20).map((r) => ({ id: r.id, tarefa: r.tarefa, gravidade: r.gravidade, motivo: r.motivo })),
    // V11: tarefa classificada como simples que reprovou na revisão
    v11: tarefas.filter((t) => t?.classe === "simples" && reprovada(t)).map((t) => ({ ...resumo(t), itens: motivosDe(t.id).slice(0, MAX_EXEMPLOS) })),
  };
}

// ---------- graphify ----------
// LESSONS.md vem de `graphify reflect`; graphify-out/memory/ guarda as consultas marcadas com
// `graphify save-result --outcome useful|dead_end|corrected`. O formato da memória não é contrato nosso:
// contamos as ocorrências de cada outcome no texto dos arquivos, o que basta para a retro.
export function lerGraphify(raiz) {
  const base = path.join(raiz, "graphify-out");
  let licoes = null;
  try { licoes = fs.readFileSync(path.join(base, "reflections", "LESSONS.md"), "utf8").slice(0, 6000); } catch { /* sem lições */ }
  const memoria = { arquivos: 0, useful: 0, dead_end: 0, corrected: 0 };
  const varrer = (dir, prof = 0) => {
    let itens = [];
    try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const it of itens) {
      const p = path.join(dir, it.name);
      if (it.isDirectory()) { if (prof < 3) varrer(p, prof + 1); continue; }
      memoria.arquivos++;
      let t = "";
      try { t = fs.readFileSync(p, "utf8"); } catch { continue; }
      for (const o of ["useful", "dead_end", "corrected"]) memoria[o] += (t.match(new RegExp(`\\b${o}\\b`, "g")) || []).length;
    }
  };
  varrer(path.join(base, "memory"));
  return { licoes, memoria: memoria.arquivos ? memoria : null };
}

// ---------- marcador do Stop (F5) ----------
export const arquivoPendente = (raiz) => path.join(raiz, PASTA, "retro", "PENDENTE.json");
export const lerPendente = (raiz) => lerJson(arquivoPendente(raiz));

export function concluir(raiz) {
  try { fs.unlinkSync(arquivoPendente(raiz)); return true; } catch { return false; }
}

// ---------- coleta ----------
export function coletar(raiz, { sessao = null, desde = null } = {}) {
  if (desde && !RE_DATA.test(desde)) throw new Error(`--desde deve ser AAAA-MM-DD, veio "${desde}"`);
  const eventos = lerTelemetria(raiz, { sessao, desde });
  const marcados = eventos.map((ev) => ({ ev, tipo: tipoDe(ev) }));
  const de = (tipo) => marcados.filter((m) => m.tipo === tipo).map((m) => m.ev);

  const por_regra = {};
  const por_agente = {};
  for (const { ev, tipo } of marcados) {
    const ag = ev.agente || "principal";
    const a = (por_agente[ag] ??= { eventos: 0, bloqueios: 0, alertas: 0, contrato_falhou: 0, erro_hook: 0 });
    a.eventos++;
    if (tipo === "bloqueio") a.bloqueios++;
    if (tipo === "alerta") a.alertas++;
    if (tipo === "contrato_falhou") a.contrato_falhou++;
    if (tipo === "erro_hook") a.erro_hook++;
    // contrato_falhou não traz regra no registro do evento.mjs; conta como regra "contrato"
    const regra = ev.regra || (tipo === "contrato_falhou" ? "contrato" : null);
    if (!regra || !tipo || tipo === "erro_hook") continue;
    const r = (por_regra[regra] ??= { bloqueios: 0, alertas: 0, contrato_falhou: 0, total: 0 });
    r.total++;
    if (tipo === "bloqueio") r.bloqueios++;
    else if (tipo === "alerta") r.alertas++;
    else r.contrato_falhou++;
  }

  const bloqueios = agrupar(de("bloqueio"), (ev) => ev.regra || "sem_regra").map(({ chave, ...g }) => ({ regra: chave, ...g }));
  const alertas = agrupar(de("alerta"), (ev) => ev.regra).map(({ chave, ...g }) => ({ regra: chave, ...g }));
  const contrato_falhou = {};
  for (const g of agrupar(de("contrato_falhou"), (ev) => ev.agente || "principal")) contrato_falhou[g.chave] = { total: g.total, exemplos: g.exemplos };

  const plano = analisarPlano(raiz);
  const fps = falsosPositivos(eventos);

  // causas: eventos com regra/resultado + casos do plano (V11) + heurística de falso positivo
  const causas = [];
  for (const [causa, def] of Object.entries(CAUSAS)) {
    let evs = marcados.filter(({ ev, tipo }) => tipo && tipo !== "erro_hook" && def.regras.includes(ev.regra || (tipo === "contrato_falhou" ? "contrato" : ""))).map((m) => m.ev);
    let total = evs.length;
    let exemplos = evs.slice(0, MAX_EXEMPLOS).map(exemplo);
    let regras = [...new Set(evs.map((ev) => ev.regra || "contrato"))];
    let extra = {};
    if (causa === "esforco_errado" && plano.v11.length) {
      total += plano.v11.length;
      extra.tarefas = plano.v11;
      if (!regras.includes("V11")) regras.push("V11");
    }
    if (causa === "falso_positivo_suspeito") {
      total = fps.length;
      exemplos = fps.slice(0, MAX_EXEMPLOS);
      regras = [...new Set(fps.map((f) => f.regra))];
    }
    if (total) causas.push({ causa, descricao: def.descricao, total, regras: regras.sort(), exemplos, ...extra });
  }
  causas.sort((a, b) => b.total - a.total);

  return {
    raiz,
    filtro: { sessao, desde },
    pendente: lerPendente(raiz),
    eventos: eventos.length,
    sessoes: [...new Set(eventos.map((ev) => ev.sessao).filter(Boolean))],
    periodo: eventos.length ? { de: eventos[0].ts || null, ate: eventos[eventos.length - 1].ts || null } : null,
    totais: { por_regra, por_agente, erros_hook: de("erro_hook").length },
    bloqueios,
    alertas,
    contrato_falhou,
    plano,
    graphify: lerGraphify(raiz),
    causas,
    vazio: eventos.length === 0 && !plano.existe,
  };
}

// ---------- proposta ----------
const ALVOS = ["skill (skills/proprias/<nome>/SKILL.md)", "agente (agents/<nome>.md)", "regra de esforço (skill modo-deus, passo 2.3)", "detector (hooks/src/*.mjs)", "só este projeto (.claude/modo-deus/REGRAS.md)"];

export function esqueletoProposta({ causa = null, dados = null, data = new Date().toISOString().slice(0, 10) } = {}) {
  const c = dados && causa ? dados.causas.find((x) => x.causa === causa) : dados?.causas[0];
  const nome = c?.causa || causa || "<causa>";
  const evid = c
    ? ["```jsonl", ...c.exemplos.map((e) => JSON.stringify(e)), "```", ...(c.tarefas ? ["", "Tarefas do plano:", "```json", JSON.stringify(c.tarefas, null, 2), "```"] : [])].join("\n")
    : "<cole aqui os trechos da telemetria (até 5 linhas) e o item da revisão que motivam a proposta>";
  return `# Retro ${data} · ${nome}

> Proposta gerada por \`retro.mjs proposta\`. Preencha as seções marcadas e só aplique depois da aprovação do usuário.

## Causa

- **Categoria:** ${nome}${c ? ` (${c.total} ocorrência${c.total === 1 ? "" : "s"}; regras ${c.regras.join(", ") || "-"})` : ""}
- **Descrição:** ${c?.descricao || CAUSAS[nome]?.descricao || "<o que deu errado, em uma frase>"}
- **Hipótese:** <por que aconteceu: qual instrução faltou, ficou ambígua ou está errada>
${dados ? `- **Filtro:** sessão ${dados.filtro.sessao || "todas"}, desde ${dados.filtro.desde || "o início"}\n` : ""}
## Evidência

${evid}

## Alvo da mudança

${ALVOS.map((a) => `- [ ] ${a}`).join("\n")}

Arquivo: <caminho exato>

## Diff sugerido

\`\`\`diff
\`\`\`

## Plano de eval

- **Caso de regressão:** \`evals/regressao/${data}-<assunto>/\` (prompt.md + graders/) reproduzindo a falha acima.
- **Antes:** \`claude plugin eval <plugin> --case "${data}-*" --runs 3\` → nota: <...>
- **Depois:** mesmo comando com o diff aplicado → nota: <...>
- **Critério:** a nota depois tem de ser maior que antes e nenhum caso existente pode cair. Sem melhora, a proposta é descartada.

## Decisão

- [ ] aprovada pelo usuário em <data>
- versão: <anterior> → <nova> (kit.json, plugin.json, marketplace.json)
- CHANGELOG: <linha>
`;
}

export function escreverProposta(arquivo, opcoes = {}) {
  if (fs.existsSync(arquivo) && !opcoes.forcar) throw new Error(`${arquivo} já existe (use --forcar para sobrescrever)`);
  fs.mkdirSync(path.dirname(path.resolve(arquivo)), { recursive: true });
  fs.writeFileSync(arquivo, esqueletoProposta(opcoes));
  return arquivo;
}

// ---------- CLI ----------
function argumentos(argv) {
  const pos = [];
  const op = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--forcar") op.forcar = true;
    else if (a.startsWith("--")) {
      const [k, v] = a.includes("=") ? a.slice(2).split(/=(.*)/s) : [a.slice(2), argv[++i]];
      op[k] = v;
    } else pos.push(a);
  }
  return { pos, op };
}

const raizPadrao = (dada) => (dada ? path.resolve(dada) : acharProjeto({ cwd: process.cwd() })?.raiz || process.cwd());

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const [cmd, ...resto] = process.argv.slice(2);
  const { pos, op } = argumentos(resto);
  try {
    if (cmd === "coletar") {
      console.log(JSON.stringify(coletar(raizPadrao(pos[0]), { sessao: op.sessao || null, desde: op.desde || null }), null, 2));
    } else if (cmd === "proposta") {
      if (!pos[0]) throw new Error("uso: node retro.mjs proposta <arquivo-saida> [--raiz R] [--causa C] [--sessao X] [--desde D] [--forcar]");
      const dados = coletar(raizPadrao(op.raiz), { sessao: op.sessao || null, desde: op.desde || null });
      console.log(escreverProposta(pos[0], { causa: op.causa || null, dados, forcar: op.forcar }));
    } else if (cmd === "concluir") {
      console.log(concluir(raizPadrao(pos[0])) ? "PENDENTE.json apagado" : "nada pendente");
    } else {
      throw new Error("uso: node retro.mjs coletar|proposta|concluir ...");
    }
  } catch (x) {
    console.error(x.message);
    process.exitCode = 1;
  }
}
