// Contrato do plano (.modo-deus/plano.json) e das respostas da Revisão.
// Usado pelo hook (bloqueia gravar plano inválido), pelo Maestro (valida antes de pedir aprovação)
// e pelo SubagentStop da Revisão (exige o veredito no formato).
//
// CLI: node plano.mjs validar <plano.json>      → lista de erros, exit 1 se houver
//      node plano.mjs veredito <arquivo-texto>  → valida o bloco de veredito da Revisão
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kit as kitPadrao, casaGlob, territoriosDe } from "./comum.mjs";

export const STATUS_PLANO = ["rascunho", "aprovado", "executando", "revisao", "concluido", "escalado"];
export const STATUS_TAREFA = ["pendente", "em_andamento", "pronta", "em_revisao", "reprovada", "concluida"];
export const MAX_RODADAS = 2;

const ehTexto = (v) => typeof v === "string" && v.trim().length > 0;
const lista = (v) => (Array.isArray(v) ? v : []);

// Escopos se sobrepõem? Caminho igual, um prefixo do outro, ou glob de um casando com o caminho do outro.
function sobrepoe(a, b) {
  const limpa = (x) => x.replace(/\/\*\*$/, "").replace(/\/$/, "");
  for (const x of a) for (const y of b) {
    if (x === y) return `${x}`;
    const [lx, ly] = [limpa(x), limpa(y)];
    if (!/[*?]/.test(lx) && !/[*?]/.test(ly) && (lx.startsWith(ly + "/") || ly.startsWith(lx + "/") || lx === ly)) return `${x} × ${y}`;
    if (/[*?]/.test(x) && !/[*?]/.test(y) && casaGlob(y, x)) return `${x} × ${y}`;
    if (/[*?]/.test(y) && !/[*?]/.test(x) && casaGlob(x, y)) return `${x} × ${y}`;
  }
  return null;
}

// Tipo do problema apontado pela Revisão: a retro usa para achar a skill que deveria ter evitado.
export const CATEGORIAS = ["padrao", "seguranca", "desempenho", "correcao", "teste", "escopo", "legibilidade", "visual"];

// Um item de escopo ("src/app/**" ou "src/app/page.tsx") vira um caminho de exemplo para testar contra os territórios.
const exemploDe = (escopo) => String(escopo).replace(/\/\*\*?$/, "/x.ts").replace(/\*\*?/g, "x");

// territorios: { front: [globs], back: [...], testes: [...] }, do REGRAS.md do projeto; sem ele, não confere.
export function escopoForaDoTerritorio(tarefa, territorios, kit = kitPadrao()) {
  if (!territorios || !tarefa?.time) return [];
  const def = kit.agentes?.[tarefa.time];
  if (!def || def.somente_leitura) return [];
  const meu = def.time === "qa" ? "testes" : def.territorio;
  if (!territorios[meu]?.length) return []; // território não definido no REGRAS.md: nada a conferir
  const casa = (rel, t) => (territorios[t] || []).some((g) => casaGlob(rel, g));
  const erros = [];
  for (const item of lista(tarefa.escopo)) {
    const rel = exemploDe(item);
    if (casa(rel, meu)) continue;
    if (def.time === "qa") { erros.push(`${tarefa.id}: ${item} não está no território "testes" do ${tarefa.time}`); continue; }
    const donos = Object.keys(territorios).filter((t) => t !== meu && t !== "testes" && casa(rel, t));
    if (donos.length) erros.push(`${tarefa.id}: ${item} é do território ${donos.join(", ")}, não de ${meu} (${tarefa.time}); mova para uma tarefa do time dono`);
  }
  return erros;
}

