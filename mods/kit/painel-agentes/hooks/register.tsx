import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Agent, Change, Graph, Plan } from '../types'
import { ROW_PX, nodeIcon, rowSvg, rowWidth } from './filetree-icons'
import { carregar, renderGestor } from './gerenciador'
import { ORCA_PANE, loadOrcaLogo, openOrcaPane, renderOrcaPane, startOrcaPolling, stopOrcaPolling, tintLogo } from './orca'
import { G, PALETTE, SPRITES, mascoteDe, spriteSvg } from './sprites'

const PANE = 'agentes'
const TITLE = 'Agentes'
const MAIN = 'main'
const MAIN_AGENT: Agent = { id: MAIN, name: 'Claude', type: 'principal', doing: 'Esperando você', status: 'waiting', changes: [], startedAt: 0, endedAt: 0, tokens: 0, cache: 0, plan: null, parentId: '', where: '', whereKind: '' }

// Mude a tag quando os campos mudarem: o valor guardado sobrevive ao reload.
const agents = atom({ plugin: 'painel-agentes', key: 'agents' } as const, [], { shape: 'agents-5' })
// Relógio que redesenha as barras a cada segundo, só enquanto algo roda.
const now = atom({ plugin: 'painel-agentes', key: 'now' } as const, 0)
let tick: { cancel: () => void } | undefined
const expanded = atom({ plugin: 'painel-agentes', key: 'expanded' } as const, '')
const graph = atom({ plugin: 'painel-agentes', key: 'graph' } as const, null, { shape: 'graph-1' })
const graphError = atom({ plugin: 'painel-agentes', key: 'graphError' } as const, '')
const tab = atom({ plugin: 'painel-agentes', key: 'tab' } as const, 'agentes')
const graphHtml = atom({ plugin: 'painel-agentes', key: 'graphHtml' } as const, '')

const worktree = atom({ plugin: 'painel-agentes', key: 'worktree' } as const, [], { shape: 'worktree-1' })
const treeOpen = atom({ plugin: 'painel-agentes', key: 'treeOpen' } as const, [])
const touched = atom({ plugin: 'painel-agentes', key: 'touched' } as const, [], { shape: 'touched-1' })
// Pastas que a árvore não mostra, e quantas linhas ela desenha no máximo.
const HIDDEN = new Set(['.git', 'node_modules'])
const MAX_TREE_ROWS = 150

// Cores: chaves do tema, que seguem o tema ativo (claro, escuro ou uma paleta do mod temas). Nada pinta fundo opaco,
// para o vidro fosco do app aparecer. Só o desenho em Svg (sprites, esfera, logo, ícone de arquivo, barras dos grupos)
// usa hex: o Svg não lê o tema.
const ORANGE = '#e8742c'
// Cores do worktree: uma chave por significado, de famílias diferentes (laranja, âmbar, rosa, azul, roxo, verde,
// vermelho, verde-água) para não se confundirem. O Guia Worktree usa as mesmas. diffAddedWord/diffRemovedWord, e não
// diffAdded/diffRemoved: estas são fundos de linha de diff e somem como cor de texto.
const WT = {
  writing: 'claude',
  reading: 'warning',
  written: 'bashBorder',
  read: 'ide',
  modified: 'merged',
  added: 'diffAddedWord',
  deleted: 'diffRemovedWord',
  renamed: 'planMode',
} as const
// O ícone de arquivo é Svg (com texto alternativo para leitor de tela), então fica em hex.
const FILE_ICON = { added: '#2FA36B', modified: '#9B6DD6', deleted: '#E0533D' } as const
// Uma linha fina e translúcida (aparece no tema claro e no escuro), esticada na largura que o painel der.
const LINE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 1" width="1000" height="1" preserveAspectRatio="none"><rect width="100" height="1" fill="#808080" fill-opacity="0.35"/></svg>'
// A linha laranja da aba ativa, esticada na largura do nome dela.
const TAB_LINE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 2" width="1000" height="2" preserveAspectRatio="none"><rect width="100" height="2" rx="1" fill="#e8742c"/></svg>'
const TRACK = '#8a847a'
// As barras dos agentes ficam na pílula laranja (escolha da pessoa): desenho em Svg, então em hex.
const GREEN = '#4f8a4b'
const RED = '#c0392b'

// Barra em pílula (cantos totalmente redondos): a de cada agente e a dos grupos do Cérebro, na cor do grupo na esfera.
// Sem valor, um trecho corre de um lado ao outro. O trilho é translúcido, para o vidro do painel aparecer.
// shortcut: desenhada em 1000x12 e reduzida à largura do painel; o terminal, sem Svg, usa o Progress do app.
export function pillSvg(value: number | undefined, max: number, color: string): string {
  const W = 1000, H = 12, r = H / 2
  const track = `<rect width="${W}" height="${H}" rx="${r}" fill="${TRACK}" fill-opacity="0.22"/>`
  if (value === undefined) {
    const seg = W * 0.28
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${track}<rect width="${seg}" height="${H}" rx="${r}" fill="${color}"><animate attributeName="x" values="${-seg};${W};${-seg}" dur="2.4s" repeatCount="indefinite"/></rect></svg>`
  }
  const f = Math.max(0, Math.min(1, max > 0 ? value / max : 0))
  const fill = f > 0 ? `<rect width="${Math.max(H, W * f).toFixed(0)}" height="${H}" rx="${r}" fill="${color}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${track}${fill}</svg>`
}

// git status do worktree, com caminhos relativos à pasta da sessão (o git os dá relativos à raiz do repo).
// -z evita aspas e escapes em nomes com acento; numa renomeação o caminho antigo vem na entrada seguinte.
export function parseStatus(raw: string, prefix: string): { code: string; path: string }[] {
  const parts = raw.split('\0')
  const rows: { code: string; path: string }[] = []
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i] ?? ''
    if (entry.length < 4) continue
    const code = entry.slice(0, 2).trim() || '?'
    const path = entry.slice(3)
    if (code[0] === 'R' || code[0] === 'C') i++
    if (!path.startsWith(prefix)) continue
    rows.push({ code, path: path.slice(prefix.length).replace(/\/$/, '') })
  }
  return rows
}

async function loadWorktree($: EngineInterface): Promise<{ code: string; path: string }[]> {
  const cwd = await $.session.cwd()
  const [status, prefix] = await Promise.all([
    $.process.run(['git', 'status', '--porcelain', '-z', '--untracked-files=all'], { cwd, timeoutMs: 8000 }).catch(() => undefined),
    $.process.run(['git', 'rev-parse', '--show-prefix'], { cwd, timeoutMs: 8000 }).catch(() => undefined),
  ])
  const rows = status && status.exitCode === 0 ? parseStatus(status.stdout, prefix?.exitCode === 0 ? prefix.stdout.trim() : '').slice(0, 500) : []
  await update($, worktree, () => rows)
  return rows
}

// Arquivos que um comando de terminal mudou: os do git status cuja data mudou desde que o comando começou.
// shortcut: não vê arquivos ignorados pelo git nem fora da pasta da sessão; para isso, varrer o disco.
async function changedSince($: EngineInterface, rows: { path: string }[], since: number): Promise<string[]> {
  const stats = await Promise.all(rows.map(r => $.fs.stat(r.path).then(s => (s.mtimeMs >= since ? r.path : ''), () => '')))
  return stats.filter(Boolean)
}

// Os mascotes dos agentes (o Claude com o acessório da função de cada um) ficam em sprites.ts.
function spriteOf(agent: Agent): string[] {
  return SPRITES[mascoteDe(agent.type, agent.name, agent.id === MAIN)]
}

