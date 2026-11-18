// Monitor da F5: detectores V1, V3–V8, V10 e V11 contra fuga e alucinação.
// V2 (território) e V9 (cerca) ficam em territorio.mjs e cerca.mjs e bloqueiam sempre.
//
// Modo (kit.json perfis[].monitor): "desligado" (leve) não roda nada; "alerta" (estrito) só avisa;
// "completo" (deus) bloqueia as regras de kit.json monitor.bloqueia_no_deus.
// Alerta chega ao agente por hookSpecificOutput.additionalContext (PreToolUse/PostToolUseFailure);
// bloqueio por exit 2 + stderr (classe Bloqueio).
//
// Estado entre chamadas: um arquivo pequeno por sessão e agente em telemetria/estado-<sessao>-<agente>.json
// (agentes em paralelo não disputam o mesmo arquivo). Alertas e bloqueios da sessão vão também para
// telemetria/ocorrencias-<sessao>.jsonl, que alimenta a status line e o marcador de retrospectiva.
import fs from "node:fs";
import path from "node:path";
import { PASTA, kit, barra, casaGlob, relativo, registrar, lerRegras, comandosDe, Bloqueio } from "./comum.mjs";
import { alvosDeEscrita } from "./trava.mjs";

const ESCRITA = ["Edit", "Write", "MultiEdit", "NotebookEdit"];
const BUSCA = ["Grep", "Glob"];

export function modoMonitor(config) {
  const p = kit().perfis[config?.perfil] || kit().perfis[kit().perfil_padrao];
  return p.monitor || "desligado";
}
const cfgMonitor = () => kit().monitor || {};
const bloqueiaNoDeus = (regra) => (cfgMonitor().bloqueia_no_deus || []).includes(regra);

// ---------- arquivos de estado ----------
const seguro = (s) => String(s || "").replace(/[^\w.-]/g, "_").slice(0, 80);
const dirTele = (raiz) => path.join(raiz, PASTA, "telemetria");
export const arqEstado = (raiz, sessao, id) => path.join(dirTele(raiz), `estado-${seguro(sessao || "sem-sessao")}-${seguro(id || "principal")}.json`);
export const arqOcorrencias = (raiz, sessao) => path.join(dirTele(raiz), `ocorrencias-${seguro(sessao || "sem-sessao")}.jsonl`);

const novoEstado = () => ({ inicio: Date.now(), chamadas: 0, ultimos: [], falhas: [], ids: [], erros: {}, v7: 0, pos: {}, escreveuTeste: false, v10: false, v8: false, proximo: null });

export function lerEstado(raiz, sessao, id) {
  try {
    return { ...novoEstado(), ...JSON.parse(fs.readFileSync(arqEstado(raiz, sessao, id), "utf8")) };
  } catch {
    return null;
  }
}
export function gravarEstado(raiz, sessao, id, est) {
  const f = arqEstado(raiz, sessao, id);
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + ".tmp", JSON.stringify(est));
    fs.renameSync(f + ".tmp", f);
  } catch {
    try { fs.writeFileSync(f, JSON.stringify(est)); } catch { /* estado é melhor esforço */ }
  }
}

