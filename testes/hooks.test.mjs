// Hooks do plugin rodando como o Claude Code roda: processo node, JSON no stdin, exit 2 bloqueia.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = (n) => path.join(KIT, "hooks", "src", `${n}.mjs`);
let tmp, repo, n = 0;

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

## Territórios

- **front**: \`src/components/**\`
- **back**: \`src/server/**\`
- **db**: \`migrations/**\`
- **testes**: \`**/*.test.*\`, \`cypress/**\`
`;

function instalarKit(dir, perfil = "estrito") {
  escrever(dir, ".modo-deus/config.json", JSON.stringify({ perfil, times: { "dev-mobile": "auto" } }));
  escrever(dir, ".modo-deus/REGRAS.md", REGRAS);
  fs.appendFileSync(path.join(dir, ".git", "info", "exclude"), "\n.claude/\n");
}

// Transcrição com as skills invocadas pela ferramenta Skill.
function transcricao(...skills) {
  const f = path.join(tmp, `t${n++}.jsonl`);
  fs.writeFileSync(f, skills.map((s) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: s } }] } })).join("\n") + (skills.length ? "\n" : ""));
  return f;
}

function rodar(hook, entrada, { env = {} } = {}) {
  return spawnSync(process.execPath, [HOOK(hook)], {
    input: JSON.stringify({ session_id: "s1", cwd: repo, ...entrada }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: "", MODO_DEUS_SEM_GRAPHIFY: "1", ...env },
  });
}
const pre = (ferr, input, { skills = [], agente, cwd, transcript } = {}) =>
  rodar("pre", { tool_name: ferr, tool_input: input, transcript_path: transcript || transcricao(...skills), ...(agente ? { agent_type: `modo-deus:${agente}`, agent_id: "a1" } : {}), ...(cwd ? { cwd } : {}) });

const espera = (codigo, nome, fn) => test(nome, () => {
  const r = fn();
  assert.equal(r.status, codigo, `stderr: ${r.stderr}`);
});

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "modo-deus-hooks-"));
  repo = path.join(tmp, "repo");
  fs.mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  escrever(repo, "app.ts", "x\n");
  escrever(repo, "README.md", "x\n");
  git(repo, "add", "-A");
  git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
  git(repo, "checkout", "-q", "-b", "feat");
  instalarKit(repo);
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const staged = (...f) => {
  git(repo, "reset", "-q");
  for (const x of f) git(repo, "add", x);
};

// ================= trava: os 32 cenários da v1 =================
espera(2, "v1 · edição de .ts sem skill", () => pre("Edit", { file_path: path.join(repo, "app.ts") }));
espera(0, "v1 · edição de .ts com incremental-implementation", () => pre("Edit", { file_path: path.join(repo, "app.ts") }, { skills: ["incremental-implementation"] }));
espera(0, "v1 · escrita de .py com debugging-and-error-recovery", () => pre("Write", { file_path: path.join(repo, "a.py") }, { skills: ["debugging-and-error-recovery"] }));
espera(0, "v1 · edição de README.md sem skill", () => pre("Edit", { file_path: path.join(repo, "README.md") }));
espera(0, "v1 · edição de .claude/settings.local.json sem skill", () => pre("Edit", { file_path: path.join(repo, ".claude/settings.local.json") }));
espera(2, "v1 · edição de .tsx só com skill de revisão", () => pre("Edit", { file_path: path.join(repo, "ui.tsx") }, { skills: ["code-review-and-quality"] }));

test("v1 · commit: código sem skill, com skill, só docs, git status", () => {
  escrever(repo, "app.ts", "y\n");
  staged("app.ts");
  assert.equal(pre("Bash", { command: "git commit -m x" }).status, 2);
  assert.equal(pre("Bash", { command: "git commit -m x" }, { skills: ["test-driven-development"] }).status, 0);
  escrever(repo, "README.md", "y\n");
  git(repo, "checkout", "-q", "--", "app.ts");
  staged("README.md");
  assert.equal(pre("Bash", { command: "git commit -m x" }).status, 0);
  assert.equal(pre("Bash", { command: "git status" }).status, 0);
  git(repo, "reset", "-q");
  git(repo, "checkout", "-q", "--", ".");
});

