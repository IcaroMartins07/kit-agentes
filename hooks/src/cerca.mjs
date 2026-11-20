// V9 · ação perigosa. Bloqueia em qualquer perfil, para qualquer agente.
// Complementa o deny-list do settings.local.json: aqui ficam as regras que precisam de contexto
// (branch atual, caminho fora do repositório, segredo no conteúdo, variantes de .env).
import fs from "node:fs";
import path from "node:path";
import { Bloqueio, barra, semHeredoc, expansor, caminhoShell } from "./comum.mjs";

const PRINCIPAIS = ["main", "master"];
// O que é do kit no projeto: fica fora do git (exclude) e não pode ser versionado nem à força.
const DO_KIT = /(^|[\\/])(\.modo-deus|graphify-out|\.claude[\\/]worktrees)([\\/]|$)|(^|[\\/])\.claude[\\/]settings\.local\.json$/;

// Arquivo de segredo? .env e variantes, menos os de exemplo; chaves e certificados.
export function ehSegredo(p) {
  const base = barra(p).split("/").pop().toLowerCase();
  if (/^\.env(\.(example|sample|template|dist|defaults))?$/.test(base) && base !== ".env") return false;
  if (base === ".env" || base.startsWith(".env.")) return true;
  return /\.(pem|key|pfx|p12)$/.test(base) || /^id_(rsa|ed25519|ecdsa|dsa)$/.test(base);
}

// Segredo escrito no conteúdo de um arquivo.
const PADROES_SEGREDO = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/, "chave privada"],
  [/\bAKIA[0-9A-Z]{16}\b/, "chave de acesso AWS"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "token do GitHub"],
  [/\bgithub_pat_[A-Za-z0-9_]{22,}\b/, "token do GitHub"],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, "chave da Anthropic"],
  [/\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/, "chave da OpenAI"],
  [/\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/, "chave de produção do Stripe"],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/, "token do Slack"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "chave do Google"],
];
export function segredoNoTexto(texto) {
  for (const [re, nome] of PADROES_SEGREDO) if (re.test(texto || "")) return nome;
  return null;
}

function branchAtual(dir) {
  try {
    let gitDir = path.join(dir, ".git");
    if (fs.statSync(gitDir).isFile()) gitDir = path.resolve(dir, fs.readFileSync(gitDir, "utf8").match(/gitdir:\s*(.+)/)[1].trim());
    const m = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").match(/ref:\s*refs\/heads\/(.+)/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

// Divide em comandos simples (;, &&, ||, |, quebra de linha) para olhar cada um, sem cortar dentro de aspas.
function partes(cmd) {
  const out = [];
  let cur = "", q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === "\\" && q === '"') { cur += c + (cmd[++i] ?? ""); continue; }
      if (c === q) q = null;
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") q = c;
    else if (cmd.startsWith("&&", i) || cmd.startsWith("||", i)) { out.push(cur); cur = ""; i++; continue; }
    else if (c === ";" || c === "|" || c === "\n") { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}
// Busca (grep, rg): o primeiro argumento, ou o que vem depois de -e, é padrão, não arquivo.
const BUSCA = /^(e|f)?grep$|^rg$|^ag$/;
function semPadraoDeBusca(w) {
  const args = w.slice(1);
  if (!BUSCA.test(w[0])) return args;
  const e = args.findIndex((x) => /^-[a-zA-Z]*e$|^--regexp$/.test(x));
  const i = e >= 0 ? e + 1 : args.findIndex((x) => !x.startsWith("-"));
  return args.filter((_, j) => j !== i);
}
const palavras = (s) => s.match(/"[^"]*"|'[^']*'|\S+/g)?.map((w) => w.replace(/^["']|["']$/g, "")) || [];

const DEPLOY = [
  [/^(npm|pnpm|yarn|bun)\s+publish\b/, "publicação de pacote"],
  [/^(vercel|vc)\b.*(--prod\b|\bdeploy\b.*--prod)/, "deploy de produção (Vercel)"],
  [/^netlify\s+deploy\b.*--prod/, "deploy de produção (Netlify)"],
  [/^firebase\s+deploy\b/, "deploy (Firebase)"],
  [/^(fly|flyctl)\s+deploy\b/, "deploy (Fly)"],
  [/^gh\s+release\s+create\b/, "publicação de release"],
  [/^docker\s+push\b/, "publicação de imagem"],
  [/^terraform\s+(apply|destroy)\b/, "mudança de infraestrutura"],
  [/^(kubectl|helm)\s+(apply|delete|install|upgrade|uninstall)\b/, "mudança em cluster"],
  [/^supabase\s+db\s+push\b/, "migração no banco remoto"],
  [/^(npx\s+)?prisma\s+migrate\s+deploy\b/, "migração no banco remoto"],
  [/^git\s+push\s+heroku\b/, "deploy (Heroku)"],
];