export function validarPlano(plano, { kit = kitPadrao(), config = {}, territorios = null } = {}) {
  const e = [];
  if (!plano || typeof plano !== "object" || Array.isArray(plano)) return ["o plano precisa ser um objeto JSON"];
  if (plano.versao !== 1) e.push("versao deve ser 1");
  if (!ehTexto(plano.pedido)) e.push("pedido: descreva o pedido do usuário");
  if (!STATUS_PLANO.includes(plano.status)) e.push(`status deve ser um de: ${STATUS_PLANO.join(", ")}`);
  if (plano.status !== "rascunho" && !ehTexto(plano.aprovado_em)) e.push("aprovado_em: plano fora de rascunho precisa da data da aprovação do usuário");
  if (plano.branch !== undefined && (!ehTexto(plano.branch) || ["main", "master"].includes(plano.branch))) e.push("branch: use uma branch de feature, nunca a principal");

  const spec = plano.spec || {};
  if (!ehTexto(spec.objetivo)) e.push("spec.objetivo é obrigatório");
  const cas = lista(spec.criterios_aceite);
  if (!cas.length) e.push("spec.criterios_aceite: pelo menos um critério verificável");
  const idsCa = new Set();
  for (const [i, c] of cas.entries()) {
    if (!/^CA\d+$/.test(c?.id || "")) e.push(`spec.criterios_aceite[${i}].id deve ser CA1, CA2...`);
    else if (idsCa.has(c.id)) e.push(`critério ${c.id} repetido`);
    else idsCa.add(c.id);
    if (!ehTexto(c?.texto)) e.push(`critério ${c?.id || i}: texto obrigatório`);
    if (c?.contrato !== undefined) {
      const k = c.contrato;
      const ids = k?.ids_teste;
      if (!k || typeof k !== "object" || Array.isArray(k)) e.push(`critério ${c?.id || i}: contrato deve ser um objeto { ids_teste, api }`);
      else if ((ids !== undefined && (!Array.isArray(ids) || !ids.every(ehTexto))) || (k.api !== undefined && !ehTexto(k.api)) || (!lista(ids).length && !ehTexto(k.api))) e.push(`critério ${c?.id || i}: contrato precisa de ids_teste (lista de textos) e/ou api (texto)`);
    }
  }

  const tarefas = lista(plano.tarefas);
  if (!tarefas.length) e.push("tarefas: o plano precisa de pelo menos uma tarefa");
  // Dev e QA no mesmo critério trabalham em paralelo sem ler um ao outro: o contrato combina seletores e API antes.
  // Plano que já começou (alguma tarefa saiu de "pendente") segue como foi aprovado, mesmo de antes da regra da 0.4.0;
  // plano novo precisa do contrato, inclusive o gravado direto como "aprovado".
  const QA_PARALELO = ["qa-unit", "qa-integracao", "qa-e2e", "qa-ui"];
  const comecou = tarefas.some((t) => t?.status && t.status !== "pendente");
  for (const c of comecou ? [] : cas) {
    if (!c?.id || c.contrato) continue;
    const doCa = tarefas.filter((t) => lista(t?.criterios).includes(c.id));
    if (doCa.some((t) => String(t?.time || "").startsWith("dev-") && t.time !== "dev-docs") && doCa.some((t) => QA_PARALELO.includes(t?.time))) e.push(`critério ${c.id}: Dev e QA trabalham nele em paralelo; defina contrato { ids_teste, api } para os dois seguirem o mesmo`);
  }
  const ids = new Map();
  for (const [i, t] of tarefas.entries()) {
    const nome = t?.id || `tarefas[${i}]`;
    e.push(...escopoForaDoTerritorio(t, territorios, kit));
    if (!/^T\d+$/.test(t?.id || "")) e.push(`${nome}: id deve ser T1, T2...`);
    else if (ids.has(t.id)) e.push(`${t.id} repetida`);
    else ids.set(t.id, t);
    if (!ehTexto(t?.titulo)) e.push(`${nome}: titulo obrigatório`);

    const ag = kit.agentes[t?.time];
    if (!ag) e.push(`${nome}: time "${t?.time}" não existe no kit`);
    else if (!["dev", "qa"].includes(ag.time)) e.push(`${nome}: tarefa só vai para Dev ou QA, não para ${t.time}`);
    else if (ag.sob_demanda && (config.times || {})[t.time] === "desligado") e.push(`${nome}: ${t.time} está desligado no config do projeto`);

    if (!["simples", "complexa"].includes(t?.classe)) e.push(`${nome}: classe deve ser simples ou complexa`);
    const esperado = t?.classe === "complexa" || (t?.rodadas_revisao || 0) > 0 ? "high" : "medium";
    if (t?.classe && t?.esforco !== esperado) e.push(`${nome}: esforco deve ser ${esperado} (classe ${t.classe}${t.rodadas_revisao ? ", já reprovada" : ""})`);

    if (!lista(t?.escopo).length || !t.escopo.every(ehTexto)) e.push(`${nome}: escopo lista os arquivos ou globs que a tarefa pode tocar`);
    if (lista(t?.escopo).some((p) => p.startsWith("/") || /^[A-Za-z]:/.test(p) || p.includes(".."))) e.push(`${nome}: escopo usa caminhos relativos à raiz, sem ..`);
    // mapa: os arquivos que o grafo apontou para a tarefa, que vão no prompt (o agente começa por eles em vez de varrer pastas)
    if (t?.mapa !== undefined && (!Array.isArray(t.mapa) || !t.mapa.every((p) => ehTexto(p) && !p.startsWith("/") && !/^[A-Za-z]:/.test(p) && !p.includes("..")))) e.push(`${nome}: mapa é a lista de arquivos (relativos à raiz) que o grafo apontou para a tarefa`);
    if (!lista(t?.criterios).length) e.push(`${nome}: criterios liga a tarefa a pelo menos um CA`);
    for (const c of lista(t?.criterios)) if (!idsCa.has(c)) e.push(`${nome}: critério ${c} não existe na spec`);
    if (!ehTexto(t?.pronto_quando)) e.push(`${nome}: pronto_quando obrigatório`);
    if (!ehTexto(t?.como_testar)) e.push(`${nome}: como_testar obrigatório`);
    if (!STATUS_TAREFA.includes(t?.status)) e.push(`${nome}: status deve ser um de: ${STATUS_TAREFA.join(", ")}`);
    if ((t?.rodadas_revisao || 0) > MAX_RODADAS && plano.status !== "escalado") e.push(`${nome}: passou de ${MAX_RODADAS} rodadas de revisão; o plano deve ir para "escalado" e o usuário decide`);
  }

  // dependências: existem e não formam ciclo
  for (const t of tarefas) for (const d of lista(t?.depende_de)) if (!ids.has(d)) e.push(`${t.id}: depende de ${d}, que não existe`);
  const alcanca = (de, para, vistos = new Set()) => {
    if (vistos.has(de)) return false;
    vistos.add(de);
    return lista(ids.get(de)?.depende_de).some((d) => d === para || alcanca(d, para, vistos));
  };
  for (const t of tarefas) if (t?.id && alcanca(t.id, t.id)) e.push(`${t.id}: dependência circular`);

  // tarefas que podem correr em paralelo (nenhuma depende da outra) precisam de escopos disjuntos
  const ts = tarefas.filter((t) => ids.get(t?.id) === t);
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
    const [a, b] = [ts[i], ts[j]];
    if (alcanca(a.id, b.id) || alcanca(b.id, a.id)) continue;
    const s = sobrepoe(lista(a.escopo), lista(b.escopo));
    if (s) e.push(`${a.id} e ${b.id} rodam em paralelo com escopo sobreposto (${s}); adicione depende_de ou separe os arquivos`);
  }

  for (const [i, r] of lista(plano.itens_revisao).entries()) {
    const n = r?.id || `itens_revisao[${i}]`;
    if (!/^R\d+$/.test(r?.id || "")) e.push(`${n}: id deve ser R1, R2...`);
    if (!ids.has(r?.tarefa)) e.push(`${n}: tarefa ${r?.tarefa} não existe`);
    if (!["alta", "media", "baixa"].includes(r?.gravidade)) e.push(`${n}: gravidade alta, media ou baixa`);
    if (!ehTexto(r?.motivo)) e.push(`${n}: motivo obrigatório`);
    if (!["aberto", "resolvido", "descartado"].includes(r?.status)) e.push(`${n}: status aberto, resolvido ou descartado`);
    if (r?.categoria !== undefined && !CATEGORIAS.includes(r.categoria)) e.push(`${n}: categoria deve ser uma de: ${CATEGORIAS.join(", ")}`);
  }
  return e;
}

