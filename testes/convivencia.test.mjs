// Convivência com o que já existe na máquina (hooks do Orca no settings.json global, outros plugins).
// HOME, repositórios e pasta temporária do sistema são todos falsos; não toca no seu ~/.claude.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { instalar, remover } from "../instalar.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = (n) => path.join(KIT, "hooks", "src", `${n}.mjs`);
const silencio = () => {};
let tmp, home, hooktmp;

const git = (dir, ...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
function novoRepo(nome) {
  const r = path.join(tmp, nome);
  fs.mkdirSync(r, { recursive: true });
  git(r, "init", "-q");
  fs.writeFileSync(path.join(r, "README.md"), "# teste\n");
  fs.mkdirSync(path.join(r, "src", "components"), { recursive: true });
  fs.writeFileSync(path.join(r, "src", "components", "a.ts"), "export const a = 1;\n");
  git(r, "add", "-A");
  git(r, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
  return r;
}

// settings.json global no estilo do Orca: hooks chamando um .exe em vários eventos.
// Indentação de 4 espaços, CRLF e chaves fora de ordem de propósito: qualquer reescrita aparece.
const ORCA = (() => {
  const exe = "\"C:\\\\Users\\\\x\\\\AppData\\\\Local\\\\Programs\\\\Orca\\\\orca-hook.exe\"";
  const h = (ev) => `[\r\n        {\r\n            "matcher": "*",\r\n            "hooks": [\r\n                { "type": "command", "command": "${exe} ${ev}" }\r\n            ]\r\n        }\r\n    ]`;
  return `{\r\n    "model": "opus",\r\n    "hooks": {\r\n    "SessionStart": ${h("session-start")},\r\n    "PreToolUse": ${h("pre-tool-use")},\r\n    "Stop": ${h("stop")}\r\n    },\r\n    "enabledPlugins": { "superpowers@claude-plugins-official": true, "claude-security@claude-plugins-official": true }\r\n}\r\n`;
})();

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "modo-deus-conv-"));
  home = path.join(tmp, "home");
  hooktmp = path.join(tmp, "hooktmp");
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.mkdirSync(hooktmp);
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), ORCA);
  process.env.MODO_DEUS_HOME = home;
  process.env.MODO_DEUS_SEM_GRAPHIFY = "1";
});

afterEach(() => {
  delete process.env.MODO_DEUS_HOME;
  delete process.env.MODO_DEUS_SEM_GRAPHIFY;
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Árvore -> { caminho relativo: hash }. Pula .git (git log/rev-parse não escrevem nada que importe aqui).
function arvore(dir, pular = () => false) {
  const out = {};
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      const rel = path.relative(dir, abs).replace(/\\/g, "/");
      if (e.name === ".git" || pular(rel)) continue;
      if (e.isDirectory()) andar(abs);
      else out[rel] = crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex");
    }
  };
  andar(dir);
  return out;
}
function diferencas(antes, depois) {
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  return [...chaves].filter((k) => antes[k] !== depois[k]).sort();
}

function rodarHook(nome, entrada, cwd) {
  return spawnSync(process.execPath, [HOOK(nome)], {
    cwd,
    input: JSON.stringify({ session_id: "s1", cwd, ...entrada }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: "", MODO_DEUS_SEM_GRAPHIFY: "1", MODO_DEUS_HOME: home, TEMP: hooktmp, TMP: hooktmp, TMPDIR: hooktmp },
  });
}

function transcricao(...skills) {
  const f = path.join(tmp, `transcricao-${crypto.randomUUID()}.jsonl`);
  fs.writeFileSync(f, skills.map((s) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: s } }] } })).join("\n") + "\n");
  return f;
}

const EVENTOS = (t) => [
  ["sessao", { hook_event_name: "SessionStart", source: "startup" }],
  ["prompt", { hook_event_name: "UserPromptSubmit", prompt: "oi" }],
  ["pre", { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "README.md", old_string: "a", new_string: "b" }, transcript_path: t }],
  ["pre", { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "src/components/b.ts", content: "x" }, transcript_path: t }],
  ["pre", { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }, transcript_path: t }],
  ["pre", { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "rm -rf /" }, transcript_path: t }],
  ["pre", { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "README.md" }, transcript_path: t }],
  ["evento", { hook_event_name: "SubagentStart", agent_type: "modo-deus:dev-front", agent_id: "a1" }],
  ["evento", { hook_event_name: "SubagentStop", agent_type: "modo-deus:dev-front", agent_id: "a1", last_assistant_message: "pronto" }],
  ["evento", { hook_event_name: "Stop" }],
];