// ---------- ocorrências (alertas e bloqueios da sessão) ----------
export function ocorrencia(raiz, sessao, o) {
  try {
    fs.mkdirSync(dirTele(raiz), { recursive: true });
    fs.appendFileSync(arqOcorrencias(raiz, sessao), JSON.stringify({ ts: new Date().toISOString(), ...o }) + "\n");
  } catch { /* nunca derruba o hook */ }
}
export function lerOcorrencias(raiz, sessao) {
  try {
    return fs.readFileSync(arqOcorrencias(raiz, sessao), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}
export function resumoOcorrencias(lista) {
  const r = { alertas: 0, bloqueios: 0, regras: {} };
  for (const o of lista) {
    if (o.tipo === "bloqueio") r.bloqueios++;
    else r.alertas++;
    if (o.regra) r.regras[o.regra] = (r.regras[o.regra] || 0) + 1;
  }
  return r;
}

// ---------- plano, branch e tarefa ----------
export function lerPlano(raiz) {
  try {
    return JSON.parse(fs.readFileSync(path.join(raiz, PASTA, "plano.json"), "utf8"));
  } catch {
    return null;
  }
}

// Branch atual lendo o HEAD direto (sem processo git): numa worktree segue o arquivo .git.
export function branchDe(dir) {
  let d = path.resolve(dir || ".");
  for (let i = 0; i < 40; i++) {
    const g = path.join(d, ".git");
    try {
      const st = fs.statSync(g);
      let head;
      if (st.isFile()) {
        const m = fs.readFileSync(g, "utf8").match(/gitdir:\s*(.+)/);
        head = fs.readFileSync(path.join(path.resolve(d, m[1].trim()), "HEAD"), "utf8");
      } else head = fs.readFileSync(path.join(g, "HEAD"), "utf8");
      const r = head.match(/ref:\s*refs\/heads\/(.+)/);
      return r ? r[1].trim() : null;
    } catch { /* sobe */ }
    const pai = path.dirname(d);
    if (pai === d) return null;
    d = pai;
  }
  return null;
}

// Tarefa pela branch da worktree: <branch da feature>-T<n>.
export function tarefaDa(plano, branch) {
  const m = (branch || "").match(/-(T\d+)$/);
  if (!plano || !m) return null;
  return (plano.tarefas || []).find((t) => t?.id === m[1]) || null;
}

export function noEscopo(rel, escopo) {
  return (escopo || []).some((g) => {
    if (/[*?]/.test(g)) return casaGlob(rel, g);
    const base = g.replace(/\/+$/, "");
    return rel === base || rel.startsWith(base + "/");
  });
}

// Caminho relativo à worktree da tarefa (ou à raiz, se não houver worktree).
function relDaTarefa(ctx, a) {
  const naWt = ctx.trabalho !== ctx.raiz ? relativo(ctx.trabalho, ctx.trabalho, a) : null;
  return naWt && !naWt.startsWith("..") ? naWt : relativo(ctx.raiz, ctx.trabalho, a);
}

function alvosEscrita(entrada) {
  const i = entrada.tool_input || {};
  if (ESCRITA.includes(entrada.tool_name)) return [i.file_path || i.notebook_path || ""].filter(Boolean);
  if (entrada.tool_name === "Bash") return alvosDeEscrita(i.command || "").filter((a) => !/^\/dev\/(null|stdout|stderr)$/.test(a) && !/^&?\d$/.test(a));
  return [];
}

// ---------- V3: falhas de arquivo/símbolo vistas na transcrição do próprio agente ----------
// Erros de validação (arquivo inexistente, old_string não encontrado) não disparam hook nenhum:
// voltam ao modelo como <tool_use_error>. Lemos só os bytes novos da transcrição desde a última chamada.
const RE_ALUC = /<tool_use_error>[\s\S]*?(does not exist|String to replace not found|not found in file|No such file|ENOENT|não existe|não encontrad)/i;

function transcricaoDoAgente(entrada) {
  if (!entrada.agent_id) return entrada.transcript_path || null;
  if (entrada.agent_transcript_path) return entrada.agent_transcript_path;
  if (entrada.transcript_path && entrada.session_id)
    return path.join(path.dirname(entrada.transcript_path), entrada.session_id, "subagents", `agent-${entrada.agent_id}.jsonl`);
  return null;
}

function textoDe(c) {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x) => (typeof x === "string" ? x : x?.text || "")).join("\n");
  return "";
}

// Devolve os tool_use_id das falhas novas de arquivo/símbolo.
function falhasNovas(entrada, est) {
  const arq = transcricaoDoAgente(entrada);
  if (!arq) return [];
  let tam;
  try { tam = fs.statSync(arq).size; } catch { return []; }
  const k = barra(arq);
  const pos = est.pos[k];
  if (pos === undefined || tam < pos) { est.pos[k] = tam; return []; } // primeira vez: não conta o histórico
  if (tam === pos) return [];
  const fd = fs.openSync(arq, "r");
  const buf = Buffer.alloc(tam - pos);
  try { fs.readSync(fd, buf, 0, buf.length, pos); } finally { fs.closeSync(fd); }
  const fim = buf.lastIndexOf(10);
  if (fim < 0) return [];
  est.pos[k] = pos + fim + 1;
  const ids = [];
  for (const l of buf.toString("utf8", 0, fim).split("\n")) {
    if (!l.includes("tool_use_error")) continue;
    try {
      const o = JSON.parse(l);
      for (const c of [].concat(o?.message?.content || [])) {
        if (c?.type === "tool_result" && RE_ALUC.test(textoDe(c.content))) ids.push(c.tool_use_id || `x${Math.random()}`);
      }
    } catch { /* linha parcial */ }
  }
  return ids;
}