// ---------- veredito da Revisão ----------
// O revisor termina com um bloco ```json { "veredito": "aprovado" | "reprovado", "itens": [...] } ```.
export function lerVeredito(texto) {
  const blocos = [...String(texto || "").matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1]);
  if (!blocos.length) return { erros: ["termine com um bloco ```json contendo veredito e itens"] };
  let v;
  try {
    v = JSON.parse(blocos[blocos.length - 1]);
  } catch (x) {
    return { erros: [`o bloco json final não é JSON válido: ${x.message}`] };
  }
  const e = [];
  if (!["aprovado", "reprovado"].includes(v.veredito)) e.push('veredito deve ser "aprovado" ou "reprovado"');
  const itens = lista(v.itens);
  if (!Array.isArray(v.itens)) e.push("itens deve ser uma lista (vazia se aprovado sem ressalvas)");
  for (const [i, it] of itens.entries()) {
    if (!/^T\d+$/.test(it?.tarefa || "")) e.push(`itens[${i}].tarefa: id da tarefa (T1...)`);
    if (!["alta", "media", "baixa"].includes(it?.gravidade)) e.push(`itens[${i}].gravidade: alta, media ou baixa`);
    if (!ehTexto(it?.arquivo)) e.push(`itens[${i}].arquivo obrigatório`);
    if (it?.linha !== undefined && !Number.isInteger(it.linha)) e.push(`itens[${i}].linha deve ser número inteiro`);
    if (!ehTexto(it?.motivo)) e.push(`itens[${i}].motivo obrigatório`);
    if (it?.categoria !== undefined && !CATEGORIAS.includes(it.categoria)) e.push(`itens[${i}].categoria: uma de ${CATEGORIAS.join(", ")}`);
  }
  if (v.veredito === "reprovado" && !itens.some((it) => it?.gravidade === "alta" || it?.gravidade === "media")) e.push("reprovado exige pelo menos um item de gravidade alta ou media");
  if (v.veredito === "aprovado" && itens.some((it) => it?.gravidade === "alta")) e.push("aprovado não pode ter item de gravidade alta");
  return { veredito: v, erros: e };
}

