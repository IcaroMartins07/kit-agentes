// F5: detectores do monitor (V1, V3–V8, V10, V11), modos leve/estrito/deus, marcador de retrospectiva,
// aviso no SessionStart, status line, painel e a opção --statusline do instalador.
// Hooks rodam como o Claude Code roda: processo node, JSON no stdin, exit 2 bloqueia.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gravarEstado } from "../hooks/src/vigia.mjs";
import { gerarPainel } from "../mods/painel/gerar.mjs";
import { instalar, remover } from "../instalar.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let tmp, repo, wt1, wt2, n = 0;

const git = (dir, ...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const escrever = (base, rel, c) => {
  fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
  fs.writeFileSync(path.join(base, rel), c);
};
const REGRAS = `# Regras do projeto teste

## Comandos

| Ação | Comando |
|---|---|
| Testes | \`npm run test\` |
| Lint | \`npm run lint\` |

## Territórios

- **front**: \`src/components/**\`
- **back**: \`src/server/**\`
- **testes**: \`**/*.test.*\`, \`cypress/**\`
`;
const PLANO = {
  versao: 1, pedido: "login com Google", status: "executando", aprovado_em: "2026-11-15", branch: "feat/login",
  spec: { objetivo: "entrar com Google", criterios_aceite: [{ id: "CA1", texto: "botão entra" }] },
  tarefas: [
    { id: "T1", titulo: "rota de callback", time: "dev-back", classe: "simples", esforco: "medium", escopo: ["src/server/auth/**"], criterios: ["CA1"], pronto_quando: "x", como_testar: "npm run test", status: "em_andamento" },
    { id: "T2", titulo: "teste E2E", time: "qa-e2e", classe: "complexa", esforco: "high", escopo: ["cypress/**"], criterios: ["CA1"], pronto_quando: "x", como_testar: "cypress", status: "pendente", depende_de: ["T1"] },
  ],
};

const perfil = (p) => escrever(repo, ".modo-deus/config.json", JSON.stringify({ perfil: p, times: {} }));
const sessao = () => `s${process.pid}-${n++}`;

function rodar(arq, entrada, env = {}) {
  return spawnSync(process.execPath, [arq], {
    input: JSON.stringify(entrada),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: "", MODO_DEUS_SEM_GRAPHIFY: "1", ...env },
  });
}
const hook = (nome, entrada) => rodar(path.join(KIT, "hooks", "src", `${nome}.mjs`), { cwd: repo, ...entrada });
// Chamada de ferramenta de um agente (agente null = sessão principal).
const pre = (s, ferr, input, { agente = null, id = "a1", cwd = repo, transcript } = {}) =>
  hook("pre", { session_id: s, cwd, tool_name: ferr, tool_input: input, ...(agente ? { agent_type: `modo-deus:${agente}`, agent_id: id } : {}), ...(transcript ? (agente ? { agent_transcript_path: transcript } : { transcript_path: transcript }) : {}) });