function contarFalha(est, id) {
  if (id && est.ids.includes(id)) return false;
  if (id) est.ids = [...est.ids, id].slice(-30);
  est.falhas.push(est.chamadas);
  return true;
}

// ---------- PreToolUse ----------
// Devolve [{regra, motivo}] de alertas; lança Bloqueio quando o modo é deus e a regra bloqueia.
export function vigiarPre(entrada, ctx) {
  const modo = modoMonitor(ctx.config);
  if (modo === "desligado") return [];
  const deus = modo === "completo";
  const sessao = entrada.session_id;
  const ag = ctx.agente;
  const id = ag.id || "principal";
  const est = lerEstado(ctx.raiz, sessao, id) || novoEstado();
  const cfg = cfgMonitor();
  const t = entrada.tool_name;
  const i = entrada.tool_input || {};
  const alertas = [];
  const avisar = (regra, motivo) => {
    if (deus && bloqueiaNoDeus(regra)) throw new Bloqueio(regra, motivo);
    alertas.push({ regra, motivo });
  };
  est.chamadas++;

  try {
    // bloqueio adiado pelo PostToolUseFailure (V7 reincidente no deus)
    if (est.proximo) {
      const p = est.proximo;
      est.proximo = null;
      avisar(p.regra, p.motivo);
    }

    // V3 · alucinação de arquivo/símbolo
    for (const fid of falhasNovas(entrada, est)) contarFalha(est, fid);
    const janela = cfg.v3?.janela || 10;
    est.falhas = est.falhas.filter((n) => est.chamadas - n <= janela);
    if (est.falhas.length >= (cfg.v3?.falhas || 3) && !BUSCA.includes(t)) {
      const n = est.falhas.length;
      est.falhas = [];
      avisar("V3", `${n} falhas recentes de arquivo inexistente ou old_string não encontrado. Pare de adivinhar caminhos e trechos: localize com Grep/Glob ou \`graphify query\`/\`graphify explain\`, leia o arquivo atual com Read e só então edite.`);
    }

    const plano = ag.def && ["dev", "qa"].includes(ag.def.time) ? lerPlano(ctx.raiz) : null;
    const tarefa = plano ? tarefaDa(plano, branchDe(ctx.trabalho)) : null;

    // V8 · estouro (só subagentes do kit)
    if (ag.def && ag.id) {
      const classe = tarefa?.classe === "simples" ? "simples" : "complexa";
      const teto = cfg.tetos?.[classe] || { chamadas: 200, minutos: 90 };
      const min = (Date.now() - est.inicio) / 60000;
      if (est.chamadas > teto.chamadas || min > teto.minutos) {
        const motivo = `${ag.nome} passou do teto da classe ${classe}${tarefa ? ` (${tarefa.id})` : ""}: ${est.chamadas} chamadas / ${Math.round(min)} min (teto ${teto.chamadas} / ${teto.minutos} min). Pare, entregue como "bloqueada" com o que tem e o que falta, e devolva ao Maestro para replanejar.`;
        if (!est.v8 && tarefa?.classe === "simples") {
          registrar(ctx.raiz, { sessao, evento: "V11", agente: ag.nome, agent_id: ag.id, regra: "V11", tarefa: tarefa.id, resultado: "ok", alerta: true, motivo: `tarefa simples estourou o teto (V8)` });
          ocorrencia(ctx.raiz, sessao, { tipo: "alerta", regra: "V11", agente: ag.nome, agent_id: ag.id, tarefa: tarefa.id, motivo: "tarefa simples estourou o teto" });
        }
        if (deus || !est.v8) { est.v8 = true; avisar("V8", motivo); }
      }
    }

    // V7 · loop: mesma ferramenta e alvo várias vezes seguidas
    const chave = `${t}|${JSON.stringify(i).slice(0, 300)}`;
    est.ultimos = [...est.ultimos, chave].slice(-(cfg.v7?.repeticoes || 4));
    if (est.ultimos.length >= (cfg.v7?.repeticoes || 4) && est.ultimos.every((k) => k === chave)) {
      est.ultimos = [];
      est.v7++;
      const motivo = `mesma chamada (${t}) repetida ${cfg.v7?.repeticoes || 4} vezes seguidas. Mude a abordagem: leia o erro, investigue a causa (superpowers:systematic-debugging) ou devolva ao Maestro.`;
      if (deus && est.v7 >= 2) throw new Bloqueio("V7", `${motivo} É a ${est.v7}ª vez: pare e devolva ao Maestro para replanejar.`);
      alertas.push({ regra: "V7", motivo });
    }

    // V1 · fuga de escopo e V10 · teste moldado ao código
    if (tarefa || (plano && ag.def.time === "qa")) {
      const arqs = alvosEscrita(entrada);
      if (tarefa) {
        for (const a of arqs) {
          const rel = relDaTarefa(ctx, a);
          if (rel.startsWith("..") || rel.startsWith(PASTA + "/")) continue;
          if (!noEscopo(rel, tarefa.escopo)) {
            avisar("V1", `${rel} está fora do escopo de ${tarefa.id} (${(tarefa.escopo || []).join(", ")}). Não edite: devolva ao Maestro pedindo ampliação do escopo, com o arquivo e o motivo.`);
            break;
          }
        }
      }
      if (ag.def.time === "qa") {
        if (arqs.length) est.escreveuTeste = true;
        else if (t === "Read" && !est.escreveuTeste && !est.v10 && i.file_path) {
          const rel = relDaTarefa(ctx, i.file_path);
          const dev = (plano.tarefas || []).find((x) => kit().agentes[x?.time]?.time === "dev" && noEscopo(rel, x.escopo));
          if (dev) {
            est.v10 = true;
            alertas.push({ regra: "V10", motivo: `${rel} é implementação de ${dev.id}. Escreva o teste a partir do critério de aceite (spec do plano), não do código; leia a implementação só depois do teste escrito.` });
          }
        }
      }
    }
  } finally {
    gravarEstado(ctx.raiz, sessao, id, est);
  }
  return alertas;
}

