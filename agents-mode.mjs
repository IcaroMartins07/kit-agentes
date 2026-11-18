#!/usr/bin/env node
// agents-mode: instala e configura o kit de agentes num projeto, de uma vez.
//   1. plugin do kit: marketplace kit-agentes e modo-deus@kit-agentes (escopo user; atualiza se já existem)
//   2. mods de interface do kit: o painel de agentes por padrão (--mods escolhe), e atualiza os que já estiverem instalados
//   3. dependências: plugins obrigatórios e graphify (instalar.mjs dependencias)
//   4. parte do projeto: REGRAS.md, config, deny-list, exclude, grafo (instalar.mjs); nada disso entra no git do projeto
//   5. conferência: instalar.mjs doctor
//
// Uso:
//   agents-mode [caminho] [--perfil leve|estrito|deus] [--times dev-mobile=ligado,...] [--statusline]
//               [--sem-grafo] [--escopo local|user] [--mods painel-agentes,temas,...|todos|nenhum] [--dry-run]
// Sem caminho, usa a pasta atual. --escopo vale só para as dependências.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const KIT = path.dirname(fileURLToPath(import.meta.url));
const INSTALAR = path.join(KIT, "instalar.mjs");
const MARKETPLACE = "kit-agentes";
const PLUGIN = `modo-deus@${MARKETPLACE}`;
// Mods de interface do kit (os do marketplace, menos o próprio plugin). O painel de agentes vem por padrão.
const MODS_DO_KIT = JSON.parse(fs.readFileSync(path.join(KIT, ".claude-plugin", "marketplace.json"), "utf8")).plugins.map((p) => p.name).filter((n) => n !== "modo-deus");
const MODS_PADRAO = ["painel-agentes"];

export class ErroUso extends Error {}

// Separa os argumentos de cada passo. Sem efeito colateral: testável.
export function montarPassos(argv, { marketplaces = [], plugins = [] } = {}) {
  const proj = [], deps = [], inst = [];
  let caminho = null, dry = false, mods = MODS_PADRAO;
  const resto = [...argv];
  while (resto.length) {
    const a = resto.shift();
    if (a === "--dry-run") dry = true;
    else if (a === "--escopo") {
      const v = resto.shift();
      if (!["local", "user"].includes(v)) throw new ErroUso("--escopo precisa ser local ou user");
      deps.push("--escopo", v);
    } else if (a === "--perfil" || a === "--times") {
      const v = resto.shift();
      if (!v || v.startsWith("-")) throw new ErroUso(`${a} precisa de um valor`);
      inst.push(a, v);
    } else if (a === "--mods") {
      const v = resto.shift();
      if (!v || v.startsWith("-")) throw new ErroUso("--mods precisa de uma lista, todos ou nenhum");
      mods = v === "todos" ? MODS_DO_KIT : v === "nenhum" ? [] : v.split(",").map((x) => x.trim()).filter(Boolean);
      const errado = mods.find((m) => !MODS_DO_KIT.includes(m));
      if (errado) throw new ErroUso(`mod desconhecido: ${errado} (há: ${MODS_DO_KIT.join(", ")})`);
    } else if (a === "--statusline" || a === "--sem-grafo") inst.push(a);
    else if (a === "-h" || a === "--help") throw new ErroUso("");
    else if (a.startsWith("-")) throw new ErroUso(`opção desconhecida: ${a}`);
    else if (caminho) throw new ErroUso("informe um caminho só");
    else caminho = path.resolve(a);
  }
  caminho ??= process.cwd();
  proj.push(caminho);
  const seco = dry ? ["--dry-run"] : [];
  const passos = [
    marketplaces.includes(MARKETPLACE)
      ? { descricao: "atualizar o marketplace do kit", bin: "claude", args: ["plugin", "marketplace", "update", MARKETPLACE] }
      : { descricao: "registrar o marketplace do kit", bin: "claude", args: ["plugin", "marketplace", "add", KIT] },
    plugins.includes(PLUGIN)
      ? { descricao: "atualizar o plugin modo-deus", bin: "claude", args: ["plugin", "update", PLUGIN] }
      : { descricao: "instalar o plugin modo-deus", bin: "claude", args: ["plugin", "install", PLUGIN, "--scope", "user"] },
    // Mods escolhidos que faltam são instalados; os do kit que já estão instalados são atualizados.
    ...mods.filter((m) => !plugins.includes(`${m}@${MARKETPLACE}`)).map((m) => ({ descricao: `instalar o mod ${m}`, bin: "claude", args: ["plugin", "install", `${m}@${MARKETPLACE}`, "--scope", "user"] })),
    ...plugins.filter((id) => id.endsWith(`@${MARKETPLACE}`) && id !== PLUGIN).map((id) => ({ descricao: `atualizar o mod ${id.split("@")[0]}`, bin: "claude", args: ["plugin", "update", id] })),
    { descricao: "dependências (plugins e graphify)", bin: "node", args: [INSTALAR, "dependencias", ...proj, ...deps, ...seco] },
    { descricao: "kit no projeto", bin: "node", args: [INSTALAR, ...proj, ...inst, ...seco] },
    { descricao: "conferência (doctor)", bin: "node", args: [INSTALAR, "doctor", ...proj] },
  ];
  return { caminho, dry, passos, mods };
}

