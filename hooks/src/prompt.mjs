// UserPromptSubmit: uma linha de lembrete. Curta de propósito: entra no contexto a cada mensagem.
import { lerEntrada, acharProjeto, lerConfig } from "./comum.mjs";

const entrada = lerEntrada();
const proj = acharProjeto(entrada);
if (!proj) process.exit(0);
const { perfil } = lerConfig(proj.raiz);
process.stdout.write(`[modo-deus · ${perfil}] Tarefa de código: invoque a skill da fase. Mapeie pelo grafo (graphify query/explain/affected) antes de varrer pastas. Pergunta ou conversa: responda direto.\n`);