// Merge: na v1 era livre em qualquer branch. Na v2 continua livre fora da principal (V9 cobre a principal).
espera(0, "v1 · git merge sem skill (fora da principal)", () => pre("Bash", { command: "git merge feature" }));
espera(0, "v1 · git merge --no-ff sem skill (fora da principal)", () => pre("Bash", { command: "git merge --no-ff feature" }));

espera(2, "v1 · gh pr create sem skills", () => pre("Bash", { command: "gh pr create --fill" }));
espera(2, "v1 · gh pr create só com code-review-and-quality", () => pre("Bash", { command: "gh pr create --fill" }, { skills: ["code-review-and-quality"] }));
espera(0, "v1 · gh pr create com revisão e humanizer", () => pre("Bash", { command: "gh pr create --fill" }, { skills: ["code-review-and-quality", "humanizer"] }));
espera(2, "v1 · glab mr create sem skills", () => pre("Bash", { command: "glab mr create --fill" }));
espera(2, "v1 · git push -o merge_request.create sem skills", () => pre("Bash", { command: "git push -o merge_request.create origin feat" }));
espera(0, "v1 · glab mr create com revisão e humanizer", () => pre("Bash", { command: "glab mr create --fill" }, { skills: ["code-review-and-quality", "humanizer"] }));

espera(2, "v1 · cat > .ts sem skill", () => pre("Bash", { command: "cat > src/a.ts" }));
espera(2, "v1 · echo >> .py sem skill", () => pre("Bash", { command: "echo x >> b.py" }));
espera(2, "v1 · tee .tsx sem skill", () => pre("Bash", { command: "echo x | tee ui.tsx" }));
espera(2, "v1 · sed -i em .ts sem skill", () => pre("Bash", { command: "sed -i s/a/b/ app.ts" }));
espera(0, "v1 · cat > .ts com incremental-implementation", () => pre("Bash", { command: "cat > src/a.ts" }, { skills: ["incremental-implementation"] }));
espera(0, "v1 · redireção para .log sem skill", () => pre("Bash", { command: "npm run build > build.log 2>&1" }));
espera(0, "v1 · redireção para /dev/null sem skill", () => pre("Bash", { command: "node x.js >/dev/null" }));
espera(0, "v1 · sed -i em .md sem skill", () => pre("Bash", { command: "sed -i s/a/b/ README.md" }));
espera(0, "v1 · escrita em .claude/ sem skill", () => pre("Bash", { command: "echo x > .modo-deus/hooks/a.sh" }));
espera(0, "v1 · ls sem skill", () => pre("Bash", { command: "ls -la" }));

test("v1 · cache vê skill invocada depois", () => {
  const t = path.join(tmp, "sessao.jsonl");
  fs.writeFileSync(t, Array.from({ length: 200 }, (_, i) => JSON.stringify({ type: "user", message: { content: `linha ${i} de conversa comprida o bastante` } })).join("\n") + "\n");
  assert.equal(pre("Edit", { file_path: path.join(repo, "app.ts") }, { transcript: t }).status, 2);
  fs.appendFileSync(t, JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "superpowers:test-driven-development" } }] } }) + "\n");
  assert.equal(pre("Edit", { file_path: path.join(repo, "app.ts") }, { transcript: t }).status, 0);
});

test("v1 · menção solta de skill não libera edição", () => {
  const t = path.join(tmp, "solta.jsonl");
  fs.writeFileSync(t, JSON.stringify({ type: "user", message: { content: '{"skill":"incremental-implementation"}' } }) + "\n");
  assert.equal(pre("Edit", { file_path: path.join(repo, "app.ts") }, { transcript: t }).status, 2);
});