// installed_plugins.json guarda os ids em "plugins"; known_marketplaces.json, os nomes na raiz.
const chaves = (arq) => {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "plugins", arq), "utf8"));
    return Object.keys(j.plugins ?? j);
  } catch { return []; }
};

function rodar({ bin, args }) {
  // No Windows o claude é um .cmd: precisa de shell. Os argumentos são do próprio kit, não do usuário.
  const r = bin === "node"
    ? spawnSync(process.execPath, args, { stdio: "inherit" })
    : spawnSync(bin, args.map((x) => (/\s/.test(x) ? `"${x}"` : x)), { stdio: "inherit", shell: process.platform === "win32" });
  return r.status ?? 1;
}

function main() {
  let plano;
  try {
    plano = montarPassos(process.argv.slice(2), { marketplaces: chaves("known_marketplaces.json"), plugins: chaves("installed_plugins.json") });
  } catch (e) {
    if (!(e instanceof ErroUso)) throw e;
    if (e.message) console.error(`agents-mode: ${e.message}`);
    console.error("uso: agents-mode [caminho] [--perfil leve|estrito|deus] [--times t=modo,...] [--statusline] [--sem-grafo] [--escopo local|user] [--mods painel-agentes,temas,...|todos|nenhum] [--dry-run]");
    process.exit(e.message ? 2 : 0);
  }
  console.log(`agents-mode · kit em ${KIT}\nprojeto: ${plano.caminho}${plano.dry ? " (simulação)" : ""}\n`);
  for (const [i, p] of plano.passos.entries()) {
    console.log(`\n[${i + 1}/${plano.passos.length}] ${p.descricao}`);
    // Na simulação, os passos do claude só são mostrados; os do instalador simulam sozinhos (--dry-run).
    if (plano.dry && p.bin === "claude") { console.log(`  (simulação) ${p.bin} ${p.args.join(" ")}`); continue; }
    const st = rodar(p);
    if (st !== 0) {
      console.error(`\nagents-mode: o passo "${p.descricao}" falhou (saída ${st}). Corrija e rode de novo: os passos são idempotentes.`);
      process.exit(st);
    }
  }
  console.log("\nagents-mode: pronto. Reinicie o app do Claude (ou rode /reload-plugins) para carregar o kit.");
  if (plano.mods.includes("painel-agentes")) console.log("O painel de agentes abre sozinho à direita em cada sessão; /agentes mostra ou esconde.");
  console.log("Nada do kit entra no git do projeto: .modo-deus/, graphify-out/, .claude/worktrees/ e o settings local ficam no .git/info/exclude.");
}

// Rodado direto (node agents-mode.mjs) ou pelo link do npm (o caminho pode ser um symlink).
const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
if (process.argv[1] && real(path.resolve(process.argv[1])) === real(fileURLToPath(import.meta.url))) main();
