// Roda a suíte em qualquer node 18+. O `node --test "testes/*.test.mjs"` só expande o glob no node 21+;
// aqui a lista de arquivos é montada antes.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pasta = path.join(raiz, "testes");
const arquivos = fs.readdirSync(pasta).filter((f) => f.endsWith(".test.mjs")).sort().map((f) => path.join(pasta, f));
const r = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...arquivos], { stdio: "inherit", cwd: raiz });
process.exitCode = r.status ?? 1;