export function checarCerca(entrada, ctx) {
  const t = entrada.tool_name;
  const i = entrada.tool_input || {};
  const bloq = (motivo) => { throw new Bloqueio("V9", `${motivo}. Ação bloqueada em qualquer perfil; se for mesmo necessária, peça ao usuário para fazer.`); };

  if (["Read", "Edit", "Write", "MultiEdit", "NotebookEdit"].includes(t)) {
    const arq = i.file_path || i.notebook_path || "";
    if (ehSegredo(arq)) bloq(`${t === "Read" ? "Leitura" : "Escrita"} de arquivo de segredo (${barra(arq).split("/").pop()})`);
    if (t !== "Read") {
      const texto = [i.content, i.new_string, ...(i.edits || []).map((e) => e.new_string), i.new_source].filter(Boolean).join("\n");
      const s = segredoNoTexto(texto);
      if (s) bloq(`Gravação de ${s} em arquivo. Use variável de ambiente e .env.example com placeholder`);
    }
    return;
  }
  if (t !== "Bash") return;

  const cmd = i.command || "";
  const s = segredoNoTexto(cmd);
  if (s) bloq(`Comando contém ${s}`);
  // A branch é a de onde cada parte roda: segue o cd, o git -C e a troca de branch feita antes no mesmo comando.
  const expandir = expansor(cmd);
  let dir = ctx.trabalho;
  let ramo; // undefined: lê do disco

  for (const p of partes(semHeredoc(cmd))) {
    const w = palavras(p).map(expandir);
    if (w[0] === "cd") { dir = path.resolve(dir, caminhoShell(w[1] || "~")); ramo = undefined; continue; }
    const opcoes = w[0] === "git" ? w.slice(1) : [];
    let iSub = 0;
    while (iSub < opcoes.length && opcoes[iSub].startsWith("-")) iSub += /^-[Cc]$/.test(opcoes[iSub]) ? 2 : 1;
    const sub = w[0] === "git" ? opcoes[iSub] : null;
    const iC = opcoes.slice(0, iSub).indexOf("-C");
    const branch = iC >= 0 ? branchAtual(path.resolve(dir, caminhoShell(opcoes[iC + 1]))) : ramo !== undefined ? ramo : branchAtual(dir);
    const naPrincipal = branch && PRINCIPAIS.includes(branch);

    if (w[0] === "git" && sub === "push") {
      const resto = w.slice(w.indexOf("push") + 1);
      if (resto.some((x) => /^(--force(-with-lease)?(=.*)?|-f|--mirror)$/.test(x) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(x) || /^\+/.test(x))) bloq("push forçado");
      if (resto.some((x) => x === "--delete" || x === "-d" || /^:[^/]/.test(x))) bloq("remoção de branch remota");
      const refs = resto.filter((x) => !x.startsWith("-"));
      const destino = refs.length >= 2 ? refs.slice(1) : [];
      if (destino.some((r) => PRINCIPAIS.includes(r.split(":").pop().replace(/^refs\/heads\//, "")))) bloq("push para a branch principal");
      if (!destino.length && naPrincipal) bloq(`push estando na branch principal (${branch})`);
    }
    if (w[0] === "git" && sub === "add" && w.some((x) => x === "-f" || x === "--force" || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(x)) && w.some((x) => DO_KIT.test(x))) bloq("versionar arquivo do kit (.modo-deus, graphify-out, worktrees ou settings local): o kit só auxilia, não entra no git do projeto");
    if (w[0] === "git" && sub === "reset" && w.includes("--hard")) bloq("git reset --hard");
    if (w[0] === "git" && sub === "clean" && w.some((x) => /^-[a-zA-Z]*f/.test(x) || x === "--force")) bloq("git clean -f");
    if (w[0] === "git" && sub === "branch" && w.some((x) => x === "-D" || (x === "--delete" && w.includes("--force")))) bloq("remoção forçada de branch");
    if (w[0] === "git" && ["merge", "rebase"].includes(sub) && naPrincipal && !w.includes("--abort")) bloq(`${sub} direto na branch principal (${branch})`);
    if (w[0] === "git" && sub === "checkout" && w.includes("--") && w.includes(".")) bloq("git checkout -- . (descarta alterações locais)");

    if (w[0] === "rm" && w.some((x) => /^-[a-zA-Z]*[rR]/.test(x) || x === "--recursive")) {
      for (const alvo of w.slice(1).filter((x) => !x.startsWith("-"))) {
        if (/^(~|\$HOME|\$\{HOME\}|\/|\*|\.\.?)$/.test(alvo) || alvo.startsWith("~/") || alvo.startsWith("$HOME")) bloq(`rm recursivo em ${alvo}`);
        const abs = path.resolve(ctx.trabalho, alvo);
        const rel = path.relative(ctx.raiz, abs);
        if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) bloq(`rm recursivo fora do projeto ou na raiz dele (${alvo})`);
        if (/^\.git([\\/]|$)/.test(rel)) bloq("rm recursivo no .git");
      }
    }

    // leitura ou cópia de segredo pelo shell; criar .env a partir do exemplo é permitido
    if (/^cp\s+\S*\.env\.(example|sample|template|dist)\s+\S*\.env\s*$/.test(p)) continue;
    // git rm --cached .env (tirar do versionamento) é o caminho certo; git add .env não.
    // Texto com espaço ou sinais de regex (mensagem de commit, padrão) não é caminho de arquivo.
    const seg = semPadraoDeBusca(w).find((x) => !x.startsWith("-") && !/[\s^|()[\]{}]/.test(x) && ehSegredo(x));
    const liberado = ["echo", "printf"].includes(w[0]) || (w[0] === "git" && sub === "rm");
    if (seg && !liberado) bloq(`acesso a arquivo de segredo pelo shell (${seg})`);

    for (const [re, nome] of DEPLOY) if (re.test(p)) bloq(nome);

    // Troca de branch vale para as partes seguintes. checkout sem -b só conta se for para a principal:
    // "git checkout arquivo" não pode passar por troca de branch.
    if (iC < 0 && (sub === "switch" || sub === "checkout")) {
      const resto = opcoes.slice(iSub + 1);
      const iN = resto.findIndex((x) => /^-[cCbB]$/.test(x));
      const nome = iN >= 0 ? resto[iN + 1] : resto.find((x) => !x.startsWith("-"));
      if (resto.includes("--detach")) ramo = null;
      else if (iN >= 0 || sub === "switch" || PRINCIPAIS.includes(nome)) ramo = nome;
    }
  }
}