// ---------- PostToolUseFailure: V4 e V7 (mesmo erro); V3 se a falha de arquivo chegar aqui ----------
const RE_CMD = /command not found|não é reconhecido|is not recognized as|Missing script|missing script:|Unknown command|no such command|não foi encontrado o comando|ERR_PNPM_NO_SCRIPT|Command ".*" not found/i;

export function vigiarFalha(entrada, ctx) {
  const modo = modoMonitor(ctx.config);
  if (modo === "desligado" || entrada.is_interrupt) return [];
  const deus = modo === "completo";
  const sessao = entrada.session_id;
  const id = ctx.agente.id || "principal";
  const est = lerEstado(ctx.raiz, sessao, id) || novoEstado();
  const cfg = cfgMonitor();
  const t = entrada.tool_name;
  const erro = String(entrada.error || "");
  const alertas = [];

  if (t === "Bash" && RE_CMD.test(erro)) {
    const cmds = comandosDe(lerRegras(ctx.raiz));
    const lista = Object.entries(cmds).map(([k, v]) => `${k}: \`${v}\``).join("; ");
    alertas.push({ regra: "V4", motivo: `o comando não existe neste projeto. ${lista ? `Comandos reais (REGRAS.md): ${lista}.` : "REGRAS.md não lista comandos: confira os scripts do package.json (ou equivalente) antes de rodar."} Não invente scripts.` });
  }
  if (["Read", ...ESCRITA].includes(t) && /does not exist|not found|No such file|ENOENT|não existe|não encontrad/i.test(erro)) contarFalha(est, entrada.tool_use_id);

  // V7 · mesmo erro repetido
  const linhas = erro.split("\n").map((l) => l.trim()).filter((l) => l && !/^Exit code \d+$/.test(l));
  const assinatura = `${t}|${(linhas[0] || erro).replace(/\d+/g, "#").slice(0, 160)}`;
  est.erros[assinatura] = (est.erros[assinatura] || 0) + 1;
  const chaves = Object.keys(est.erros);
  if (chaves.length > 30) delete est.erros[chaves[0]];
  if (est.erros[assinatura] >= (cfg.v7?.mesmo_erro || 3)) {
    est.erros[assinatura] = 0;
    est.v7++;
    const motivo = `o mesmo erro apareceu ${cfg.v7?.mesmo_erro || 3} vezes (${(linhas[0] || "").slice(0, 120)}). Repetir não resolve: investigue a causa (superpowers:systematic-debugging) ou devolva ao Maestro.`;
    alertas.push({ regra: "V7", motivo });
    if (deus && est.v7 >= 2) est.proximo = { regra: "V7", motivo: `${motivo} É a ${est.v7}ª vez: pare e devolva ao Maestro para replanejar.` };
  }
  gravarEstado(ctx.raiz, sessao, id, est);
  return alertas;
}