test("v1 · '<a definir>' não gera aviso; campo <...> gera", () => {
  const f = path.join(repo, ".modo-deus/REGRAS.md");
  fs.writeFileSync(f, "Testes: <a definir>\n");
  assert.doesNotMatch(rodar("sessao", {}).stdout, /campo\(s\) sem preencher/);
  fs.writeFileSync(f, "Nome: <nome do projeto>\n");
  assert.match(rodar("sessao", {}).stdout, /1 campo\(s\) sem preencher/);
  fs.writeFileSync(f, REGRAS);
});

// ================= trava: novidades da v2 =================
espera(0, "v2 · skill do superpowers com prefixo libera (systematic-debugging)", () => pre("Edit", { file_path: path.join(repo, "app.ts") }, { skills: ["superpowers:systematic-debugging"] }));
espera(0, "v2 · projeto sem o kit: nenhuma regra", () => {
  const fora = path.join(tmp, "fora");
  fs.mkdirSync(fora, { recursive: true });
  git(fora, "init", "-q");
  return pre("Bash", { command: "git push --force" }, { cwd: fora });
});

// ================= V9 · cerca =================
const bloqueia = [
  "git push --force", "git push -f origin feat", "git push origin +feat", "git push --force-with-lease",
  "git push origin main", "git push origin HEAD:main", "git push origin --delete feat", "git push origin :feat",
  "git reset --hard HEAD~1", "git clean -fdx", "git branch -D velho", "git checkout -- .",
  "rm -rf /", "rm -rf ~", "rm -rf ..", "rm -rf ../outro", "rm -rf .", "rm -fr $HOME/x", "rm -rf .git",
  "npm publish", "pnpm publish --access public", "vercel --prod", "firebase deploy", "terraform apply -auto-approve",
  "kubectl apply -f k.yaml", "supabase db push", "npx prisma migrate deploy", "docker push img:1", "gh release create v1",
  "cat .env", "cp .env /tmp/x", "git add .env", "grep KEY config/.env.production", "type .env.local",
  "echo AKIAABCDEFGHIJKLMNOP | aws configure",
];
for (const c of bloqueia) espera(2, `V9 bloqueia: ${c}`, () => pre("Bash", { command: c }, { skills: ["incremental-implementation"] }));

const libera = [
  "git push origin feat", "git push", "git push -u origin feat", "rm -rf node_modules dist", "rm -rf ./build",
  "cat .env.example", "cp .env.example .env", "git rm --cached .env", "npm run build", "vercel", "git merge main",
  "git checkout -- src/a.ts", "echo .env >> .gitignore",
];
for (const c of libera) espera(0, `V9 libera: ${c}`, () => pre("Bash", { command: c }, { skills: ["incremental-implementation"] }));

test("V9 · push e merge estando na principal", () => {
  git(repo, "checkout", "-q", "main");
  try {
    assert.equal(pre("Bash", { command: "git push" }).status, 2);
    assert.equal(pre("Bash", { command: "git merge feat" }).status, 2);
    assert.equal(pre("Bash", { command: "git rebase feat" }).status, 2);
    assert.equal(pre("Bash", { command: "git merge --abort" }).status, 0);
  } finally {
    git(repo, "checkout", "-q", "feat");
  }
});

espera(2, "V9 · Read de .env", () => pre("Read", { file_path: path.join(repo, ".env") }));
espera(2, "V9 · Read de chave .pem", () => pre("Read", { file_path: path.join(repo, "certs", "server.pem") }));
espera(0, "V9 · Read de .env.example", () => pre("Read", { file_path: path.join(repo, ".env.example") }));
espera(2, "V9 · Edit de .env.local", () => pre("Edit", { file_path: path.join(repo, ".env.local"), new_string: "A=1" }));
espera(2, "V9 · Write com chave privada no conteúdo", () => pre("Write", { file_path: path.join(repo, "k.txt"), content: "-----BEGIN RSA PRIVATE KEY-----\nabc" }));
espera(2, "V9 · Edit com token do GitHub", () => pre("Edit", { file_path: path.join(repo, "README.md"), new_string: "token ghp_" + "a".repeat(36) }));
espera(0, "V9 · Write normal em .md", () => pre("Write", { file_path: path.join(repo, "docs/x.md"), content: "process.env.API_KEY" }));

