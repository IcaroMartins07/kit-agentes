// Onde o daemon mora: pasta (MCP_ORCA_HOME ou ~/.claude/mcp-orca), endereço local (named pipe no Windows, socket
// Unix nos outros) e o arquivo com o token. Nada escuta em porta de rede.
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

export const pasta = () => process.env.MCP_ORCA_HOME || path.join(os.homedir(), ".claude", "mcp-orca");
export const arqInfo = () => path.join(pasta(), "daemon.json");
export const endereco = () =>
  process.platform === "win32"
    ? `\\\\.\\pipe\\mcp-orca-${crypto.createHash("sha1").update(pasta().toLowerCase()).digest("hex").slice(0, 12)}`
    : path.join(pasta(), "mcp-orca.sock");