// Terminal: dois pixels por célula com '▀' (cima = cor do texto, baixo = fundo).
const DEFAULT = 0x01000000
function cellsOf(px: (x: number, y: number) => number | undefined, w: number, h: number): string {
  const words: number[] = []
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x++) {
      const top = px(x, y), bottom = px(x, y + 1)
      if (top === undefined && bottom === undefined) words.push(0x20, DEFAULT, DEFAULT)
      else if (top === undefined) words.push(0x2584, bottom!, DEFAULT)
      else words.push(0x2580, top, bottom ?? DEFAULT)
    }
  }
  // toBase64 existe no runtime dos mods (ver RasterProps), só falta na lib do TS.
  return (new Uint8Array(Uint32Array.from(words).buffer) as unknown as { toBase64(): string }).toBase64()
}

const STATUS_LABEL: Record<Agent['status'], string> = { running: 'Rodando', waiting: 'Esperando', done: 'Concluído', failed: 'Falhou' }
// Chaves do tema, para seguir o tema ativo (inclusive os do mod temas).
const STATUS_COLOR = { running: 'claude', waiting: 'subtle', done: 'success', failed: 'error' } as const
const STATUS_DOT: Record<Agent['status'], string> = { running: '●', waiting: '○', done: '✓', failed: '✕' }
const STATUS_RANK: Record<Agent['status'], number> = { running: 0, waiting: 1, failed: 2, done: 3 }

const short = (path: string) => path.split(/[\\/]/).pop() || path
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function doingOf(tool: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (tool) {
    case 'Read': return `Lendo ${short(s('file_path'))}`
    case 'Edit': case 'MultiEdit': return `Editando ${short(s('file_path'))}`
    case 'Write': return `Escrevendo ${short(s('file_path'))}`
    case 'Bash': case 'PowerShell': return `Rodando: ${clip(s('command'), 40)}`
    case 'Grep': return `Buscando "${clip(s('pattern'), 30)}"`
    case 'Glob': return `Procurando ${clip(s('pattern'), 30)}`
    case 'WebFetch': case 'WebSearch': return 'Lendo as fontes na web'
    case 'Agent': case 'Task': return `Delegando: ${clip(s('description'), 34)}`
    default: return `Usando ${tool.replace(/^mcp__[^_]+__/, '')}`
  }
}

function changeOf(tool: string, input: Record<string, unknown>): Change | undefined {
  const file = typeof input.file_path === 'string' ? input.file_path : ''
  if (!file) return undefined
  const lines = (s: unknown, mark: string) => (typeof s === 'string' ? s.split('\n').slice(0, 12).map(l => mark + l) : [])
  let minus: string[] = [], plus: string[] = []
  if (tool === 'Edit') { minus = lines(input.old_string, '-'); plus = lines(input.new_string, '+') }
  else if (tool === 'Write') plus = lines(input.content, '+')
  else if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
    for (const ed of input.edits.slice(0, 3) as Record<string, unknown>[]) { minus.push(...lines(ed.old_string, '-')); plus.push(...lines(ed.new_string, '+')) }
  } else return undefined
  if (minus.length + plus.length === 0) return undefined
  return { file, diff: `@@ -1,${minus.length} +1,${plus.length} @@\n${[...minus, ...plus].join('\n')}` }
}

const patch = ($: EngineInterface, id: string, fn: (a: Agent) => Agent) =>
  update($, agents, list => list.map(a => (a.id === id ? fn(a) : a)))

async function loadGraph($: EngineInterface): Promise<void> {
  const file = `${await $.session.cwd()}/graphify-out/graph.json`
  if (!(await $.fs.exists(file))) {
    await update($, graph, () => null)
    await update($, graphError, () => 'Nenhum grafo nesta pasta. Rode /graphify para gerar o segundo cérebro.')
    return
  }
  const run = await $.process.run(['node', `${$.plugin.root}/scripts/resumo-grafo.mjs`, file])
  if (run.exitCode !== 0) {
    await update($, graphError, () => `Não consegui ler o grafo: ${clip(run.stderr.trim(), 160)}`)
    return
  }
  await update($, graph, () => JSON.parse(run.stdout) as Graph)
  await update($, graphError, () => '')
  const html = file.replace(/graph\.json$/, 'graph.html')
  const hasHtml = await $.fs.exists(html)
  await update($, graphHtml, () => (hasHtml ? html : ''))
}

function sphere(g: Graph, size: number, ay = 0.6) {
  const ax = 0.35
  return g.nodes.map(n => {
    const x1 = n.x * Math.cos(ay) + n.z * Math.sin(ay)
    const z1 = -n.x * Math.sin(ay) + n.z * Math.cos(ay)
    const y2 = n.y * Math.cos(ax) - z1 * Math.sin(ax)
    const z2 = n.y * Math.sin(ax) + z1 * Math.cos(ax)
    return { px: (x1 * 0.46 + 0.5) * size, py: (y2 * 0.46 + 0.5) * size, z: z2, c: n.c, d: n.d }
  })
}

const NODE_COLORS = [ORANGE, '#5b8def', '#c9a227', '#7fb069', '#9b6dd6', '#3fa7a0']
const nodeColor = (c: number) => NODE_COLORS[c] ?? '#9a958a'

