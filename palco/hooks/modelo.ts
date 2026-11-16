// Lógica pura do palco: nada de `$` aqui, para testar sem engine.
import type { Ferramentas, No, Status, Tipo } from '../types'

export const LARG = 30
export const ALT = 8
export const MAX_SAIDA = 12000
export const MAX_NOS = 60

export const ROTULO: Record<Tipo, string> = {
  nota: 'nota',
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
  cmd: 'comando',
}

export const COR_STATUS: Record<Status, string> = {
  parado: 'gray',
  rodando: 'cyan',
  ok: 'green',
  falhou: 'red',
  bloqueado: 'yellow',
}

export const SIMBOLO: Record<Status, string> = {
  parado: '○',
  rodando: '●',
  ok: '✔',
  falhou: '✘',
  bloqueado: '⛔',
}

/** Próximo nó: entra numa posição livre perto do centro da vista, em cascata. */
export function novoNo(tipo: Tipo, nos: readonly No[], vista: { px: number; py: number }, id: string): No {
  const n = nos.filter(x => x.tipo === tipo).length + 1
  const desloca = (nos.length % 6) * 3
  return {
    id,
    tipo,
    titulo: `${ROTULO[tipo]} ${n}`,
    x: vista.px + 2 + desloca,
    y: vista.py + 1 + desloca,
    w: LARG,
    h: tipo === 'nota' ? 5 : ALT,
    texto: '',
    agente: tipo === 'claude' ? 'general-purpose' : '',
    status: 'parado',
    saida: '',
  }
}

/** O nó sob a célula (x, y) do plano virtual; o de cima (último) ganha. */
export function noEm(nos: readonly No[], x: number, y: number): No | undefined {
  for (let i = nos.length - 1; i >= 0; i--) {
    const n = nos[i]
    if (n && x >= n.x && x < n.x + n.w && y >= n.y && y < n.y + n.h) return n
  }
  return undefined
}

/** Acrescenta um pedaço de saída mantendo só o fim (MAX_SAIDA caracteres). */
export function juntarSaida(saida: string, pedaco: string, max = MAX_SAIDA): string {
  const s = saida + pedaco
  return s.length > max ? s.slice(s.length - max) : s
}

/** Últimas `n` linhas não vazias, cada uma cortada em `largura`. */
export function ultimasLinhas(saida: string, n: number, largura: number): string[] {
  if (n <= 0) return []
  const linhas = saida
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.replace(/\t/g, '  ').trimEnd())
    .filter(l => l.length > 0)
  return linhas.slice(-n).map(l => (l.length > largura ? l.slice(0, Math.max(1, largura - 1)) + '…' : l))
}

// ---------- cerca ----------
// Mesmas regras de "ação perigosa" (V9) do modo-deus, para o que o palco roda por fora dos hooks.
const PERIGOS: [RegExp, string][] = [
  [/\bgit\s+push\b[^;&|]*(\s--force(-with-lease)?\b|\s-f\b|\s\+\S)/, 'push forçado'],
  [/\bgit\s+push\b[^;&|]*\s(origin\s+)?(HEAD:)?(main|master)\b/, 'push para a branch principal'],
  [/\bgit\s+reset\b[^;&|]*--hard\b/, 'git reset --hard'],
  [/\bgit\s+clean\b[^;&|]*\s-[a-zA-Z]*f/, 'git clean -f'],
  [/\bgit\s+branch\b[^;&|]*\s-D\b/, 'remoção forçada de branch'],
  [/\brm\s+-[a-zA-Z]*[rR][a-zA-Z]*\s+(\/|~|\$HOME|\.\.?)(\s|\/?$|;|&|\|)/, 'rm recursivo fora do projeto'],
  [/\b(npm|pnpm|yarn|bun)\s+publish\b/, 'publicação de pacote'],
  [/\b(vercel|vc)\b[^;&|]*--prod\b/, 'deploy de produção'],
  [/\b(firebase|fly|flyctl)\s+deploy\b/, 'deploy'],
  [/\bterraform\s+(apply|destroy)\b/, 'mudança de infraestrutura'],
  [/\b(kubectl|helm)\s+(apply|delete|install|upgrade|uninstall)\b/, 'mudança em cluster'],
  [/\bsupabase\s+db\s+push\b|\bprisma\s+migrate\s+deploy\b/, 'migração no banco remoto'],
  [/\bdocker\s+push\b|\bgh\s+release\s+create\b/, 'publicação'],
  [/(^|[\s'"=/])\.env(\.(local|development|production|staging|test))?(?=$|[\s'";|&)])/, 'arquivo de segredo (.env)'],
  [/\.(pem|key|pfx|p12)(?=$|[\s'";|&)])/, 'arquivo de chave'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bsk-ant-[A-Za-z0-9_-]{20,}/, 'segredo no texto'],
  [/--dangerously|--yolo\b|--full-auto\b|bypassPermissions/, 'flag que desliga aprovações'],
]

/** Motivo do bloqueio, ou null se pode rodar. Vale para comando e para prompt de CLI. */
export function cerca(texto: string): string | null {
  for (const [re, motivo] of PERIGOS) if (re.test(texto)) return motivo
  return null
}

/** Argumentos do processo de um nó (null para nota e Claude, que roda como subagente). */
export function argvDe(no: No, f: Ferramentas): string[] | null {
  const t = no.texto.trim()
  if (!t) return null
  switch (no.tipo) {
    case 'codex':
      return ['codex', 'exec', t]
    case 'gemini':
      return ['gemini', '-p', t]
    case 'cmd':
      return f.shell === 'bash' ? ['bash', '-lc', t] : ['cmd', '/d', '/s', '/c', t]
    default:
      return null
  }
}

/** Por que o nó não pode rodar agora, ou null. */
export function impedimento(no: No, f: Ferramentas): string | null {
  if (no.tipo === 'nota') return 'nota não roda'
  if (no.status === 'rodando') return 'já está rodando'
  if (!no.texto.trim()) return no.tipo === 'cmd' ? 'escreva o comando' : 'escreva o prompt'
  if (no.tipo === 'codex' && !f.codex) return 'codex não instalado'
  if (no.tipo === 'gemini' && !f.gemini) return 'gemini não instalado (npm i -g @google/gemini-cli)'
  return null
}

/** O que vai para o $.store: o layout e o texto, sem processos em andamento. */
export function paraGuardar(nos: readonly No[]): No[] {
  return nos.slice(0, MAX_NOS).map(n => ({
    ...n,
    status: n.status === 'rodando' ? 'parado' : n.status,
    saida: n.saida.slice(-2000),
    agentId: undefined,
  }))
}

/** Lê o que veio do $.store, descartando o que não for nó. */
export function lerGuardado(v: unknown): No[] {
  if (!Array.isArray(v)) return []
  const tipos = new Set(['nota', 'claude', 'codex', 'gemini', 'cmd'])
  return v
    .filter((n): n is No => !!n && typeof n === 'object' && typeof (n as No).id === 'string' && tipos.has((n as No).tipo))
    .map(n => ({
      ...n,
      x: Number(n.x) || 0,
      y: Number(n.y) || 0,
      w: Math.max(12, Number(n.w) || LARG),
      h: Math.max(3, Number(n.h) || ALT),
      texto: String(n.texto ?? ''),
      agente: String(n.agente ?? ''),
      saida: String(n.saida ?? ''),
      status: n.status === 'rodando' ? 'parado' : n.status,
    }))
    .slice(0, MAX_NOS)
}