// ---------- relatório do auditor de fatos ----------
export function lerAuditoria(texto) {
  const blocos = [...String(texto || "").matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1]);
  if (!blocos.length) return { erros: ["termine com um bloco ```json contendo afirmacoes"] };
  let a;
  try { a = JSON.parse(blocos[blocos.length - 1]); } catch (x) { return { erros: [`json inválido: ${x.message}`] }; }
  const e = [];
  if (!Array.isArray(a.afirmacoes)) e.push("afirmacoes deve ser uma lista");
  for (const [i, f] of lista(a.afirmacoes).entries()) {
    if (!ehTexto(f?.texto)) e.push(`afirmacoes[${i}].texto obrigatório`);
    if (!["confirmada", "nao_confirmada", "falsa"].includes(f?.status)) e.push(`afirmacoes[${i}].status: confirmada, nao_confirmada ou falsa`);
    if (f?.status === "confirmada" && !ehTexto(f?.evidencia)) e.push(`afirmacoes[${i}]: confirmada exige evidencia (arquivo:linha, comando e saída)`);
  }
  return { auditoria: a, erros: e };
}

// ---------- entrega de tarefa (Dev e QA) ----------
// Bloco final: { tarefa, status: "pronta"|"bloqueada", branch, commits, arquivos, testes: [{comando, resultado, resumo}], observacoes }
// "pronta" exige commit e teste rodado. Só o QA pode entregar com teste "falhou_esperado"
// (teste de aceite escrito antes da implementação).
const ultimoBloco = (texto) => {
  const b = [...String(texto || "").matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1]);
  if (!b.length) return { erro: "termine com um bloco ```json no formato combinado" };
  try { return { valor: JSON.parse(b[b.length - 1]) }; } catch (x) { return { erro: `o bloco json final não é JSON válido: ${x.message}` }; }
};

export function lerEntrega(texto, { time = "dev" } = {}) {
  const { valor: v, erro } = ultimoBloco(texto);
  if (erro) return { erros: [erro] };
  const e = [];
  if (!/^T\d+$/.test(v.tarefa || "")) e.push("tarefa: id da tarefa (T1...)");
  if (!["pronta", "bloqueada"].includes(v.status)) e.push('status: "pronta" ou "bloqueada"');
  const resultados = time === "qa" ? ["passou", "falhou", "falhou_esperado"] : ["passou", "falhou"];
  for (const [i, t] of lista(v.testes).entries()) {
    if (!ehTexto(t?.comando)) e.push(`testes[${i}].comando: o comando exato que rodou`);
    if (!resultados.includes(t?.resultado)) e.push(`testes[${i}].resultado: ${resultados.join(", ")}`);
  }
  if (v.status === "pronta") {
    if (!ehTexto(v.branch)) e.push("pronta exige branch da tarefa");
    if (!lista(v.commits).length) e.push("pronta exige pelo menos um commit na branch da tarefa");
    if (!lista(v.arquivos).length) e.push("pronta exige a lista de arquivos alterados");
    if (!lista(v.testes).length) e.push("pronta exige os testes rodados depois da última edição");
    if (lista(v.testes).some((t) => t?.resultado === "falhou")) e.push("pronta com teste falhando: corrija ou entregue como bloqueada");
  }
  if (v.status === "bloqueada" && !ehTexto(v.observacoes)) e.push("bloqueada exige o motivo em observacoes");
  return { entrega: v, erros: e };
}