const contexto = (r) => {
  if (!r.stdout.trim()) return "";
  const o = JSON.parse(r.stdout);
  return o.hookSpecificOutput?.additionalContext || o.systemMessage || "";
};
const telemetria = () => {
  const dir = path.join(repo, ".modo-deus/telemetria");
  return fs.readdirSync(dir).filter((f) => /^\d{4}-\d\d-\d\d\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(dir, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)));
};

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "modo-deus-vigia-"));
  repo = path.join(tmp, "repo");
  fs.mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  escrever(repo, "README.md", "x\n");
  escrever(repo, "src/server/auth/login.ts", "export const x = 1;\n");
  git(repo, "add", "-A");
  git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
  git(repo, "checkout", "-q", "-b", "feat/login");
  fs.appendFileSync(path.join(repo, ".git", "info", "exclude"), "\n.claude/\n");
  perfil("estrito");
  escrever(repo, ".modo-deus/REGRAS.md", REGRAS);
  escrever(repo, ".modo-deus/plano.json", JSON.stringify(PLANO));
  wt1 = path.join(repo, ".claude", "worktrees", "t1");
  wt2 = path.join(repo, ".claude", "worktrees", "t2");
  git(repo, "worktree", "add", "-q", "-b", "feat/login-T1", wt1);
  git(repo, "worktree", "add", "-q", "-b", "feat/login-T2", wt2);
});
after(() => {
  try { git(repo, "worktree", "remove", "--force", wt1); git(repo, "worktree", "remove", "--force", wt2); } catch { /* limpeza */ }
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ================= V1 · fuga de escopo =================
test("V1 · dev dentro do escopo da tarefa: quieto", () => {
  const r = pre(sessao(), "Edit", { file_path: path.join(wt1, "src/server/auth/login.ts") }, { agente: "dev-back", cwd: wt1 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(contexto(r), "");
});

test("V1 · fora do escopo: leve nada, estrito alerta, deus bloqueia", () => {
  const fora = { file_path: path.join(wt1, "src/server/pagamento.ts") };
  try {
    perfil("leve");
    let r = pre(sessao(), "Edit", fora, { agente: "dev-back", cwd: wt1 });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    perfil("estrito");
    r = pre(sessao(), "Edit", fora, { agente: "dev-back", cwd: wt1 });
    assert.equal(r.status, 0, r.stderr);
    assert.match(contexto(r), /\[modo-deus · V1\] src\/server\/pagamento\.ts está fora do escopo de T1/);
    perfil("deus");
    r = pre(sessao(), "Edit", fora, { agente: "dev-back", cwd: wt1 });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /V1.*fora do escopo/);
    r = pre(sessao(), "Bash", { command: "echo x > src/server/pagamento.ts" }, { agente: "dev-back", cwd: wt1 });
    assert.equal(r.status, 2, "escrita pelo Bash também conta");
  } finally {
    perfil("estrito");
  }
});

test("V1 · sem tarefa identificada (branch sem -T<n>) ou sem plano: quieto", () => {
  let r = pre(sessao(), "Edit", { file_path: path.join(repo, "src/server/pagamento.ts") }, { agente: "dev-back" });
  assert.equal(contexto(r), "");
  const f = path.join(repo, ".modo-deus/plano.json");
  fs.renameSync(f, f + ".bak");
  try {
    r = pre(sessao(), "Edit", { file_path: path.join(wt1, "src/server/pagamento.ts") }, { agente: "dev-back", cwd: wt1 });
    assert.equal(contexto(r), "");
  } finally {
    fs.renameSync(f + ".bak", f);
  }
});

// ================= V3 · alucinação de arquivo/símbolo =================
const erroFerramenta = (texto, id) => JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: true, content: `<tool_use_error>${texto}</tool_use_error>` }] } }) + "\n";

function v3(p, { erros }) {
  perfil(p);
  const s = sessao();
  const tr = path.join(tmp, `agente-${s}.jsonl`);
  fs.writeFileSync(tr, "");
  const chamada = (ferr = "Read", input = { file_path: path.join(repo, "README.md") }) => pre(s, ferr, input, { agente: "dev-back", id: `v3-${s}`, transcript: tr });
  assert.equal(chamada().status, 0);
  erros.forEach((e, i) => fs.appendFileSync(tr, erroFerramenta(e, `toolu_${i}`)));
  return chamada;
}

test("V3 · 3 falhas de arquivo: estrito alerta; deus bloqueia o próximo uso mas deixa buscar", () => {
  try {
    const falhas = ["File does not exist.", "String to replace not found in file.\nString: foo", "File does not exist."];
    let chamada = v3("estrito", { erros: falhas });
    let r = chamada();
    assert.equal(r.status, 0);
    assert.match(contexto(r), /V3.*Grep\/Glob/);

    chamada = v3("deus", { erros: falhas });
    assert.equal(chamada("Grep", { pattern: "login" }).status, 0, "Grep continua liberado");
    r = chamada("Edit", { file_path: path.join(repo, "README.md"), old_string: "a", new_string: "b" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /V3/);
    assert.equal(chamada().status, 0, "depois do bloqueio a contagem recomeça");
  } finally {
    perfil("estrito");
  }
});

test("V3 · duas falhas, ou erros que não são de arquivo: quieto", () => {
  let r = v3("estrito", { erros: ["File does not exist.", "File does not exist."] })();
  assert.equal(contexto(r), "");
  r = v3("estrito", { erros: ["Permission denied", "Exit code 1", "Exit code 2"] })();
  assert.equal(contexto(r), "");
});

// ================= V4 · comando inexistente =================
const falha = (s, erro, extra = {}) => hook("evento", { session_id: s, hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "pnpm tst" }, tool_use_id: `t${n++}`, error: erro, ...extra });