// ================= V2 · território =================
const arq = (r) => path.join(repo, r);
espera(0, "V2 · dev-front no próprio território", () => pre("Edit", { file_path: arq("src/components/Botao.tsx") }, { agente: "dev-front" }));
espera(0, "V2 · dev-front em teste dentro do território (TDD)", () => pre("Edit", { file_path: arq("src/components/Botao.test.tsx") }, { agente: "dev-front" }));
espera(2, "V2 · dev-front no território back", () => pre("Edit", { file_path: arq("src/server/api.ts") }, { agente: "dev-front" }));
espera(2, "V2 · dev-front em teste E2E (é do QA)", () => pre("Write", { file_path: arq("cypress/e2e/a.cy.ts") }, { agente: "dev-front" }));
espera(2, "V2 · dev-front escrevendo no back pelo Bash", () => pre("Bash", { command: "echo x > src/server/a.ts" }, { agente: "dev-front" }));
espera(0, "V2 · dev-front em arquivo sem território (package.json)", () => pre("Edit", { file_path: arq("package.json") }, { agente: "dev-front" }));
espera(0, "V2 · dev-db em migração", () => pre("Write", { file_path: arq("migrations/001.sql") }, { agente: "dev-db" }));
espera(0, "V2 · qa-e2e em cypress/", () => pre("Write", { file_path: arq("cypress/e2e/a.cy.ts") }, { agente: "qa-e2e" }));
espera(2, "V2 · qa-e2e em código de produção", () => pre("Edit", { file_path: arq("src/components/Botao.tsx") }, { agente: "qa-e2e" }));
espera(2, "V2 · revisor não escreve nada", () => pre("Edit", { file_path: arq("README.md") }, { agente: "revisor" }));
const planoExemplo = () => [...fs.readFileSync(path.join(KIT, "skills/proprias/modo-deus/SKILL.md"), "utf8").matchAll(/```json\s*([\s\S]*?)```/g)][0][1];
espera(0, "V2 · maestro grava o plano", () => pre("Write", { file_path: arq(".modo-deus/plano.json"), content: planoExemplo() }, { agente: "maestro" }));
espera(0, "V2 · maestro grava a retro", () => pre("Write", { file_path: arq(".modo-deus/retro/x.md"), content: "x" }, { agente: "maestro" }));
espera(2, "V2 · maestro não edita código", () => pre("Edit", { file_path: arq("src/components/x.tsx") }, { agente: "maestro" }));
espera(0, "V2 · sessão principal não é restrita por território", () => pre("Edit", { file_path: arq("src/server/api.ts") }, { skills: ["incremental-implementation"] }));
espera(2, "V2 · subagente fora do kit segue a trava", () => rodar("pre", { tool_name: "Edit", tool_input: { file_path: arq("app.ts") }, transcript_path: transcricao(), agent_type: "Explore", agent_id: "x" }));

test("V2 · worktree de tarefa acha o kit do repositório principal", () => {
  const wt = path.join(repo, ".claude", "worktrees", "t1");
  git(repo, "worktree", "add", "-q", "-b", "t1", wt);
  try {
    assert.equal(pre("Edit", { file_path: path.join(wt, "src/server/api.ts") }, { agente: "dev-front", cwd: wt }).status, 2, "território vale relativo à worktree");
    assert.equal(pre("Edit", { file_path: path.join(wt, "src/components/B.tsx") }, { agente: "dev-front", cwd: wt }).status, 0);
    assert.equal(pre("Bash", { command: "git push --force" }, { cwd: wt }).status, 2, "cerca vale na worktree");
  } finally {
    git(repo, "worktree", "remove", "--force", wt);
  }
});