test("instalar e remover o kit não mudam um byte do settings.json global (hooks do Orca)", () => {
  const repo = novoRepo("repo");
  const settingsF = path.join(home, ".claude", "settings.json");
  const antesHome = arvore(home);
  instalar(repo, { semGrafo: true, log: silencio });
  assert.equal(fs.readFileSync(settingsF, "utf8"), ORCA);
  assert.deepEqual(diferencas(antesHome, arvore(home)), [], "a instalação escreveu no HOME");
  const { backup } = remover(repo, { log: silencio });
  assert.equal(fs.readFileSync(settingsF, "utf8"), ORCA);
  // Fora o backup da remoção, o HOME está como antes.
  const fora = diferencas(antesHome, arvore(home)).filter((k) => !k.startsWith(".claude/modo-deus/backups/"));
  assert.deepEqual(fora, []);
  assert.ok(backup.startsWith(path.join(home, ".claude", "modo-deus", "backups")));
  assert.equal(git(repo, "status", "--porcelain"), "");
});

test("hooks do plugin saem com 0 e sem saída em projeto sem o kit", () => {
  const repo = novoRepo("sem-kit");
  const t = transcricao();
  const antes = arvore(tmp);
  for (const [nome, entrada] of EVENTOS(t)) {
    const r = rodarHook(nome, entrada, repo);
    assert.equal(r.status, 0, `${nome} ${entrada.hook_event_name}: ${r.stderr}`);
    assert.equal(r.stdout, "", `${nome} escreveu no stdout`);
    assert.equal(r.stderr, "", `${nome} escreveu no stderr`);
  }
  assert.deepEqual(diferencas(antes, arvore(tmp)), [], "hook escreveu algo num projeto sem o kit");
});

test("hooks.json só referencia ${CLAUDE_PLUGIN_ROOT} e arquivos que existem", () => {
  const hj = JSON.parse(fs.readFileSync(path.join(KIT, "hooks", "hooks.json"), "utf8"));
  let n = 0;
  for (const [evento, grupos] of Object.entries(hj.hooks)) {
    for (const g of grupos) {
      for (const h of g.hooks) {
        n++;
        assert.equal(h.type, "command", evento);
        const m = h.command.match(/^node "\$\{CLAUDE_PLUGIN_ROOT\}\/(hooks\/src\/[\w-]+\.mjs)"$/);
        assert.ok(m, `${evento}: comando fora do padrão: ${h.command}`);
        assert.ok(fs.existsSync(path.join(KIT, m[1])), `${evento}: ${m[1]} não existe`);
      }
    }
  }
  assert.ok(n >= 6);
  assert.doesNotMatch(JSON.stringify(hj), /CLAUDE_PROJECT_DIR|\.claude\/fluxo|[A-Za-z]:\\\\|~\//);
});

test("num projeto com o kit, hooks só escrevem em <raiz>/.claude/modo-deus/", () => {
  const repo = novoRepo("com-kit");
  instalar(repo, { perfil: "deus", semGrafo: true, log: silencio });
  const t = transcricao("incremental-implementation");
  const t2 = transcricao();
  const dentro = (rel) => rel.startsWith("com-kit/.claude/modo-deus/");
  const antes = arvore(tmp, dentro);
  const excludeAntes = fs.readFileSync(path.join(repo, ".git", "info", "exclude"), "utf8");
  const codigos = [];
  for (const [nome, entrada] of [...EVENTOS(t), ...EVENTOS(t2)]) codigos.push(rodarHook(nome, entrada, repo).status);
  assert.ok(codigos.includes(2), "algum hook devia ter bloqueado (rm -rf / ou edição sem skill)");
  assert.ok(codigos.every((c) => c === 0 || c === 2), String(codigos));

  // Sem exceção: o cache da trava fica em .claude/modo-deus/cache/ (TEMP/TMP/TMPDIR apontam para
  // hooktmp justamente para pegar qualquer escrita na pasta temporária do sistema).
  const fora = diferencas(antes, arvore(tmp, dentro));
  assert.deepEqual(fora, [], "hook escreveu fora de .claude/modo-deus/");
  assert.ok(fs.readdirSync(path.join(repo, ".claude", "modo-deus", "cache")).some((f) => /^skills-[0-9a-f]{32}\.json$/.test(f)), "cache da trava dentro da pasta do kit");
  assert.equal(fs.readFileSync(path.join(repo, ".git", "info", "exclude"), "utf8"), excludeAntes);
  assert.equal(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8"), ORCA);
  // E escreveram de fato lá dentro (telemetria do perfil deus).
  const tel = path.join(repo, ".claude", "modo-deus", "telemetria");
  assert.ok(fs.readdirSync(tel).some((f) => f.endsWith(".jsonl")));
  assert.equal(git(repo, "status", "--porcelain"), "");
});