test("V4 · command not found: alerta com os comandos do REGRAS.md", () => {
  for (const erro of ["Exit code 127\nbash: line 1: pnpm: command not found", "Exit code 1\nnpm ERR! Missing script: \"tst\"", "'pnpm' não é reconhecido como um comando interno"]) {
    const r = falha(sessao(), erro);
    assert.equal(r.status, 0);
    const c = contexto(r);
    assert.match(c, /\[modo-deus · V4\]/, erro);
    assert.match(c, /Testes: `npm run test`; Lint: `npm run lint`/);
  }
});

test("V4 · teste que falhou de verdade: quieto", () => {
  assert.equal(contexto(falha(sessao(), "Exit code 1\n1 failing test: login")), "");
});

// ================= V5 e V6 · pronto sem prova, afirmação sem lastro =================
const entrega = (comando) => "Feito.\n```json\n" + JSON.stringify({ tarefa: "T1", status: "pronta", branch: "feat/login-T1", commits: ["abc123"], arquivos: ["src/server/auth/login.ts"], testes: [{ comando, resultado: "passou", resumo: "3 passaram" }] }) + "\n```";
const parar = (s, id, comando, extra = {}) => hook("evento", { session_id: s, hook_event_name: "SubagentStop", agent_type: "modo-deus:dev-back", agent_id: id, last_assistant_message: entrega(comando), ...extra });

test("V5 · testes rodados depois da última edição: quieto", () => {
  const s = sessao(), id = `v5ok-${s}`;
  pre(s, "Edit", { file_path: path.join(repo, "src/server/auth/login.ts") }, { agente: "dev-back", id });
  pre(s, "Bash", { command: "npm run test -- auth" }, { agente: "dev-back", id });
  const r = parar(s, id, "npm run test -- auth");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(contexto(r), "");
});

test("V5 · teste rodado antes da última edição: estrito alerta, deus recusa o encerramento", () => {
  try {
    for (const p of ["estrito", "deus"]) {
      perfil(p);
      const s = sessao(), id = `v5-${p}-${s}`;
      pre(s, "Bash", { command: "npm run test" }, { agente: "dev-back", id });
      pre(s, "Edit", { file_path: path.join(repo, "src/server/auth/login.ts") }, { agente: "dev-back", id });
      const r = parar(s, id, "npm run test");
      if (p === "estrito") {
        assert.equal(r.status, 0);
        assert.match(contexto(r), /V5.*não rodou depois da última edição/);
      } else {
        assert.equal(r.status, 2);
        assert.match(r.stderr, /V5/);
        assert.equal(parar(s, id, "npm run test", { stop_hook_active: true }).status, 0, "segunda tentativa encerra");
      }
    }
  } finally {
    perfil("estrito");
  }
});

test("V6 · comando citado que o agente nunca rodou: alerta", () => {
  const s = sessao(), id = `v6-${s}`;
  pre(s, "Edit", { file_path: path.join(repo, "src/server/auth/login.ts") }, { agente: "dev-back", id });
  const r = parar(s, id, "npm run test:e2e");
  assert.match(contexto(r), /V6.*não rodou: `npm run test:e2e`/);
  assert.ok(telemetria().some((l) => l.agent_id === id && l.evento === "SubagentStop" && l.regra === "V6" && l.alerta));
});