// ---------- SubagentStop: V5 (pronto sem prova) e V6 (afirmação sem lastro) ----------
function linhasTelemetria(raiz) {
  const dir = dirTele(raiz);
  const hoje = new Date();
  const dias = [new Date(hoje.getTime() - 86400000), hoje].map((d) => d.toISOString().slice(0, 10));
  const out = [];
  for (const d of [...new Set(dias)]) {
    let txt;
    try { txt = fs.readFileSync(path.join(dir, `${d}.jsonl`), "utf8"); } catch { continue; }
    for (const l of txt.split("\n")) {
      if (!l) continue;
      try { out.push(JSON.parse(l)); } catch { /* linha ruim */ }
    }
  }
  return out;
}

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const rodou = (alvo, comando) => {
  const a = norm(alvo), c = norm(comando);
  return !!c && (a.includes(c) || (a.length >= 190 && c.startsWith(a.slice(0, 150))) || a.includes(c.slice(0, 150)));
};

export function vigiarEntrega(entrada, ctx, entrega) {
  const modo = modoMonitor(ctx.config);
  if (modo === "desligado" || entrega?.status !== "pronta") return { alertas: [], bloqueio: null };
  const id = entrada.agent_id;
  const ev = linhasTelemetria(ctx.raiz).filter((l) => l.agent_id === id && l.evento === "PreToolUse" && l.resultado !== "bloqueado");
  let ultimaEdicao = -1;
  ev.forEach((l, i) => { if (ESCRITA.includes(l.ferramenta)) ultimaEdicao = i; });
  const bash = ev.map((l, i) => ({ ...l, i })).filter((l) => l.ferramenta === "Bash");
  const alertas = [];
  const semLastro = [], semProva = [];
  for (const tst of entrega.testes || []) {
    const c = tst?.comando;
    if (!c) continue;
    if (!bash.some((l) => rodou(l.alvo, c))) semLastro.push(c);
    if (!bash.some((l) => l.i > ultimaEdicao && rodou(l.alvo, c))) semProva.push(c);
  }
  if (semLastro.length) alertas.push({ regra: "V6", motivo: `a entrega cita comando(s) que este agente não rodou: ${semLastro.map((c) => `\`${c}\``).join(", ")}. Só declare o que rodou de fato, com a saída real.` });
  let bloqueio = null;
  if (semProva.length) {
    const motivo = `entrega "pronta" de ${entrega.tarefa || "?"} sem prova: ${semProva.map((c) => `\`${c}\``).join(", ")} não rodou depois da última edição. Rode os testes agora e refaça a entrega com o resultado real (ou entregue como "bloqueada").`;
    if (modo === "completo" && bloqueiaNoDeus("V5")) bloqueio = { regra: "V5", motivo };
    else alertas.push({ regra: "V5", motivo });
  }
  // V12: mexeu em dependência e não rodou a auditoria.
  const DEP = /(^|[\\/])(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements[^\\/]*\.txt|pyproject\.toml|poetry\.lock|uv\.lock|Pipfile(\.lock)?|go\.(mod|sum)|Cargo\.(toml|lock)|Gemfile(\.lock)?|composer\.(json|lock)|pubspec\.(yaml|lock))$/;
  const AUDIT = /\baudit\b|pip-audit|osv-scanner|govulncheck|cargo[- ]audit|bundle[- ]audit/;
  const deps = (entrega.arquivos || []).filter((a) => typeof a === "string" && DEP.test(a));
  if (deps.length && !bash.some((l) => AUDIT.test(String(l.alvo || "")))) {
    const motivo = `entrega "pronta" de ${entrega.tarefa || "?"} mexe em dependência (${deps.join(", ")}) sem auditoria: rode o comando Auditoria do REGRAS.md e cite o resultado em testes.`;
    if (modo === "completo" && bloqueiaNoDeus("V12") && !bloqueio) bloqueio = { regra: "V12", motivo };
    else alertas.push({ regra: "V12", motivo });
  }
  return { alertas, bloqueio };
}

// ---------- V11: esforço errado ao gravar o plano ----------
export function vigiarPlano(plano, ctx, sessao) {
  if (modoMonitor(ctx.config) === "desligado" || !plano) return [];
  const ja = new Set(lerOcorrencias(ctx.raiz, sessao).filter((o) => o.regra === "V11").map((o) => o.tarefa));
  const novas = [];
  for (const t of plano.tarefas || []) {
    if (t?.classe !== "simples" || !((t.rodadas_revisao || 0) > 0) || ja.has(t.id)) continue;
    const motivo = `${t.id} foi classificada como simples e já teve ${t.rodadas_revisao} rodada(s) de revisão: recalibrar a classificação na retro.`;
    registrar(ctx.raiz, { sessao, evento: "V11", agente: ctx.agente.nome, agent_id: ctx.agente.id, regra: "V11", tarefa: t.id, resultado: "ok", alerta: true, motivo });
    ocorrencia(ctx.raiz, sessao, { tipo: "alerta", regra: "V11", agente: ctx.agente.nome, agent_id: ctx.agente.id, tarefa: t.id, motivo });
    novas.push({ regra: "V11", motivo });
  }
  return novas;
}

// ---------- marcador de retrospectiva (Stop) ----------
// <raiz>/.modo-deus/retro/PENDENTE.json = { sessao, ts, alertas, bloqueios, regras, sessoes }
// Os totais somam as sessões ainda não consumidas pela retro (F6 lê e apaga o arquivo).
// Corte: ocorrências até o último /retro concluído (retro/ULTIMA.json, gravado pela F6) já foram analisadas.
export function marcarPendente(raiz, sessao) {
  let corte = "";
  try { corte = JSON.parse(fs.readFileSync(path.join(raiz, PASTA, "retro", "ULTIMA.json"), "utf8")).ts || ""; } catch { /* nunca houve retro */ }
  const r = resumoOcorrencias(lerOcorrencias(raiz, sessao).filter((o) => !corte || (o.ts || "") > corte));
  if (!r.alertas && !r.bloqueios) return null;
  const f = path.join(raiz, PASTA, "retro", "PENDENTE.json");
  let ant = null;
  try { ant = JSON.parse(fs.readFileSync(f, "utf8")); } catch { /* sem marcador */ }
  const sessoes = { ...(ant?.sessoes || (ant?.sessao ? { [ant.sessao]: { alertas: ant.alertas || 0, bloqueios: ant.bloqueios || 0, regras: ant.regras || {} } } : {})) };
  sessoes[sessao || "sem-sessao"] = r;
  const total = { alertas: 0, bloqueios: 0, regras: {} };
  for (const s of Object.values(sessoes)) {
    total.alertas += s.alertas || 0;
    total.bloqueios += s.bloqueios || 0;
    for (const [k, v] of Object.entries(s.regras || {})) total.regras[k] = (total.regras[k] || 0) + v;
  }
  const marcador = { sessao: sessao || "sem-sessao", ts: new Date().toISOString(), ...total, sessoes };
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(marcador, null, 2) + "\n");
  } catch { /* melhor esforço */ }
  return marcador;
}

// Texto que vai para o agente (additionalContext) e para o stderr.
export const textoAlertas = (alertas) => alertas.map((a) => `[modo-deus · ${a.regra}] ${a.motivo}`).join("\n");
