// Garante que o que o kit declara é de fato usado, e que o que os hooks exigem é cobrado.
//  1. Uso declarado: toda skill, skill do superpowers, conector e mod do kit é citado por quem o usa
//     (agente, comando, outra skill, CLAUDE.md base ou instalador), não só listado.
//  2. Uso exigido: a trava cobra as skills de construção e as de PR, uma a uma; o contrato de saída
//     cobra todo agente que entrega; o início da sessão atualiza o grafo.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (f) => JSON.parse(fs.readFileSync(path.join(KIT, f), "utf8"));
const kit = json("kit.json");
const conectores = json("hooks/conectores.json");
const texto = (f) => fs.readFileSync(path.join(KIT, f), "utf8");
const arquivos = (dir, ext = /\.md$/) =>
  fs.readdirSync(path.join(KIT, dir), { recursive: true }).map((f) => path.join(dir, String(f)).replace(/\\/g, "/")).filter((f) => ext.test(f));

// Quem usa: agentes, comandos, skills próprias (cada uma não conta para si mesma) e o CLAUDE.md base.
// Os hooks ficam de fora de propósito: nomes de arquivo como vigia.mjs dariam falso positivo.
const USUARIOS = [...arquivos("agents"), ...arquivos("commands"), ...arquivos("skills/proprias"), "docs/modelos/CLAUDE.md"].map((f) => [f, texto(f)]);
const citado = (nome, prefixo) => {
  const re = new RegExp(`(^|[^\\w-])${prefixo ? `${prefixo}:` : "(modo-deus:)?"}${nome.replace(/-/g, "\\-")}(?![\\w.-])`);
  return USUARIOS.filter(([f, t]) => re.test(t) && !f.endsWith(`/${nome}/SKILL.md`)).map(([f]) => f);
};

// ---------- 1. uso declarado ----------
test("toda skill do kit é usada por algum agente, comando, outra skill ou o CLAUDE.md base", () => {
  const sem = Object.keys(kit.skills.incluidas).filter((n) => !citado(n).length);
  assert.deepEqual(sem, [], `skills sem uso: ${sem.join(", ")}`);
});

test("toda skill do superpowers listada no kit é usada com o prefixo superpowers:", () => {
  const sem = kit.skills.do_superpowers.filter((n) => !citado(n, "superpowers").length);
  assert.deepEqual(sem, [], `skills do superpowers sem uso: ${sem.join(", ")}`);
});

test("todo conector obrigatório (hooks/conectores.json) é usado por um agente, comando ou skill", () => {
  for (const id of conectores.plugins) {
    const nome = id.split("@")[0];
    assert.ok(USUARIOS.some(([, t]) => t.includes(nome)), `${id} está em conectores.json mas ninguém o usa`);
    assert.ok(conectores.uso[id], `${id} sem a explicação de uso em conectores.json`);
  }
});

test("o graphify é usado: regra no CLAUDE.md base, atualização no início da sessão e no instalador", () => {
  assert.match(texto("docs/modelos/CLAUDE.md"), /Mapa do projeto: graphify primeiro/);
  assert.match(texto("hooks/src/sessao.mjs"), /spawn\("graphify", \["update", "\."\]/);
  assert.match(texto("instalar.mjs"), /rodar\("graphify", \["update", "\."\]/);
});

test("toda skill que a trava aceita existe no kit, no superpowers ou é um alias legado declarado", () => {
  const conhecidas = new Set([...Object.keys(kit.skills.incluidas), ...kit.skills.do_superpowers, ...Object.keys(kit.skills.excluidas)]);
  for (const s of [...kit.trava.construcao, ...kit.trava.pr]) assert.ok(conhecidas.has(s), `a trava aceita "${s}", que o kit não conhece`);
});

test("todo hook do hooks.json existe, e todo módulo de hooks/src é ponto de entrada ou importado", () => {
  const hj = json("hooks/hooks.json");
  const entradas = new Set();
  for (const grupos of Object.values(hj.hooks)) for (const g of grupos) for (const h of g.hooks) {
    const m = h.command.match(/hooks\/src\/([\w-]+\.mjs)/);
    assert.ok(m, `comando sem script do kit: ${h.command}`);
    assert.ok(fs.existsSync(path.join(KIT, "hooks", "src", m[1])), `${m[1]} não existe`);
    entradas.add(m[1]);
  }
  // CLIs e módulos usados pelo instalador e pelos comandos também contam.
  const fora = [texto("instalar.mjs"), ...arquivos("commands").map(texto), ...arquivos("skills/proprias").map(texto), ...arquivos("hooks/ferramentas", /\.mjs$/).map(texto)].join("\n");
  const src = fs.readdirSync(path.join(KIT, "hooks", "src")).filter((f) => f.endsWith(".mjs"));
  const importados = new Set();
  for (const f of src) for (const m of texto(`hooks/src/${f}`).matchAll(/from "\.\/([\w-]+\.mjs)"/g)) importados.add(m[1]);
  const orfaos = src.filter((f) => !entradas.has(f) && !importados.has(f) && !fora.includes(f));
  assert.deepEqual(orfaos, [], `módulos sem uso em hooks/src: ${orfaos.join(", ")}`);
});

test("mods: o que o marketplace instala existe, cada pasta de terceiros tem LEIA.md e os mods do kit são chamados", () => {
  const mkt = json(".claude-plugin/marketplace.json");
  for (const p of mkt.plugins) {
    if (p.name === "modo-deus") continue;
    assert.ok(fs.existsSync(path.join(KIT, p.source, ".claude-plugin", "plugin.json")), `${p.name}: ${p.source} sem plugin.json`);
    assert.ok(fs.existsSync(path.join(KIT, p.source, "hooks", "hooks.json")), `${p.name}: sem hooks/hooks.json`);
  }
  // Cada mod (do kit ou de terceiros) tem LEIA.md e aparece no índice mods/README.md.
  for (const grupo of ["kit", "terceiros"]) {
    for (const d of fs.readdirSync(path.join(KIT, "mods", grupo))) {
      assert.ok(fs.existsSync(path.join(KIT, "mods", grupo, d, "LEIA.md")), `mods/${grupo}/${d} sem LEIA.md`);
      assert.match(texto("mods/README.md"), new RegExp("`" + grupo + "/" + d + "/`"), `mods/${grupo}/${d} fora do índice mods/README.md`);
    }
  }
  assert.match(texto("instalar.mjs"), /"hooks", "ferramentas", "statusline\.mjs"/, "status line do kit sem uso no instalador");
  assert.match(texto("commands/deus-status.md"), /hooks\/ferramentas\/painel-status\.mjs/, "painel do /deus-status sem uso no comando");
});

// ---------- 2. uso exigido pelos hooks ----------
let tmp, repo;
const git = (dir, ...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
let n = 0;
const transcricao = (...skills) => {
  const f = path.join(tmp, `t${n++}.jsonl`);
  fs.writeFileSync(f, skills.map((s) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: s } }] } })).join("\n") + "\n");
  return f;
};
const hook = (nome, entrada, args = []) =>
  spawnSync(process.execPath, [path.join(KIT, "hooks", "src", `${nome}.mjs`), ...args], {
    input: JSON.stringify({ session_id: "s", cwd: repo, ...entrada }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: "", MODO_DEUS_SEM_GRAPHIFY: "1" },
  });
