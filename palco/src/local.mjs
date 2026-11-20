// Onde o daemon mora: pasta (PALCO_HOME ou ~/.claude/palco), endereço local (named pipe no Windows, socket
// Unix nos outros) e o arquivo com o token. Nada escuta em porta de rede.
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

export const pasta = () => process.env.PALCO_HOME || path.join(os.homedir(), ".claude", "palco");
export const arqInfo = () => path.join(pasta(), "daemon.json");
export const endereco = () =>
  process.platform === "win32"
    ? `\\\\.\\pipe\\palco-${crypto.createHash("sha1").update(pasta().toLowerCase()).digest("hex").slice(0, 12)}`
    : path.join(pasta(), "palco.sock");