// ---------- regressão ----------
// { resultado: "verde"|"vermelho", suites: [{comando, resultado, resumo}], falhas: [{teste, arquivo, tarefa_provavel, saida}] }
export function lerRegressao(texto) {
  const { valor: v, erro } = ultimoBloco(texto);
  if (erro) return { erros: [erro] };
  const e = [];
  if (!["verde", "vermelho"].includes(v.resultado)) e.push('resultado: "verde" ou "vermelho"');
  if (!lista(v.suites).length) e.push("suites: cada suíte rodada, com comando e resultado");
  for (const [i, s] of lista(v.suites).entries()) {
    if (!ehTexto(s?.comando)) e.push(`suites[${i}].comando obrigatório`);
    if (!["passou", "falhou"].includes(s?.resultado)) e.push(`suites[${i}].resultado: passou ou falhou`);
  }
  for (const [i, f] of lista(v.falhas).entries()) {
    if (!ehTexto(f?.teste)) e.push(`falhas[${i}].teste obrigatório`);
    if (!ehTexto(f?.saida)) e.push(`falhas[${i}].saida: trecho real da saída`);
  }
  const falhou = lista(v.suites).some((s) => s?.resultado === "falhou");
  if (v.resultado === "verde" && (falhou || lista(v.falhas).length)) e.push("verde não pode ter suíte falhando nem falhas");
  if (v.resultado === "vermelho" && !lista(v.falhas).length) e.push("vermelho exige as falhas");
  return { regressao: v, erros: e };
}

// Contrato de saída de cada agente do kit (usado no SubagentStop).
export function contratoDe(nome, kitDef = kitPadrao()) {
  const def = kitDef.agentes[nome];
  if (!def) return null;
  if (nome === "auditor-de-fatos") return lerAuditoria;
  if (def.time === "revisao") return lerVeredito;
  if (nome === "qa-regressao") return lerRegressao;
  if (def.time === "dev" || def.time === "qa") return (t) => lerEntrega(t, { time: def.time });
  return null;
}

// Modelo do bloco final de cada papel, mostrado quando o contrato recusa a resposta (a recusa custa uma
// rodada inteira com o contexto do agente; com o modelo, ela não se repete).
const MODELOS = {
  entrega: { tarefa: "T1", status: "pronta", branch: "feat/x-T1", commits: ["abc1234"], arquivos: ["src/a.ts"], testes: [{ comando: "npm test", resultado: "passou", resumo: "12 passaram" }], observacoes: "" },
  veredito: { veredito: "reprovado", itens: [{ tarefa: "T1", gravidade: "media", arquivo: "src/a.ts", linha: 10, motivo: "o quê e por quê", categoria: "correcao" }] },
  auditoria: { afirmacoes: [{ texto: "a afirmação do relatório", status: "confirmada", evidencia: "src/a.ts:10" }] },
  regressao: { resultado: "verde", suites: [{ comando: "npm test", resultado: "passou", resumo: "120 passaram" }], falhas: [] },
};
export function modeloDe(nome, kitDef = kitPadrao()) {
  const def = kitDef.agentes[nome];
  if (!def) return null;
  const m = nome === "auditor-de-fatos" ? MODELOS.auditoria : def.time === "revisao" ? MODELOS.veredito : nome === "qa-regressao" ? MODELOS.regressao : MODELOS.entrega;
  return "```json\n" + JSON.stringify(m, null, 2) + "\n```";
}

// ---------- CLI ----------
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const [cmd, arq] = process.argv.slice(2);
  let erros;
  try {
    const txt = fs.readFileSync(arq, "utf8");
    if (cmd === "validar") {
      const cfgF = path.join(path.dirname(path.resolve(arq)), "config.json");
      const config = fs.existsSync(cfgF) ? JSON.parse(fs.readFileSync(cfgF, "utf8")) : {};
      const regrasF = path.join(path.dirname(path.resolve(arq)), "REGRAS.md");
      const territorios = fs.existsSync(regrasF) ? territoriosDe(fs.readFileSync(regrasF, "utf8")) : null;
      erros = validarPlano(JSON.parse(txt), { config, territorios });
    } else if (cmd === "veredito") erros = lerVeredito(txt).erros;
    else if (cmd === "auditoria") erros = lerAuditoria(txt).erros;
    else erros = ["uso: node plano.mjs validar|veredito|auditoria <arquivo>"];
  } catch (x) {
    erros = [x.message];
  }
  if (erros.length) {
    console.error(erros.map((x) => `- ${x}`).join("\n"));
    process.exitCode = 1;
  } else console.log("ok");
}