const editarTs = (...skills) => hook("pre", { tool_name: "Edit", tool_input: { file_path: path.join(repo, "src", "a.ts") }, transcript_path: transcricao(...skills) });
const abrirPr = (...skills) => hook("pre", { tool_name: "Bash", tool_input: { command: "gh pr create --fill" }, transcript_path: transcricao(...skills) });

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "modo-deus-uso-"));
  repo = path.join(tmp, "repo");
  fs.mkdirSync(path.join(repo, ".modo-deus"), { recursive: true });
  git(repo, "init", "-q", "-b", "feat");
  fs.writeFileSync(path.join(repo, ".modo-deus", "config.json"), JSON.stringify({ perfil: "estrito", times: {} }));
  fs.writeFileSync(path.join(repo, ".modo-deus", "REGRAS.md"), "# Regras\n");
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("trava: editar código sem skill de construção é bloqueado", () => {
  const r = editarTs();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /modo-deus · trava/);
});

for (const s of kit.trava.construcao) {
  test(`trava: a skill de construção "${s}" sozinha libera editar código (com e sem prefixo)`, () => {
    assert.equal(editarTs(s).status, 0, `${s} sem prefixo`);
    const prefixo = kit.skills.do_superpowers.includes(s) ? "superpowers" : "modo-deus";
    assert.equal(editarTs(`${prefixo}:${s}`).status, 0, `${prefixo}:${s}`);
  });
}

test("trava: skill que não é de construção não libera código", () => {
  assert.equal(editarTs("code-review-and-quality", "humanizer", "ponytail-audit").status, 2);
});

test("trava: abrir PR exige cada skill de PR; faltando uma, bloqueia e diz qual", () => {
  for (const falta of kit.trava.pr) {
    const r = abrirPr(...kit.trava.pr.filter((s) => s !== falta));
    assert.equal(r.status, 2, `sem ${falta}`);
    assert.match(r.stderr, new RegExp(falta));
  }
  assert.equal(abrirPr(...kit.trava.pr).status, 0);
});

test("contrato de saída: todo agente do kit que entrega é cobrado no encerramento", () => {
  for (const [nome, def] of Object.entries(kit.agentes)) {
    if (def.time === "maestro") continue;
    const r = hook("evento", { hook_event_name: "SubagentStop", agent_type: `modo-deus:${nome}`, agent_id: "a", last_assistant_message: "feito" });
    assert.equal(r.status, 2, `${nome} encerrou sem o bloco do contrato`);
    assert.match(r.stderr, /contrato/);
  }
});

test("início da sessão injeta as regras que mandam usar skills, grafo e vigia", () => {
  // o CLAUDE.md base vem em partes (regras.mjs 1, 2, 3); as regras do projeto, do sessao.mjs
  const saidas = [hook("sessao", { source: "startup" }), ...["1", "2", "3"].map((n) => hook("regras", { hook_event_name: "SessionStart", source: "startup" }, [n]))];
  for (const r of saidas) assert.equal(r.status, 0);
  const tudo = saidas.map((r) => r.stdout).join("\n");
  for (const trecho of [/Mapa do projeto: graphify primeiro/, /siga a skill `vigia`/, /## Regras deste projeto/]) assert.match(tudo, trecho);
});