// ================= telemetria =================
test("telemetria: bloqueio registrado com regra; perfil leve não registra o que passou", () => {
  const dir = path.join(repo, ".modo-deus/telemetria");
  fs.rmSync(dir, { recursive: true, force: true });
  pre("Bash", { command: "git push --force" });
  pre("Bash", { command: "ls" });
  let linhas = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(linhas.some((l) => l.resultado === "bloqueado" && l.regra === "V9" && l.agente === "principal"));
  assert.ok(linhas.some((l) => l.resultado === "ok" && l.alvo === "ls"));
  assert.ok(linhas.every((l) => typeof l.duracao_ms === "number"));

  fs.rmSync(dir, { recursive: true, force: true });
  instalarKit(repo, "leve");
  pre("Bash", { command: "ls" });
  pre("Bash", { command: "git push --force" });
  linhas = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(linhas.map((l) => l.resultado), ["bloqueado"]);
  instalarKit(repo, "estrito");
});

test("telemetria: SubagentStart/Stop e Stop", () => {
  const dir = path.join(repo, ".modo-deus/telemetria");
  fs.rmSync(dir, { recursive: true, force: true });
  rodar("evento", { hook_event_name: "SubagentStart", agent_type: "modo-deus:dev-back", agent_id: "z" });
  rodar("evento", { hook_event_name: "SubagentStop", agent_type: "modo-deus:dev-back", agent_id: "z", last_assistant_message: "feito" });
  rodar("evento", { hook_event_name: "Stop" });
  const ev = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(ev.map((e) => `${e.evento}:${e.agente}`), ["SubagentStart:dev-back", "SubagentStop:dev-back", "Stop:principal"]);
});

// ================= contexto =================
test("SessionStart injeta CLAUDE.md base, REGRAS.md e times; projeto sem kit não recebe nada", () => {
  const r = rodar("sessao", { source: "startup" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /# modo-deus ativo · perfil estrito/);
  assert.match(r.stdout, /Mapa do projeto: graphify primeiro/);
  assert.match(r.stdout, /## Regras deste projeto/);
  assert.match(r.stdout, /\*\*front\*\*: `src\/components\/\*\*`/);
  assert.match(r.stdout, /Times sob demanda: dev-mobile=auto/);
  const fora = path.join(tmp, "fora2");
  fs.mkdirSync(fora, { recursive: true });
  git(fora, "init", "-q");
  assert.equal(rodar("sessao", { cwd: fora }).stdout, "");
  assert.equal(rodar("prompt", { cwd: fora }).stdout, "");
  assert.match(rodar("prompt", {}).stdout, /\[modo-deus · estrito\]/);
});

test("hooks.json registra o monitor (F5): PostToolUseFailure e Grep/Glob no PreToolUse", () => {
  const h = JSON.parse(fs.readFileSync(path.join(KIT, "hooks", "hooks.json"), "utf8")).hooks;
  assert.match(h.PreToolUse[0].matcher, /\bGrep\b.*\bGlob\b/);
  assert.match(h.PostToolUseFailure[0].hooks[0].command, /evento\.mjs/);
});

// ================= desempenho =================
test("desempenho do PreToolUse (mediana de 9 execuções)", (t) => {
  const medir = (fn) => {
    const v = [];
    for (let i = 0; i < 9; i++) {
      const t0 = performance.now();
      fn();
      v.push(performance.now() - t0);
    }
    return Math.round(v.sort((a, b) => a - b)[4]);
  };
  const tr = transcricao("incremental-implementation");
  const r = {
    ls: medir(() => pre("Bash", { command: "ls -la" }, { transcript: tr })),
    "edição .md": medir(() => pre("Edit", { file_path: path.join(repo, "README.md") }, { transcript: tr })),
    "edição .ts com skill": medir(() => pre("Edit", { file_path: path.join(repo, "app.ts") }, { transcript: tr })),
    "fora do kit": medir(() => pre("Bash", { command: "ls" }, { cwd: tmp, transcript: tr })),
  };
  t.diagnostic(`mediana (ms, inclui o processo node): ${JSON.stringify(r)}`);
  fs.writeFileSync(path.join(tmp, "..", "modo-deus-desempenho.json"), JSON.stringify(r));
  for (const [k, v] of Object.entries(r)) assert.ok(v < 400, `${k}: ${v} ms`);
});