// ================= V7 · loop =================
test("V7 · mesma chamada 4 vezes: alerta no estrito; reincidência bloqueia no deus", () => {
  let s = sessao();
  const ls = () => pre(s, "Bash", { command: "npm run lint" });
  for (let i = 0; i < 3; i++) assert.equal(contexto(ls()), "");
  assert.match(contexto(ls()), /V7.*repetida 4 vezes/);
  try {
    perfil("deus");
    s = sessao();
    for (let i = 0; i < 7; i++) assert.equal(ls().status, 0, `chamada ${i + 1}`);
    const r = ls();
    assert.equal(r.status, 2);
    assert.match(r.stderr, /V7.*2ª vez/);
  } finally {
    perfil("estrito");
  }
});

test("V7 · chamadas diferentes: quieto", () => {
  const s = sessao();
  for (const c of ["npm run lint", "npm run test", "git status", "npm run lint"]) assert.equal(contexto(pre(s, "Bash", { command: c })), "");
});

test("V7 · mesmo erro 3 vezes: alerta; no deus a reincidência bloqueia a próxima chamada", () => {
  let s = sessao();
  const erro = "Exit code 1\nTypeError: cannot read 'id' of undefined at line 12";
  assert.equal(contexto(falha(s, erro)), "");
  assert.equal(contexto(falha(s, erro.replace("12", "40"))), "");
  assert.match(contexto(falha(s, erro)), /V7.*mesmo erro apareceu 3 vezes/);
  try {
    perfil("deus");
    s = sessao();
    for (let i = 0; i < 6; i++) falha(s, erro);
    const r = pre(s, "Bash", { command: "npm run test" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /V7/);
  } finally {
    perfil("estrito");
  }
});

// ================= V8 · estouro =================
test("V8 · subagente acima do teto: estrito alerta uma vez, deus bloqueia; dentro do teto quieto", () => {
  const s = sessao();
  assert.equal(contexto(pre(s, "Bash", { command: "npm run test" }, { agente: "dev-back", id: "v8ok", cwd: wt1 })), "");
  gravarEstado(repo, s, "v8", { inicio: Date.now(), chamadas: 80 }); // T1 é simples: teto de 80 chamadas
  let r = pre(s, "Bash", { command: "npm run test" }, { agente: "dev-back", id: "v8", cwd: wt1 });
  assert.match(contexto(r), /V8.*teto da classe simples \(T1\)/);
  assert.equal(contexto(pre(s, "Bash", { command: "git status" }, { agente: "dev-back", id: "v8", cwd: wt1 })), "", "estrito avisa uma vez");
  assert.ok(telemetria().some((l) => l.evento === "V11" && l.tarefa === "T1"), "tarefa simples que estourou vira V11");
  try {
    perfil("deus");
    gravarEstado(repo, s, "v8d", { inicio: Date.now() - 200 * 60000, chamadas: 1 }); // sem tarefa: teto de complexa (90 min)
    r = pre(s, "Bash", { command: "npm run test" }, { agente: "dev-back", id: "v8d" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /V8.*classe complexa/);
  } finally {
    perfil("estrito");
  }
});

// ================= V10 · teste moldado ao código =================
test("V10 · QA lendo a implementação antes de escrever teste: alerta; depois do teste, quieto", () => {
  let s = sessao();
  const ler = () => pre(s, "Read", { file_path: path.join(wt2, "src/server/auth/login.ts") }, { agente: "qa-e2e", id: `qa-${s}`, cwd: wt2 });
  let r = ler();
  assert.equal(r.status, 0);
  assert.match(contexto(r), /V10.*implementação de T1/);
  assert.equal(contexto(ler()), "", "avisa uma vez");
  s = sessao();
  assert.equal(pre(s, "Write", { file_path: path.join(wt2, "cypress/e2e/login.cy.ts"), content: "x" }, { agente: "qa-e2e", id: `qa-${s}`, cwd: wt2 }).status, 0);
  assert.equal(contexto(ler()), "");
});

test("V10 · QA lendo a spec ou arquivo fora do escopo de Dev: quieto", () => {
  const s = sessao();
  assert.equal(contexto(pre(s, "Read", { file_path: path.join(wt2, "README.md") }, { agente: "qa-e2e", id: `qa-${s}`, cwd: wt2 })), "");
});

// ================= V11 · esforço errado =================
const planoExemplo = () => JSON.parse([...fs.readFileSync(path.join(KIT, "skills/proprias/modo-deus/SKILL.md"), "utf8").matchAll(/```json\s*([\s\S]*?)```/g)][0][1]);

test("V11 · plano com tarefa simples já reprovada: registra; plano normal: quieto", () => {
  const s = sessao();
  const p = planoExemplo();
  const simples = p.tarefas.find((t) => t.classe === "simples");
  const gravar = (plano) => pre(s, "Write", { file_path: path.join(repo, ".modo-deus/plano.json"), content: JSON.stringify(plano) }, { agente: "maestro", id: "m1" });
  assert.equal(gravar(p).status, 0);
  assert.ok(!telemetria().some((l) => l.sessao === s && l.evento === "V11"));
  simples.rodadas_revisao = 1;
  simples.esforco = "high";
  const r = gravar(p);
  assert.equal(r.status, 0, r.stderr);
  gravar(p);
  const v11 = telemetria().filter((l) => l.sessao === s && l.evento === "V11");
  assert.equal(v11.length, 1, "uma vez por tarefa na sessão");
  assert.equal(v11[0].tarefa, simples.id);
});

// ================= leve não roda detectores =================
test("perfil leve: nenhum detector, nem loop", () => {
  try {
    perfil("leve");
    const s = sessao();
    for (let i = 0; i < 8; i++) assert.equal(pre(s, "Bash", { command: "npm run lint" }).stdout, "");
    assert.equal(falha(s, "bash: pnpm: command not found").stdout, "");
  } finally {
    perfil("estrito");
  }
});

// ================= marcador de retrospectiva =================
const PENDENTE = () => path.join(repo, ".modo-deus/retro/PENDENTE.json");

test("Stop sem alerta nem bloqueio não marca retrospectiva", () => {
  fs.rmSync(PENDENTE(), { force: true });
  const s = sessao();
  pre(s, "Bash", { command: "git status" });
  hook("evento", { session_id: s, hook_event_name: "Stop" });
  assert.ok(!fs.existsSync(PENDENTE()));
});

test("Stop com alerta e bloqueio grava PENDENTE.json; SessionStart avisa", () => {
  fs.rmSync(PENDENTE(), { force: true });
  const s = sessao();
  pre(s, "Bash", { command: "git push --force" });
  falha(s, "bash: pnpm: command not found");
  hook("evento", { session_id: s, hook_event_name: "Stop" });
  const p = JSON.parse(fs.readFileSync(PENDENTE(), "utf8"));
  assert.equal(p.sessao, s);
  assert.ok(Date.parse(p.ts));
  assert.equal(p.alertas, 1);
  assert.equal(p.bloqueios, 1);
  assert.deepEqual(p.regras, { V9: 1, V4: 1 });
  hook("evento", { session_id: s, hook_event_name: "Stop" });
  assert.equal(JSON.parse(fs.readFileSync(PENDENTE(), "utf8")).alertas, 1, "Stop repetido não duplica");

  const r = hook("sessao", { session_id: sessao(), source: "startup" });
  assert.match(r.stdout, /retrospectiva pendente: rode \/modo-deus:retro \(1 alerta\(s\), 1 bloqueio\(s\)\)/);
  fs.rmSync(PENDENTE());
  assert.doesNotMatch(hook("sessao", { session_id: sessao(), source: "startup" }).stdout, /retrospectiva pendente/);
});

// ================= status line =================
const statusline = (entrada) => rodar(path.join(KIT, "mods", "statusline.mjs"), entrada);

test("status line: perfil, plano, times, alertas e duração; projeto sem kit fica vazio", () => {
  const s = sessao();
  falha(s, "bash: pnpm: command not found");
  const r = statusline({ session_id: s, workspace: { current_dir: repo }, cost: { total_duration_ms: 22 * 60000 } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "estrito · executando · dev 0/1 · qa 0/1 · 1 alerta · 22 min");
  const fora = path.join(tmp, "fora");
  fs.mkdirSync(fora, { recursive: true });
  git(fora, "init", "-q");
  assert.equal(statusline({ session_id: s, workspace: { current_dir: fora } }).stdout.trim(), "");
});

// ================= painel =================
test("painel: texto e HTML autocontido com linha do tempo por agente", () => {
  const s = sessao();
  hook("evento", { session_id: s, hook_event_name: "SubagentStart", agent_type: "modo-deus:dev-back", agent_id: "p1" });
  pre(s, "Edit", { file_path: path.join(wt1, "src/server/pagamento.ts") }, { agente: "dev-back", id: "p1", cwd: wt1 });
  const { texto, arquivo } = gerarPainel(repo, { sessao: s });
  assert.match(texto, /Fase: rascunho → aprovado → \[executando\]/);
  assert.match(texto, /Tarefas: pendente 1, em_andamento 1/);
  assert.match(texto, /- dev-back \(p1\): 1 chamada\(s\)/);
  assert.match(texto, /V1 1a\/0b/);
  const html = fs.readFileSync(arquivo, "utf8");
  assert.ok(arquivo.endsWith(path.join(".modo-deus", "painel", "index.html")));
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /class="barra"/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|https?:\/\//, "sem CDN");

  const cli = spawnSync(process.execPath, [path.join(KIT, "mods", "painel", "gerar.mjs"), repo, "--sessao", s], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: "" } });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /Painel: .*index\.html/);
});