// Giro em 3D sem script: a esfera é projetada em FRAMES ângulos e o "d" de cada caminho anima entre eles (SMIL).
// Arestas num caminho só e nós agrupados por cor e tamanho (traço redondo de comprimento zero) para caber no limite do Svg.
const FRAMES = 12
export function graphSvg(g: Graph, size: number): string {
  const frames = Array.from({ length: FRAMES + 1 }, (_, k) => sphere(g, size, (2 * Math.PI * k) / FRAMES).map(p => [Math.round(p.px), Math.round(p.py)] as const))
  const path = (attrs: string, d: (f: (typeof frames)[number]) => string) =>
    `<path ${attrs} d="${d(frames[0]!)}"><animate attributeName="d" dur="60s" repeatCount="indefinite" values="${frames.map(d).join(';')}"/></path>`
  const edges = path('fill="none" stroke="#9a958a" stroke-opacity="0.35" stroke-width="0.7"', f =>
    g.edges.map(([a, b]) => `M${f[a]![0]} ${f[a]![1]}L${f[b]![0]} ${f[b]![1]}`).join(''))
  const maxD = Math.max(1, ...g.nodes.map(n => n.d))
  const groups = new Map<string, number[]>()
  g.nodes.forEach((n, i) => {
    const k = `${nodeColor(n.c)}|${n.d / maxD > 0.3 ? 9 : 5}`
    groups.set(k, [...(groups.get(k) ?? []), i])
  })
  const dots = [...groups].map(([k, ids]) => {
    const [color, width] = k.split('|')
    return path(`fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"`, f => ids.map(i => `M${f[i]![0]} ${f[i]![1]}h0`).join(''))
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${edges}${dots}</svg>`
}

function graphCells(g: Graph, w: number, h: number): string {
  const grid = new Map<number, number>()
  const p = sphere(g, 1).map(n => ({ ...n, x: Math.round(n.px * (w - 1)), y: Math.round(n.py * (h - 1)) }))
  for (const [a, b] of g.edges) {
    const steps = Math.max(Math.abs(p[b]!.x - p[a]!.x), Math.abs(p[b]!.y - p[a]!.y), 1)
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(p[a]!.x + ((p[b]!.x - p[a]!.x) * s) / steps), y = Math.round(p[a]!.y + ((p[b]!.y - p[a]!.y) * s) / steps)
      if (!grid.has(y * w + x)) grid.set(y * w + x, 0x5a5650)
    }
  }
  for (const n of p) grid.set(n.y * w + n.x, parseInt(nodeColor(n.c).slice(1), 16))
  return cellsOf((x, y) => grid.get(y * w + x), w, h)
}

async function syncStatuses($: EngineInterface): Promise<void> {
  const live = new Map((await $.agent.list()).map(a => [a.id, a.status]))
  const t = await $.clock.now()
  const map: Record<string, Agent['status']> = { running: 'running', pending: 'running', waiting: 'waiting', idle: 'waiting', completed: 'done', failed: 'failed', killed: 'failed' }
  await update($, agents, list => list.map(a => {
    const st = map[live.get(a.id) ?? '']
    return st && st !== a.status ? { ...a, status: st, doing: st === 'done' ? 'Terminou' : a.doing, endedAt: st === 'running' ? 0 : a.endedAt || t } : a
  }))
}

// Progresso real vem do plano que o agente mantém (TodoWrite ou a lista de tarefas do app).
// Sem plano, a barra fica indeterminada enquanto roda: não inventamos porcentagem.
// Onde um agente está: o arquivo que a ferramenta lê ou escreve, relativo à pasta da sessão.
// Fora da pasta (ou sem arquivo), não marca nada na árvore.
const READS = new Set(['Read', 'NotebookRead'])
const WRITES = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
// Linhas somadas e tiradas de um diff unificado (sem contar o cabeçalho @@).
export function diffStat(diff: string): { add: number; del: number } {
  let add = 0, del = 0
  for (const l of diff.split('\n')) {
    if (l.startsWith('+') && !l.startsWith('+++')) add++
    else if (l.startsWith('-') && !l.startsWith('---')) del++
  }
  return { add, del }
}

// Ícone de arquivo como o do GitHub: quadrado arredondado com + (novo), ponto (modificado) ou − (removido).
const fileIconSvg = (state: 'added' | 'modified' | 'deleted', color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14"><rect x="1.75" y="1.75" width="12.5" height="12.5" rx="3" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="1.5"/>${
    state === 'added' ? `<path d="M8 4.75v6.5M4.75 8h6.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`
      : state === 'deleted' ? `<path d="M4.75 8h6.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`
        : `<circle cx="8" cy="8" r="2.25" fill="${color}"/>`
  }</svg>`

export function whereOf(tool: string, input: Record<string, unknown>, cwd: string): { path: string; kind: 'read' | 'write' } | undefined {
  const kind = READS.has(tool) ? 'read' : WRITES.has(tool) ? 'write' : undefined
  const raw = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
  if (!kind || !raw) return undefined
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const file = norm(raw), root = norm(cwd)
  const rel = file.toLowerCase().startsWith(`${root.toLowerCase()}/`) ? file.slice(root.length + 1) : /^([a-z]:)?\//i.test(file) ? '' : file.replace(/^\.\//, '')
  return rel ? { path: rel, kind } : undefined
}

export function planOf(tool: string, input: Record<string, unknown>, prev: Plan): Plan | undefined {
  const done = (list: unknown) => (list as { status?: string }[]).filter(t => t?.status === 'completed').length
  if (tool === 'TodoWrite' && Array.isArray(input.todos)) return { done: done(input.todos), total: input.todos.length }
  if (!tool.endsWith('update_plan')) return undefined
  if (Array.isArray(input.items)) return { done: done(input.items), total: input.items.length }
  if (!prev) return undefined
  const more = (input.advance === true ? 1 : 0) + (Array.isArray(input.done) ? input.done.length : 0)
  return more ? { ...prev, done: Math.min(prev.total, prev.done + more) } : undefined
}

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
}
export const fmtTokens = (n: number) => (n < 1000 ? `${n}` : n < 1e6 ? `${(n / 1000).toFixed(n < 1e4 ? 1 : 0)}k` : `${(n / 1e6).toFixed(1)}M`)

const elapsed = (a: Agent, t: number) => (a.startedAt ? (a.endedAt || Math.max(t, a.startedAt)) - a.startedAt : 0)

async function setNow($: EngineInterface): Promise<void> {
  const t = await $.clock.now()
  await update($, now, () => t)
}

async function startTicking($: EngineInterface): Promise<void> {
  await setNow($)
  if (!tick) tick = $.clock.every(1000, () => void setNow($).catch(() => undefined))
}

async function stopTickingIfIdle($: EngineInterface): Promise<void> {
  if ((await read($, agents)).some(a => a.status === 'running')) return
  tick?.cancel()
  tick = undefined
  await setNow($)
}

// Sem linha de status no rodapé: o mini resumo ("painel-agentes · N arquivos alterados") saiu; isso fica no painel.
// O app guarda a última linha de um mod até ela ser trocada, então o mod a apaga ao iniciar e a cada fim de turno.


const TOOL_GLYPHS: Record<string, string> = { Read: '◉', Edit: '✎', MultiEdit: '✎', Write: '✎', NotebookEdit: '✎', Bash: '❯', PowerShell: '❯', Grep: '⌕', Glob: '⌕', WebFetch: '◍', WebSearch: '◍', Agent: '◆', Skill: '✦' }
const toolGlyph = (tool: string) => TOOL_GLYPHS[tool] ?? (tool.startsWith('mcp__') ? '◇' : '•')

// O desktop não abre links file:, então o grafo completo abre no app padrão do sistema.
async function openFile($: EngineInterface, path: string): Promise<void> {
  const isWindows = /^[A-Za-z]:[\\/]/.test(path)
  const argv = isWindows ? ['explorer.exe', path.replace(/\//g, '\\')] : ['open', path]
  const r = await $.process.run(argv).catch(() => undefined)
  // explorer.exe sai com 1 mesmo quando abre; só avisa se nem rodou.
  if (!r) $.ui.toast('Não consegui abrir o grafo completo')
}

async function togglePane($: EngineInterface): Promise<void> {
  const isUp = (await $.ui.panes()).some(p => p.id === PANE)
  if (isUp) await $.ui.close({ id: PANE })
  else await $.ui.open({ id: PANE, title: TITLE, columns: 48 })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'agentes', description: 'Mostra ou esconde o painel de agentes e o segundo cérebro', immediate: true })
    await $.command.register({ name: 'orca', description: 'Abre o Orca dentro do Claude: worktrees e agentes (Claude, Codex, Antigravity...); /orca largo abre em tela cheia', immediate: true })
    await $.command.register({ name: 'gerenciador', description: 'Abre a aba Skill do painel: ligue e desligue skills, plugins e mods', immediate: true })
    void loadOrcaLogo($).catch(() => undefined)
    $.ui.status(undefined)
    await update($, agents, list => (list.some(a => a.id === MAIN) ? list : [MAIN_AGENT, ...list]))
    void loadGraph($).catch(() => undefined)
    void loadWorktree($).catch(() => undefined)
    // O Painel de controle abre sozinho, docado à direita.
    void $.ui.open({ id: PANE, title: TITLE, columns: 48 }).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'orca' }, async ($, e) => {
    await openOrcaPane($, /larg|cheia|full/i.test(e.args ?? '') ? true : undefined)
    return {} // sem linha vazia no chat: o painel já é a resposta
  })

  on('command.run', { command: 'gerenciador' }, async $ => {
    await update($, tab, () => 'skill')
    await $.ui.open({ id: PANE, title: TITLE, columns: 48 })
    void carregar($).catch(() => undefined)
    return {} // sem linha no chat: o painel abrindo é a resposta
  })

  on('ui.render', { component: 'Pane', requestId: ORCA_PANE }, async ($, e) => renderOrcaPane($, e))

  // Fechou o painel do Orca: para de consultar o Orca.
  on('ui.close', { id: ORCA_PANE }, async ($, e, next) => {
    stopOrcaPolling()
    return next(e)
  })

  on('command.run', { command: 'agentes' }, async $ => {
    await togglePane($)
    return {} // sem linha vazia no chat: o painel já é a resposta
  })

  on('turn.start', async ($, e, next) => {
    if (!('agentId' in e) || !e.agentId) {
      const t = await $.clock.now()
      // Um prompt novo é uma tarefa nova: zera tempo, tokens e plano. Uma continuação ("") segue somando.
      await patch($, MAIN, a => (e.text || !a.startedAt ? { ...a, status: 'running', doing: 'Pensando…', startedAt: t, endedAt: 0, tokens: 0, cache: 0, plan: null } : { ...a, status: 'running', doing: 'Pensando…', endedAt: 0 }))
      await startTicking($)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const u = r.usage
    if (u) {
      // Tokens novos (entrada, saída e cache gravado) separados da releitura de cache, que é barata e infla o número.
      const n = u.input_tokens + u.output_tokens + (u.cache_creation_input_tokens ?? 0)
      const lidos = u.cache_read_input_tokens ?? 0
      await patch($, e.agentId ?? MAIN, a => ({ ...a, tokens: a.tokens + n, cache: (a.cache ?? 0) + lidos }))
    }
    return r
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.agentId) {
      const agent: Agent = { id: r.agentId, name: e.name || e.description || e.subagentType, type: e.subagentType, doing: clip(e.description || 'Começando', 40), status: 'running', changes: [], startedAt: await $.clock.now(), endedAt: 0, tokens: 0, cache: 0, plan: null, parentId: e.parentAgentId ?? '', where: '', whereKind: '' }
      await update($, agents, list => [...list.filter(a => a.id !== agent.id), agent].slice(-30))
      await startTicking($)
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const input = e as unknown as Record<string, unknown>
    const at = whereOf(e.tool, input, await $.session.cwd())
    await patch($, id, a => {
      const plan = planOf(e.tool, input, a.plan)
      // Só ferramentas de arquivo mudam o lugar; um comando ou uma busca mantém o último arquivo.
      return { ...a, status: 'running', doing: doingOf(e.tool, input), ...(plan !== undefined ? { plan } : {}), ...(at ? { where: at.path, whereKind: at.kind } : {}) }
    })
    // Escrever vence ler: um arquivo editado continua marcado como editado mesmo que seja lido depois.
    if (at) await update($, touched, l => (l.some(x => x.path === at.path && x.kind === 'write') ? l : [...l.filter(x => x.path !== at.path), at].slice(-400)))
    const isShell = e.tool === 'Bash' || e.tool === 'PowerShell'
    const since = isShell ? await $.clock.now() : 0
    const r = await next(e)
    const change = 'deny' in r && r.deny ? undefined : changeOf(e.tool, input)
    // O worktree acompanha ao vivo, como o File Tree: depois de cada escrita ou comando, relê o git status;
    // o que um comando mudou vira 'editado' por esse agente e marca onde ele está.
    if (at?.kind === 'write' || isShell) {
      const rows = await loadWorktree($).catch(() => [])
      const changed = isShell ? await changedSince($, rows, since - 1000) : []
      if (changed.length) {
        await update($, touched, l => [...l.filter(x => !changed.includes(x.path)), ...changed.map(path => ({ path, kind: 'write' as const }))].slice(-400))
        await patch($, id, a => ({ ...a, where: changed[changed.length - 1] ?? a.where, whereKind: 'write' }))
      }
    }
    if (change) await patch($, id, a => ({ ...a, changes: [...a.changes, change].slice(-8) }))
    if (e.tool === 'Agent') await syncStatuses($)
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const id = ('agentId' in e && typeof e.agentId === 'string' && e.agentId) || MAIN
    const t = await $.clock.now()
    await patch($, id, a => ({ ...a, where: '', whereKind: '', endedAt: t, status: id === MAIN ? 'waiting' : e.isAborted ? 'failed' : 'done', doing: id === MAIN ? 'Esperando você' : e.isAborted ? 'Interrompido' : 'Terminou' }))
    if (id === MAIN) await syncStatuses($)
    $.ui.status(undefined) // apaga o mini resumo antigo do rodapé, que o app guardava
    await stopTickingIfIdle($)
    return next(e)
  })

  // Acima da barra do prompt não fica nada: as linhas de todos os mods somem (a área vai ser refeita do zero). A barra
  // de progresso da tarefa fica só no painel, no cartão do topo.
  on('ui.render', { component: 'AbovePromptList' }, ($, e, next) => next({ ...e, props: { ...e.props, rows: [] } }),
  )

  // Linhas de ferramenta mais limpas: um ícone por tipo, na cor do estado, antes da linha do Claude Code.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)
    if (e.surface === 'mobile' || e.surface === 'vscode') return row
    const { Box, Text } = $.ui.resolve(e)
    const color = e.props.isErrored ? 'error' : e.props.isRunning ? 'claude' : 'subtle'
    return (
      <Box flexDirection="row" gap={1}>
        <Box flexShrink={0} width={2}><Text color={color} bold>{toolGlyph(e.props.tool)}</Text></Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>{row}</Box>
      </Box>
    )
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if ((await read($, tab)) === 'orca') stopOrcaPolling()
    const r = await next(e)
    $.ui.invalidate('ui.render')
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Code, Progress } = ui
    // O terminal tem um Svg que não desenha nada: lá vão o Raster e o Progress do app.
    const Svg = 'Svg' in ui && e.surface !== 'terminal' ? ui.Svg : undefined
    const Raster = 'Raster' in ui ? ui.Raster : undefined
    const list = await read($, agents)
    const open = await read($, expanded)
    const g = await read($, graph)
    const gErr = await read($, graphError)
    const html = await read($, graphHtml)
    const t = await read($, now)
    const current = await read($, tab)
    const tree = await read($, worktree)
    const openDirs = await read($, treeOpen)
    const seen = await read($, touched)
    const isWidget = e.props.placement === 'widget'
    const main = list.find(a => a.id === MAIN) ?? MAIN_AGENT

    // Responsivo pela largura do corpo, em colunas: estreito (celular ou painel apertado), médio, largo.
    // Tudo que tem texto variável encolhe ou quebra linha; nada tem largura fixa maior que o corpo.
    const cols = Math.max(20, e.props.bodyColumns)
    const isNarrow = cols < 40
    const isWide = cols >= 64
    const pad = isNarrow ? 1 : 2
    const fit = (reserve: number) => Math.max(8, cols - reserve)

    const picture = (rows: string[], key: string, px = 3) =>
      // O mascote num ladrilho arredondado, como no mockup: 36 px nos cartões (px 3), 24 px no estreito (px 2).
      Svg ? <Svg source={spriteSvg(rows, (isNarrow ? Math.min(px, 2) : px) * 12, true)} alt="mascote do agente" />
        : Raster ? <Raster key={key} columns={G} rows={G / 2} cells={cellsOf((x, y) => PALETTE[rows[y]?.[x] ?? '.'], G, G)} />
          : null

    // Um cartão só para o painel inteiro: mesma borda (laranja suave, como no mockup), mesmo respiro, mesmo espaço.
    const panel = (key: string, children: RenderChildren, extra: { alignItems?: 'center' } = {}) => (
      <Box key={key} flexDirection="column" borderStyle="round" borderColor="claude" borderDimColor paddingX={pad} paddingY={1} marginBottom={1} rowGap={1} overflow="hidden" {...extra}>
        {children}
      </Box>
    )
    // Título de seção: à esquerda o nome, à direita uma ação ou um dado; no estreito, um embaixo do outro.
    const sectionHead = (title: string, aside?: RenderChildren) => (
      <Box flexDirection={isNarrow ? 'column' : 'row'} justifyContent="space-between" alignItems={isNarrow ? 'flex-start' : 'center'} columnGap={2}>
        <Text bold>{title}</Text>
        {aside}
      </Box>
    )
    // Cabeça de um agente: pixel art, nome e o que faz; o estado vai à direita (ou embaixo, no estreito).
    const agentHead = (a: Agent, title: string, subtitle: string, aside: RenderChildren, spriteKey: string, px = 3, isBig = false) => (
      // O estado fica à direita do nome, como no mockup; só num painel muito estreito (menos de 30 colunas) desce para baixo.
      <Box flexDirection={cols < 30 ? 'column' : 'row'} columnGap={2} alignItems={cols < 30 ? 'flex-start' : 'center'}>
        <Box flexDirection="row" columnGap={2} alignItems="center" flexGrow={1} flexShrink={1}>
          <Box flexShrink={0}>{picture(spriteOf(a), spriteKey, px)}</Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Text bold size={isBig ? 'heading' : undefined} weight={isBig ? 'semibold' : undefined}>{clip(title, fit(isNarrow ? 8 : 26))}</Text>
            {subtitle !== '' && <Text dimColor size="footnote">{clip(subtitle, fit(isNarrow ? 8 : 18))}</Text>}
          </Box>
        </Box>
        <Box flexShrink={0}>{aside}</Box>
      </Box>
    )

    // Sub-agentes de um agente: os que ele chamou (do principal, os desta tarefa).
    const childrenOf = (a: Agent) =>
      list.filter(c => c.id !== MAIN && (a.id === MAIN ? c.parentId === '' && main.startedAt > 0 && c.startedAt >= main.startedAt : c.parentId === a.id))
    const daTarefa = (a: Agent) => (a.id === MAIN ? list.filter(c => c.id === MAIN || (main.startedAt > 0 && c.startedAt >= main.startedAt)) : [a])
    const tokensOf = (a: Agent) => daTarefa(a).reduce((s, c) => s + c.tokens, 0)
    const cacheOf = (a: Agent) => daTarefa(a).reduce((s, c) => s + (c.cache ?? 0), 0)

    // A barra de um agente, em pílula laranja (verde ao concluir, vermelha se falhou): o plano dele; senão, quantos
    // sub-agentes concluíram; sem nenhum dos dois, um trecho corre enquanto roda e a barra enche ao terminar. No terminal,
    // sem Svg, o Progress do app nas cores do tema.
    const bar = (a: Agent, key: string, label: string) => {
      const kids = childrenOf(a)
      const kidsDone = kids.filter(c => c.status === 'done' || c.status === 'failed').length
      const hasPlan = a.plan !== null && a.plan.total > 0
      const isOver = a.status === 'done' || a.status === 'failed' || (a.id === MAIN && a.status === 'waiting' && a.startedAt > 0)
      const [value, max] = !a.startedAt ? [0, 1] : isOver ? [1, 1] : hasPlan ? [a.plan!.done, a.plan!.total] : kids.length ? [kidsDone, kids.length] : [undefined, 1]
      const color = a.status === 'failed' ? 'error' : a.status === 'done' ? 'success' : 'claude'
      const figures = (
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor size="footnote" tabular>⏱ {fmtTime(elapsed(a, t))}</Text>
          <Box flexDirection="row" columnGap={1}>
            {cacheOf(a) > 0 && <Text dimColor size="caption" tabular>{fmtTokens(cacheOf(a))} em cache ·</Text>}
            <Text dimColor size="footnote" tabular>{fmtTokens(tokensOf(a))} tokens</Text>
          </Box>
        </Box>
      )
      return (
        <Box key={key} flexDirection="column" rowGap={0}>
          {Svg ? <Svg source={pillSvg(value, max, a.status === 'failed' ? RED : a.status === 'done' ? GREEN : ORANGE)} alt={`${label}: ${value === undefined ? 'em andamento' : `${Math.round((value / max) * 100)}%`}`} />
            : <Progress label={label} value={value} max={max} color={color} />}
          {figures}
        </Box>
      )
    }

    // Uma linha fina, na cor apagada do tema, para separar partes de um cartão (a caixa não tem borda de um lado só).
    const divider = (key: string) => (
      <Box key={key} height={1} justifyContent="center" overflow="hidden">
        {Svg ? <Svg source={LINE_SVG} alt="divisória" height={1} /> : <Text dimColor>{'─'.repeat(Math.max(4, cols - 8))}</Text>}
      </Box>
    )

    // Os sub-agentes de um cartão numa linha: quantos concluíram à esquerda e cada um com seu estado à direita.
    const kidsRow = (a: Agent) => {
      const kids = childrenOf(a)
      if (!kids.length) return null
      const done = kids.filter(c => c.status === 'done').length
      return (
        <Box key={`kids-${a.id}`} flexDirection={isNarrow ? 'column' : 'row'} justifyContent="space-between" columnGap={2}>
          <Box flexShrink={0}><Text dimColor size="footnote">Sub-agentes: {done} de {kids.length}</Text></Box>
          <Box flexDirection="row" flexWrap="wrap" columnGap={2} flexShrink={1}>
            {kids.map(c => (
              <Text key={`k-${c.id}`} size="footnote"><Text color={STATUS_COLOR[c.status]}>{STATUS_DOT[c.status]}</Text> {clip(c.name, isNarrow ? 12 : 18)}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    // Cartão fixo do topo: a tarefa atual é o próprio Claude (um cartão só, uma barra só).
    const pct = main.plan && main.plan.total ? Math.round((main.plan.done / main.plan.total) * 100) : undefined
    const state = main.status === 'running' ? (pct !== undefined ? `${pct}%` : 'em andamento') : main.startedAt ? 'concluída' : 'sem tarefa'
    const header = panel('tarefa', [
      agentHead(main, 'Tarefa atual', main.startedAt ? main.doing : 'Mande um pedido e o progresso aparece aqui.', <Text color={main.status === 'running' ? 'claude' : 'subtle'} bold>{state}</Text>, 'sprite-main', 3, true),
      bar(main, 'barra-geral', 'Progresso da tarefa'),
      childrenOf(main).length > 0 && divider('div-tarefa'),
      kidsRow(main),
      main.changes.length > 0 && (
        <Button key="ver-main" plain onPress={() => Promise.all([update($, expanded, () => MAIN), update($, tab, () => 'alteracoes')])}>
          <Text color="claude" size="footnote">Ver {main.changes.length} alteraç{main.changes.length > 1 ? 'ões' : 'ão'} do Claude</Text>
        </Button>
      ),
    ])

    // Abas, todas dentro deste painel: Arquivos mostra a árvore do worktree; Alterações, o que cada agente mudou.
    const running = list.filter(a => a.status === 'running').length
    const changes = list.flatMap(a => a.changes.map((c, i) => ({ ...c, agent: a, i })))
    // Como no mockup: a aba ativa em laranja e sublinhada, o número ao lado do nome, e uma linha fina embaixo das abas.
    const tabs = [
      { id: 'agentes', label: 'Agentes', count: running },
      { id: 'arquivos', label: 'Worktree', count: 0 },
      { id: 'alteracoes', label: 'Alterações', count: changes.length },
      { id: 'cerebro', label: 'Cérebro', count: 0 },
      { id: 'orca', label: 'Orca', count: 0 },
      { id: 'skill', label: 'Skill', count: 0 },
    ] as const
    const goTo = async (id: (typeof tabs)[number]['id']) => {
      if (current === 'orca' && id !== 'orca') stopOrcaPolling()
      await update($, tab, () => id)
      if (id === 'arquivos') await loadWorktree($)
      if (id === 'orca') void startOrcaPolling($).catch(() => undefined)
    }
    const tabBar = (
      <Box flexDirection="column" marginBottom={1}>
        <Box flexDirection="row" flexWrap="wrap" columnGap={cols < 56 ? 1 : 2} rowGap={0} paddingX={cols < 56 ? 0 : 1}>
          {tabs.map(tb => {
            const isOn = current === tb.id
            // No desktop a aba é um botão nativo, que ignora a cor e o sublinhado do texto dentro dele: as inativas ficam
            // apagadas (dimColor, do próprio botão) e a ativa ganha uma linha laranja embaixo, fora do botão.
            return (
              <Box key={`aba-box-${tb.id}`} flexDirection="column" rowGap={0}>
                <Button key={`aba-${tb.id}`} plain dimColor={!isOn} onPress={() => goTo(tb.id)}>
                  <Text color={isOn ? 'claude' : 'subtle'} bold={isOn} underline={isOn} size="footnote">{tb.label}</Text>
                  {tb.count > 0 ? <Text color={isOn ? 'claude' : 'subtle'} size="footnote"> {tb.count}</Text> : ''}
                </Button>
                {/* shortcut: a largura da linha é estimada em ~7 px por caractere da letra pequena; troque por medida real se o app der uma. */}
                {isOn && Svg && <Svg source={TAB_LINE_SVG} alt="aba ativa" height={2} width={Math.round((tb.label.length + (tb.count > 0 ? String(tb.count).length + 1 : 0)) * 7)} />}
              </Box>
            )
          })}
        </Box>
        {divider('div-abas')}
      </Box>
    )

    // Painel de controle: quem roda em cartão inteiro; os parados numa linha só, embaixo.
    const order = list.slice().sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
    // O Claude já está no cartão do topo; aqui ficam só os sub-agentes.
    const active = order.filter(a => a.status === 'running' && a.id !== MAIN)
    const idle = order.filter(a => a.status !== 'running' && a.id !== MAIN)
    const statusChip = (a: Agent) => <Text color={STATUS_COLOR[a.status]} bold={a.status === 'running'} size="footnote">{STATUS_DOT[a.status]} {STATUS_LABEL[a.status]}</Text>
    const card = (a: Agent) =>
      panel(`a-${a.id}`, [
        agentHead(a, a.name, a.doing, statusChip(a), `sprite-${a.id}`),
        a.startedAt > 0 && bar(a, `barra-${a.id}`, `Progresso de ${a.name}`),
        kidsRow(a),
        a.changes.length > 0 && (
          <Button key={`ver-${a.id}`} plain onPress={() => Promise.all([update($, expanded, () => a.id), update($, tab, () => 'alteracoes')])}>
            <Text color="claude" size="footnote">Ver {a.changes.length} alteraç{a.changes.length > 1 ? 'ões' : 'ão'}</Text>
          </Button>
        ),
      ])
    // Como no mockup: a seção "Agentes", com quantos rodam e quantos concluíram, e todos em cartão (os que rodam
    // primeiro). Os mais antigos além de MAX_CARDS viram uma linha só; "limpar" tira os parados.
    const MAX_CARDS = 8
    const subs = [...active, ...idle]
    const doneCount = idle.filter(a => a.status === 'done').length
    const agentsTab = (
      <Box flexDirection="column">
        {subs.length === 0 &&
          panel('vazio-agentes', <Text dimColor>Nenhum sub-agente nesta sessão. Quando o Claude chamar um, ele aparece aqui com a própria barra.</Text>)}
        {subs.length > 0 && (
          <Box key="secao-agentes" flexDirection="column" marginBottom={1} paddingX={isNarrow ? 0 : 1}>
            {sectionHead('Agentes', (
              <Box flexDirection="row" columnGap={2}>
                <Text dimColor size="footnote">{active.length} rodando · {doneCount} concluído{doneCount === 1 ? '' : 's'}</Text>
                {idle.length > 0 && (
                  <Button key="limpar" plain onPress={() => update($, agents, l => l.filter(a => a.id === MAIN || a.status === 'running'))}>
                    <Text dimColor size="footnote">limpar</Text>
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        )}
        {subs.slice(0, MAX_CARDS).map(card)}
        {subs.length > MAX_CARDS && <Text dimColor size="footnote">+{subs.length - MAX_CARDS} anteriores</Text>}
      </Box>
    )

    // Arquivos: a árvore do worktree aqui mesmo. Cada arquivo diz quem está nele agora, o que os agentes
    // fizeram nesta sessão e o estado no git; as pastas com agentes dentro abrem sozinhas. Legenda no Guia Worktree.
    const GIT: Record<string, [string, string]> = { M: ['M', WT.modified], A: ['A', WT.added], '??': ['novo', WT.added], D: ['D', WT.deleted], R: ['R', WT.renamed] }
    const statusOf = new Map(tree.map(f => [f.path.replace(/\/$/, ''), f.code]))
    const seenOf = new Map(seen.map(x => [x.path, x.kind]))
    const here = list.filter(a => a.status === 'running' && a.where !== '')
    const inside = (dir: string, paths: Iterable<string>) => [...paths].some(p => p.startsWith(`${dir}/`))
    const isOpenDir = (dir: string) => openDirs.includes(dir) || here.some(a => a.where.startsWith(`${dir}/`))
    const rows: { path: string; name: string; kind: 'file' | 'dir'; depth: number }[] = []
    if (current === 'arquivos') {
      const walk = async (dir: string, depth: number) => {
        const entries = await $.fs.list(dir || undefined).catch(() => [])
        const sorted = entries
          .filter(x => x.kind !== 'other' && !HIDDEN.has(x.name))
          .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
        for (const x of sorted) {
          if (rows.length >= MAX_TREE_ROWS) return
          const path = dir ? `${dir}/${x.name}` : x.name
          rows.push({ path, name: x.name, kind: x.kind === 'dir' ? 'dir' : 'file', depth })
          if (x.kind === 'dir' && isOpenDir(path)) await walk(path, depth + 1)
        }
      }
      await walk('', 0)
    }
    // A cor do nome: agente editando agora > agente lendo agora > editado na sessão > lido na sessão > normal.
    const look = (r: (typeof rows)[number]) => {
      const now = here.filter(a => (r.kind === 'dir' ? a.where.startsWith(`${r.path}/`) : a.where === r.path))
      const isWriting = now.some(a => a.whereKind === 'write')
      const kind = r.kind === 'dir' ? (inside(r.path, [...seenOf].filter(([, k]) => k === 'write').map(([p]) => p)) ? 'write' : inside(r.path, seenOf.keys()) ? 'read' : '') : seenOf.get(r.path) ?? ''
      const color = now.length ? (isWriting ? WT.writing : WT.reading) : kind === 'write' ? WT.written : kind === 'read' ? WT.read : undefined
      return { now, isWriting, color }
    }
    // Legenda: bolinha na cor, o nome em negrito e, depois, o que quer dizer (embaixo do nome no estreito).
    // A marca (✎, M, novo...) aparece como na árvore, para ligar a legenda ao que se vê nela.
    const legendItem = (key: string, color: string, name: string, meaning: string, mark = '') => (
      <Box key={key} flexDirection="row" columnGap={1} alignItems="flex-start">
        <Box flexShrink={0}><Text color={color}>●</Text></Box>
        <Box flexDirection={isNarrow ? 'column' : 'row'} columnGap={2} flexGrow={1} flexShrink={1}>
          <Box flexShrink={0} width={isNarrow ? undefined : 20}>
            <Text bold color={color}>{name}{mark ? <Text dimColor> {mark}</Text> : ''}</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}><Text dimColor size="footnote">{meaning}</Text></Box>
        </Box>
      </Box>
    )
    const legendGroup = (key: string, title: string, items: RenderChildren) => (
      <Box key={key} flexDirection="column" rowGap={0}>
        <Text size="footnote" weight="semibold">{title}</Text>
        {items}
      </Box>
    )
    const indent = isNarrow ? 1 : 2
    const filesTab = (
      <Box flexDirection="column">
        {panel('worktree', [
          sectionHead('Worktree', <Button key="recarregar-worktree" plain onPress={() => loadWorktree($)}><Text dimColor size="footnote">↻ atualizar</Text></Button>),
          <Text key="worktree-resumo" dimColor size="footnote">
            {here.length
              ? here.map(a => `${a.name} ${a.whereKind === 'write' ? 'editando' : 'lendo'} ${short(a.where)}`).join('; ')
              : tree.length ? `${tree.length} arquivo${tree.length > 1 ? 's' : ''} diferente${tree.length > 1 ? 's' : ''} do último commit.` : 'Nenhum agente em arquivo agora. Nada mudou desde o último commit.'}
          </Text>,
          <Box key="worktree-arvore" flexDirection="column">
            {rows.map(r => {
              const code = r.kind === 'file' ? statusOf.get(r.path) : undefined
              const [mark, markColor] = code ? GIT[code] ?? GIT[code[0] ?? ''] ?? ['•', 'subtle'] : r.kind === 'dir' && inside(r.path, statusOf.keys()) ? ['•', WT.modified] : ['', 'subtle']
              const { now, isWriting, color } = look(r)
              const open = isOpenDir(r.path)
              // O nome encolhe primeiro; o agente e a marca do git ficam sempre visíveis à direita.
              const room = fit(10 + r.depth * indent + (now.length ? (isNarrow ? 4 : 18) : 0))
              const icon = nodeIcon(r)
              // No desktop o recuo, a seta e o ícone vêm num Svg ao lado (um botão só aceita texto dentro).
              const pic = Svg && <Svg key={`ic-${r.path}`} source={rowSvg(r.depth, r.kind === 'dir' ? (open ? 'open' : 'closed') : null, icon, r.kind === 'dir' ? ORANGE : '#85858c')} alt="" width={rowWidth(r.depth)} height={ROW_PX} />
              const label = Svg ? (
                <Text color={color} bold={now.length > 0}>{clip(r.name, room)}</Text>
              ) : (
                <Text>
                  {' '.repeat(r.depth * indent)}<Text color="claude">{r.kind === 'dir' ? (open ? '▾ ' : '▸ ') : '  '}</Text>
                  <Text color={color} bold={now.length > 0} >{clip(r.name, room)}</Text>
                </Text>
              )
              // Pasta com agente atuando dentro: o nome na cor do status dele, em negrito (sem fundo, para o vidro aparecer).
              return (
                <Box key={`w-${r.path}`} flexDirection="row" columnGap={1}>
                  <Box flexDirection="row" alignItems="center" flexGrow={1} flexShrink={1}>
                    {pic}
                    {/* Só pastas abrem e fecham; arquivos não são executados nem abertos fora daqui. */}
                    {r.kind === 'dir' ? (
                      <Button key={`t-${r.path}`} plain onPress={() => update($, treeOpen, l => (l.includes(r.path) ? l.filter(p => p !== r.path && !p.startsWith(`${r.path}/`)) : [...l, r.path]))}>
                        {label}
                      </Button>
                    ) : label}
                  </Box>
                  {r.kind === 'file' && now.length > 0 && (
                    <Box flexShrink={0}>
                      <Text color={isWriting ? WT.writing : WT.reading} size="footnote" bold>{isWriting ? '✎' : '◉'}{isNarrow ? '' : ` ${clip(now.map(a => a.name).join(', '), 14)}`}</Text>
                    </Box>
                  )}
                  {mark !== '' && <Box flexShrink={0}><Text color={markColor} size="footnote" bold>{mark}</Text></Box>}
                </Box>
              )
            })}
            {rows.length >= MAX_TREE_ROWS && <Text dimColor size="footnote">Feche algumas pastas para ver o resto.</Text>}
          </Box>,
        ])}

        {panel('guia-worktree', [
          sectionHead('Guia Worktree'),
          legendGroup('guia-agentes', 'Agentes nos arquivos (cor do nome)', [
            legendItem('g1', WT.writing, 'Editando agora', 'um agente está mudando este arquivo', '✎'),
            legendItem('g2', WT.reading, 'Lendo agora', 'um agente está lendo este arquivo', '◉'),
            legendItem('g3', WT.written, 'Editado', 'um agente mudou nesta sessão'),
            legendItem('g4', WT.read, 'Lido', 'um agente leu nesta sessão'),
          ]),
          legendGroup('guia-git', 'Git, desde o último commit (marca à direita)', [
            legendItem('m1', WT.modified, 'Modificado', 'conteúdo mudou', 'M'),
            legendItem('m2', WT.added, 'Novo', 'arquivo que ainda não está no git', 'A, novo'),
            legendItem('m3', WT.deleted, 'Removido', 'arquivo apagado', 'D'),
            legendItem('m4', WT.renamed, 'Renomeado', 'mudou de nome ou de pasta', 'R'),
            legendItem('m5', WT.modified, 'Pasta com mudanças', 'tem algo modificado dentro', '•'),
          ]),
          <Text key="guia-nota" dimColor size="footnote">Sem cor: nenhum agente passou pelo arquivo. Pastas com um agente trabalhando dentro abrem sozinhas, e o nome dele aparece ao lado do arquivo.</Text>,
        ])}
      </Box>
    )

    // Alterações no jeito do GitHub ("Files changed"): resumo no topo (+ e − e os quadradinhos), um cartão por agente
    // e, em cada arquivo, ícone do estado (novo, modificado, removido), caminho, contagem de linhas e o diff ao abrir.
    const cwd = current === 'alteracoes' ? await $.session.cwd() : ''
    const relOf = (file: string) => whereOf('Edit', { file_path: file }, cwd)?.path ?? short(file)
    const fileState = (file: string): 'added' | 'deleted' | 'modified' => {
      const code = statusOf.get(relOf(file)) ?? ''
      return code === '??' || code.startsWith('A') ? 'added' : code.startsWith('D') ? 'deleted' : 'modified'
    }
    const STATE = { added: ['novo', WT.added, '⊞'], modified: ['modificado', WT.modified, '⊡'], deleted: ['removido', WT.deleted, '⊟'] } as const
    const fileIcon = (state: keyof typeof STATE, key: string) =>
      Svg ? <Svg key={key} source={fileIconSvg(state, FILE_ICON[state])} alt={`arquivo ${STATE[state][0]}`} width={14} height={14} />
        : <Text color={STATE[state][1]}>{STATE[state][2]}</Text>
    // Os cinco quadradinhos do GitHub: verdes e vermelhos na proporção das linhas, cinza no resto.
    const blocks = (add: number, del: number) => {
      const total = add + del
      const green = total ? Math.round((5 * add) / Math.max(total, 5)) : 0
      const red = total ? Math.min(5 - green, Math.round((5 * del) / Math.max(total, 5))) : 0
      return (
        <Text tabular>
          <Text color={WT.added}>{'■'.repeat(green)}</Text><Text color={WT.deleted}>{'■'.repeat(red)}</Text><Text dimColor>{'■'.repeat(5 - green - red)}</Text>
        </Text>
      )
    }
    const counts = (add: number, del: number, key: string) => (
      <Box key={key} flexDirection="row" columnGap={1} flexShrink={0} alignItems="center">
        <Text color={WT.added} bold tabular size="footnote">+{add}</Text>
        <Text color={WT.deleted} bold tabular size="footnote">−{del}</Text>
        {!isNarrow && blocks(add, del)}
      </Box>
    )
    const authors = list.filter(a => a.changes.length > 0).sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
    const allStats = authors.flatMap(a => a.changes.map(c => diffStat(c.diff)))
    const totalAdd = allStats.reduce((s, x) => s + x.add, 0)
    const totalDel = allStats.reduce((s, x) => s + x.del, 0)
    const totalFiles = new Set(authors.flatMap(a => a.changes.map(c => c.file))).size
    const changesTab = authors.length === 0 ? (
      panel('vazio-alteracoes', <Text dimColor>Nenhuma alteração ainda. Quando um agente editar um arquivo, ele aparece aqui com o diff.</Text>)
    ) : (
      <Box flexDirection="column">
        {panel('alteracoes-resumo', (
          <Box flexDirection={isNarrow ? 'column' : 'row'} justifyContent="space-between" columnGap={2}>
            <Text bold>{totalFiles} arquivo{totalFiles > 1 ? 's' : ''} alterado{totalFiles > 1 ? 's' : ''}</Text>
            {counts(totalAdd, totalDel, 'resumo-contas')}
          </Box>
        ))}
        {authors.map(a => {
          const files = [...new Set(a.changes.map(c => c.file))].reverse()
          return panel(`alt-${a.id}`, [
            agentHead(a, a.name, '', statusChip(a), `alt-sprite-${a.id}`, 2),
            a.startedAt > 0 && bar(a, `alt-barra-${a.id}`, `Progresso de ${a.name}`),
            <Box key={`alt-arquivos-${a.id}`} flexDirection="column" rowGap={1}>
              {files.map(file => {
                const edits = a.changes.map((c, i) => ({ ...c, i })).filter(c => c.file === file)
                const stat = edits.reduce((s, c) => { const x = diffStat(c.diff); return { add: s.add + x.add, del: s.del + x.del } }, { add: 0, del: 0 })
                const key = `${a.id}:${file}`
                const isOpen = open === key || open === a.id
                const rel = relOf(file)
                const slash = rel.lastIndexOf('/')
                const dir = slash >= 0 ? rel.slice(0, slash + 1) : ''
                const name = slash >= 0 ? rel.slice(slash + 1) : rel
                const state = fileState(file)
                const room = fit(isNarrow ? 12 : 30)
                return (
                  <Box key={`f-${key}`} flexDirection="column" borderStyle="round" borderColor="claude" borderDimColor paddingX={1} overflow="hidden">
                    <Box flexDirection={isNarrow ? 'column' : 'row'} justifyContent="space-between" alignItems={isNarrow ? 'flex-start' : 'center'} columnGap={2}>
                      <Box flexDirection="row" columnGap={1} alignItems="center" flexGrow={1} flexShrink={1}>
                        <Button key={`arq-${key}`} plain onPress={() => update($, expanded, cur => (cur === key ? '' : key))}>
                          <Text color="claude">{isOpen ? '▾' : '▸'}</Text>
                        </Button>
                        <Box flexShrink={0}>{fileIcon(state, `ico-${key}`)}</Box>
                        <Box flexShrink={1}>
                          <Text>
                            {dir !== '' && <Text dimColor>{clip(dir, Math.max(4, room - name.length))}</Text>}
                            <Text bold>{clip(name, room)}</Text>
                          </Text>
                        </Box>
                      </Box>
                      <Box flexDirection="row" columnGap={2} flexShrink={0} alignItems="center">
                        {edits.length > 1 && <Text dimColor size="footnote">{edits.length} edições</Text>}
                        {counts(stat.add, stat.del, `contas-${key}`)}
                      </Box>
                    </Box>
                    {/* O diff fica contido no cartão do arquivo: linhas longas não empurram o painel. */}
                    {isOpen && (
                      <Box flexDirection="column" overflow="hidden" rowGap={1} marginTop={1}>
                        {edits.slice().reverse().map(c => <Code key={`d-${key}-${c.i}`} source={c.diff} format="diff" path={c.file} />)}
                      </Box>
                    )}
                  </Box>
                )
              })}
            </Box>,
          ])
        })}
      </Box>
    )

    // Cérebro: a esfera girando é o destaque. No largo, esfera e grupos lado a lado; no médio e no estreito, um embaixo do outro.
    // ~7px por coluna no desktop; a esfera nunca passa da largura que sobra no cartão.
    const sphereCols = isWide ? Math.floor(cols / 2) - 4 : cols - 2 * pad - 2
    const size = Math.max(120, Math.min(300, sphereCols * 7))
    const stats = g && (
      <Box key="cerebro-numeros" flexDirection="row" flexWrap="wrap" columnGap={3} justifyContent="center">
        <Text size="footnote"><Text bold>{fmtTokens(g.total.nodes)}</Text> <Text dimColor>nós</Text></Text>
        <Text size="footnote"><Text bold>{fmtTokens(g.total.links)}</Text> <Text dimColor>ligações</Text></Text>
        <Text size="footnote"><Text bold>{g.total.communities}</Text> <Text dimColor>grupos</Text></Text>
      </Box>
    )
    const sphereCard = g && panel('cerebro-esfera', [
      <Box key="cerebro-svg" justifyContent="center">
        {Svg ? <Svg source={graphSvg(g, size)} alt={`Grafo do graphify: ${g.total.nodes} nós e ${g.total.links} ligações`} width={size} height={size} isInteractive />
          : Raster ? <Raster key="grafo" columns={Math.max(10, Math.min(cols - 2 * pad - 2, 48))} rows={14} cells={graphCells(g, Math.max(10, Math.min(cols - 2 * pad - 2, 48)), 28)} />
            : null}
      </Box>,
      stats,
    ], { alignItems: 'center' })
    const groupsCard = g && panel('cerebro-grupos', [
      sectionHead('Maiores grupos', <Text dimColor size="footnote">nós e parte do grafo</Text>),
      ...g.communities.map((c, i) => {
        const name = c.name.replace(/^.*\//, '')
        const folder = c.name.includes('/') ? c.name.slice(0, c.name.lastIndexOf('/')) : ''
        const share = (c.count / Math.max(1, g.total.nodes)) * 100
        const room = isWide ? Math.floor(cols / 2) - 18 : fit(isNarrow ? 16 : 24)
        return (
          <Box key={`com-${i}`} flexDirection="column">
            <Box flexDirection="row" columnGap={2} alignItems="flex-start">
              <Box flexShrink={0}><Text color={nodeColor(i)}>●</Text></Box>
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                <Text bold>{clip(name, Math.max(8, room))}</Text>
                {folder !== '' && <Text dimColor size="caption">{clip(folder, Math.max(8, room))}</Text>}
              </Box>
              <Box flexShrink={0}><Text tabular>{c.count}</Text></Box>
              {!isNarrow && <Box flexShrink={0}><Text dimColor tabular size="footnote">{share < 1 ? share.toFixed(1) : Math.round(share)}%</Text></Box>}
            </Box>
            {Svg ? <Svg source={pillSvg(c.count, g.communities[0]?.count ?? 1, nodeColor(i))} alt={`${c.name}: ${c.count} nós`} />
              : <Progress label={`${c.name}: ${c.count} nós`} value={c.count} max={g.communities[0]?.count ?? 1} color={nodeColor(i)} />}
          </Box>
        )
      }),
    ])
    const brainTab = g ? (
      <Box flexDirection="column">
        {isWide ? (
          <Box flexDirection="row" columnGap={1} alignItems="flex-start">
            <Box flexDirection="column" width="50%" flexShrink={1}>{sphereCard}</Box>
            <Box flexDirection="column" width="50%" flexShrink={1}>{groupsCard}</Box>
          </Box>
        ) : [sphereCard, groupsCard]}
        <Box flexDirection="row" flexWrap="wrap" columnGap={3} paddingX={isNarrow ? 0 : 1}>
          {html !== '' && (
            <Button key="abrir-grafo" plain onPress={() => openFile($, html)}>
              <Text color="claude">↗ abrir o grafo completo</Text>
            </Button>
          )}
          <Button key="recarregar-grafo" plain onPress={() => loadGraph($)}><Text dimColor>↻ recarregar</Text></Button>
        </Box>
      </Box>
    ) : (
      panel('vazio-cerebro', <Text dimColor>{gErr || 'Lendo o grafo…'}</Text>)
    )

    if (isWidget) return <Box flexDirection="column">{header}</Box>
    const body = current === 'orca' ? await renderOrcaPane($, e) : current === 'skill' ? await renderGestor($, e) : current === 'cerebro' ? brainTab : current === 'alteracoes' ? changesTab : current === 'arquivos' ? filesTab : agentsTab
    return (
      <Box flexDirection="column" paddingX={isNarrow ? 0 : 1} paddingY={1} overflow="hidden">
        {tabBar}
        {current === 'orca' || current === 'skill' ? null : header}
        {body}
      </Box>
    )
  })
}
