// Como abrir cada IA num terminal. No Windows as CLIs instaladas pelo npm são .cmd, e o ConPTY só abre
// executável: o nome solto passa pelo cmd.exe, que acha o .cmd no PATH. Um .exe com caminho roda direto.
import path from "node:path";

export const PERFIS = { claude: "claude", codex: "codex", gemini: "gemini" };

export function comandoDe({ cli, cmd, args = [] }) {
  if (cli && !PERFIS[cli]) throw new Error(`CLI desconhecida: ${cli} (há: ${Object.keys(PERFIS).join(", ")}; ou use --cmd)`);
  const base = cli ? PERFIS[cli] : cmd;
  if (!base) throw new Error("informe --cli <claude|codex|gemini> ou --cmd <comando>");
  const nome = cli || path.basename(base).replace(/\.(exe|cmd|bat)$/i, "");
  const direto = process.platform !== "win32" || /\.exe$/i.test(base);
  const argv = direto ? [base, ...args] : [process.env.ComSpec || "cmd.exe", "/d", "/s", "/c", base, ...args];
  return { nome, argv };
}