// ================= instalador --statusline =================
test("instalador: --statusline grava, reinstalação sem a flag mantém, --remover tira sem tocar no resto", () => {
  const home = path.join(tmp, "home");
  const r2 = path.join(tmp, "repo-inst");
  fs.mkdirSync(r2);
  git(r2, "init", "-q");
  escrever(r2, "package.json", JSON.stringify({ scripts: { test: "vitest" } }));
  git(r2, "add", "-A");
  git(r2, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
  const antes = process.env.MODO_DEUS_HOME;
  process.env.MODO_DEUS_HOME = home;
  const silencio = () => {};
  const settings = () => JSON.parse(fs.readFileSync(path.join(r2, ".claude/settings.local.json"), "utf8"));
  try {
    instalar(r2, { semGrafo: true, log: silencio });
    assert.equal(settings().statusLine, undefined, "sem a flag, nada muda");
    escrever(r2, ".claude/settings.local.json", JSON.stringify({ ...settings(), model: "sonnet" }));

    instalar(r2, { semGrafo: true, statusline: true, log: silencio });
    assert.equal(settings().statusLine.type, "command");
    assert.match(settings().statusLine.command, /^node ".*\/mods\/statusline\.mjs"$/);
    const manifesto = JSON.parse(fs.readFileSync(path.join(r2, ".modo-deus/instalados.json"), "utf8"));
    assert.equal(manifesto.statusline, settings().statusLine.command);

    instalar(r2, { semGrafo: true, log: silencio });
    assert.ok(settings().statusLine, "reinstalar sem a flag mantém");

    remover(r2, { log: silencio });
    assert.equal(settings().statusLine, undefined);
    assert.equal(settings().model, "sonnet");

    // statusLine do usuário não é trocada
    escrever(r2, ".claude/settings.local.json", JSON.stringify({ statusLine: { type: "command", command: "minha.sh" } }));
    const log = [];
    instalar(r2, { semGrafo: true, statusline: true, log: (l) => log.push(l) });
    assert.equal(settings().statusLine.command, "minha.sh");
    assert.ok(log.some((l) => /statusLine do usuário/.test(l)));
    remover(r2, { log: silencio });
    assert.equal(settings().statusLine.command, "minha.sh");
  } finally {
    if (antes === undefined) delete process.env.MODO_DEUS_HOME;
    else process.env.MODO_DEUS_HOME = antes;
  }
});
