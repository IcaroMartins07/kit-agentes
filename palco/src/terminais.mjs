// Um terminal de verdade (PTY) por agente, com uma tela virtual (xterm sem interface) que guarda o que ele
// mostra. Ler devolve a tela já desenhada, como o usuário veria, sem códigos de cor nem de cursor.
import pty from "node-pty";
import xterm from "@xterm/headless";
import { comandoDe } from "./perfis.mjs";

export function criarTerminais({ cols = 120, rows = 40 } = {}) {
  const ts = new Map();
  let n = 0;
  const pegar = (id) => {
    const t = ts.get(id);
    if (!t) throw new Error(`terminal ${id} não existe`);
    return t;
  };

  return {
    abrir({ cli, cmd, args, cwd, nome } = {}) {
      const c = comandoDe({ cli, cmd, args });
      const id = `t${++n}`;
      const tela = new xterm.Terminal({ cols, rows, scrollback: 2000, allowProposedApi: true });
      const p = pty.spawn(c.argv[0], c.argv.slice(1), { name: "xterm-256color", cols, rows, cwd: cwd || process.cwd(), env: process.env });
      const t = { id, nome: nome || c.nome, cli: cli || null, cwd: cwd || process.cwd(), pid: p.pid, estado: "rodando", inicio: Date.now(), saida: null, p, tela };
      p.onData((d) => tela.write(d));
      p.onExit(({ exitCode }) => { t.estado = "encerrado"; t.saida = exitCode; });
      ts.set(id, t);
      return { id };
    },
    listar() {
      return { terminais: [...ts.values()].map(({ p, tela, ...resto }) => resto) };
    },
    ler(id, { linhas = rows } = {}) {
      const t = pegar(id);
      const b = t.tela.buffer.active;
      const out = [];
      for (let i = 0; i < b.length; i++) out.push(b.getLine(i)?.translateToString(true) ?? "");
      while (out.length && !out[out.length - 1]) out.pop();
      return { id, estado: t.estado, linhas: out.slice(-linhas) };
    },
    // O texto vai direto para o processo do terminal, nunca por um shell.
    enviar(id, texto, { enter = true } = {}) {
      const t = pegar(id);
      if (t.estado !== "rodando") throw new Error(`terminal ${id} está encerrado`);
      t.p.write(String(texto) + (enter ? "\r" : ""));
      return { ok: true };
    },
    fechar(id) {
      const t = pegar(id);
      if (t.estado === "rodando") t.p.kill();
      return { ok: true };
    },
    fecharTodos() {
      for (const t of ts.values()) if (t.estado === "rodando") try { t.p.kill(); } catch { /* já saiu */ }
    },
  };
}
