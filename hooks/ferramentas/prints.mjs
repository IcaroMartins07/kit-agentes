#!/usr/bin/env node
// Prints de uma página em três larguras (celular, tablet, desktop) com o Chrome ou o Edge da máquina, sem dependências.
// Feito uma vez, na feature integrada, pelo qa-regressao; o revisor e a crítica de design olham estes arquivos em vez
// de abrir o navegador de novo a cada rodada.
//
// Uso: node prints.mjs <url> <pasta> [larguras]      ex.: node prints.mjs http://localhost:3000 .modo-deus/prints/feat 390,768,1440
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const LARGURAS = [390, 768, 1440];
// Altura generosa: o print pega a página até aqui (o headless não rola sozinho).
const ALTURA = { 390: 2400, 768: 2200, 1440: 2000 };

const CANDIDATOS = {
  win32: [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ],
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
  linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"],
};

export function acharNavegador(existe = fs.existsSync, plataforma = process.platform, env = process.env) {
  if (env.CHROME_PATH && existe(env.CHROME_PATH)) return env.CHROME_PATH;
  return (CANDIDATOS[plataforma] || CANDIDATOS.linux).find((c) => existe(c)) || null;
}

// O que roda para cada largura: argumentos do navegador e o arquivo de saída. Sem efeito colateral: testável.
export function planoDePrints(url, pasta, larguras = LARGURAS) {
  if (!/^(https?|file):\/\//.test(url)) throw new Error(`url precisa começar com http://, https:// ou file:// (${url})`);
  return larguras.map((w) => {
    const arquivo = path.join(pasta, `${w}.png`);
    return { largura: w, arquivo, args: ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--window-size=${w},${ALTURA[w] || 2000}`, "--virtual-time-budget=5000", `--screenshot=${arquivo}`, url] };
  });
}

function main() {
  const [url, pasta, lista] = process.argv.slice(2);
  if (!url || !pasta) {
    console.error("uso: node prints.mjs <url> <pasta> [larguras, ex.: 390,768,1440]");
    process.exit(2);
  }
  const nav = acharNavegador();
  if (!nav) {
    console.error("Chrome ou Edge não encontrado: defina CHROME_PATH com o caminho do navegador.");
    process.exit(1);
  }
  const larguras = lista ? lista.split(",").map(Number).filter((n) => n > 0) : LARGURAS;
  fs.mkdirSync(pasta, { recursive: true });
  let falhas = 0;
  let plano;
  try { plano = planoDePrints(url, path.resolve(pasta), larguras); } catch (e) { console.error(e.message); process.exit(2); }
  for (const p of plano) {
    const r = spawnSync(nav, p.args, { stdio: "ignore", timeout: 60000 });
    const ok = r.status === 0 && fs.existsSync(p.arquivo);
    if (!ok) falhas++;
    console.log(`${ok ? "ok   " : "FALHA"} ${p.largura}px → ${p.arquivo}`);
  }
  process.exit(falhas ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
