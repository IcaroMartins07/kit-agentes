// O Orca dentro do Claude, com a cara do Orca: à esquerda os worktrees, à direita as abas de terminal do worktree
// escolhido e a tela do terminal ao vivo, com a caixa de mensagem embaixo. Tudo pelo comando `orca` (o mesmo que o
// app do Orca usa por baixo). Atualiza enquanto o painel está aberto e para quando ele fecha.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderChildren, RenderElement, RenderInput } from 'claude-code'

import type { OrcaAgent, OrcaTerminal, OrcaView, OrcaWorktree } from '../types'

export const ORCA_PANE = 'orca'
export const ORCA_TITLE = 'Orca'
// Só a logo (Svg) usa hex; o resto usa chaves do tema e não pinta fundo, para seguir o tema e deixar o vidro aparecer.
const ORANGE = '#e8742c'
const SCREEN_ROWS = 40

export const orca = atom({ plugin: 'painel-agentes', key: 'orca' } as const, null, { shape: 'orca-2' })
export const orcaError = atom({ plugin: 'painel-agentes', key: 'orcaError' } as const, '')
export const orcaLogo = atom({ plugin: 'painel-agentes', key: 'orcaLogo' } as const, '')
const orcaWide = atom({ plugin: 'painel-agentes', key: 'orcaWide' } as const, false)
const orcaSel = atom({ plugin: 'painel-agentes', key: 'orcaSel' } as const, '')
const orcaTerm = atom({ plugin: 'painel-agentes', key: 'orcaTerm' } as const, '')
const orcaScreen = atom({ plugin: 'painel-agentes', key: 'orcaScreen' } as const, null, { shape: 'orca-screen-1' })

let poll: { cancel: () => void } | undefined
let tick = 0

type Json = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : 0)
const arr = (v: unknown) => (Array.isArray(v) ? (v as Json[]) : [])
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s)
// O preview do terminal vem com molduras e linhas vazias: ficam as últimas linhas com texto.
const lastLines = (s: string, n: number) => s.split('\n').map(l => l.replace(/[┃│]/g, '').trimEnd()).filter(l => l.trim() && !/^[─━-]+$/.test(l.trim())).slice(-n).join('\n')

// Junta `orca worktree ps` e `orca terminal list`: cada worktree com seus agentes e seus terminais;
// o agente acha o terminal dele pelo paneKey (aba:folha).
export function parseOrca(ps: unknown, terms: unknown, at: number): OrcaView {
  const terminals = arr(((terms as Json)?.result as Json | undefined)?.terminals)
  const handleOf = new Map(terminals.map(t => [`${str(t.tabId)}:${str(t.leafId)}`, str(t.handle)]))
  const worktrees: OrcaWorktree[] = arr(((ps as Json)?.result as Json | undefined)?.worktrees)
    .filter(w => w.isArchived !== true)
    .map(w => {
      const agents = arr(w.agents).map((a): OrcaAgent => ({
        key: str(a.paneKey) || str(a.orcaSessionId),
        type: str(a.agentType) || 'agente',
        state: str(a.state) || str((a.mainAgent as Json | undefined)?.state),
        name: str(a.displayName) || str(a.conversationName) || str(a.taskTitle) || str(a.agentType),
        doing: str(a.toolName) ? `Usando ${str(a.toolName)}` : clip(str(a.lastAssistantMessage).replace(/\s+/g, ' '), 120) || clip(str(a.prompt).replace(/\s+/g, ' '), 120),
        terminal: handleOf.get(str(a.paneKey)) ?? '',
      }))
      const agentOf = new Map(agents.map(a => [a.terminal, a]))
      const terms: OrcaTerminal[] = terminals
        .filter(t => str(t.worktreeId) === str(w.worktreeId) && str(t.handle))
        .map(t => ({
          handle: str(t.handle),
          title: str(t.title),
          agentType: str(t.agentIdentity) || agentOf.get(str(t.handle))?.type || '',
          agentName: agentOf.get(str(t.handle))?.name ?? '',
          lastOutputAt: num(t.lastOutputAt),
        }))
      return {
        id: str(w.worktreeId),
        name: str(w.displayName) || str(w.repo) || str(w.path).split('/').pop() || 'worktree',
        repo: str(w.repo),
        path: str(w.path),
        branch: str(w.branch),
        status: str(w.status),
        terminals: num(w.liveTerminalCount),
        preview: lastLines(str(w.preview), 6),
        agents,
        terms,
      }
    })
  return { at, worktrees }
}

// Nome curto de uma aba de terminal: o agente que roda nela, ou o comando do título sem o caminho do shell.
export function tabLabel(t: OrcaTerminal): string {
  if (t.agentName) return t.agentName
  const cmd = t.title.replace(/^.*?\.exe\s*-\s*/i, '').replace(/^.*[\\/]/, '').replace(/\s+".*$/, '').trim()
  return cmd || t.agentType || 'terminal'
}

async function runOrca($: EngineInterface, args: string[]): Promise<unknown> {
  const r = await $.process.run(['orca', ...args, '--json'], { timeoutMs: 10000 })
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `orca ${args.join(' ')} saiu com ${r.exitCode}`)
  return JSON.parse(r.stdout) as unknown
}

// A tela do terminal escolhido, como ele aparece no Orca (--screen: o quadro desenhado, não o histórico).
async function loadScreen($: EngineInterface): Promise<void> {
  const handle = await read($, orcaTerm)
  if (!handle) return
  const out = (await runOrca($, ['terminal', 'read', '--terminal', handle, '--screen', '--limit', String(SCREEN_ROWS)]).catch(() => null)) as Json | null
  const t = (out?.result as Json | undefined)?.terminal as Json | undefined
  if (!t) return
  const lines = (Array.isArray(t.tail) ? (t.tail as unknown[]).map(str) : []).map(l => l.replace(/\s+$/, ''))
  while (lines.length && !lines[lines.length - 1]) lines.pop()
  await update($, orcaScreen, () => ({ handle, status: str(t.status), lines: lines.slice(-SCREEN_ROWS) }))
}

export async function loadOrca($: EngineInterface): Promise<void> {
  try {
    const [ps, terms] = await Promise.all([runOrca($, ['worktree', 'ps']), runOrca($, ['terminal', 'list'])])
    const view = parseOrca(ps, terms, await $.clock.now())
    await update($, orca, () => view)
    await update($, orcaError, () => '')
    // Sem escolha (ou a escolha sumiu): o primeiro worktree ativo e o terminal com saída mais recente.
    const sel = await read($, orcaSel)
    const wt = view.worktrees.find(w => w.id === sel) ?? view.worktrees.find(w => w.status === 'active') ?? view.worktrees[0]
    if (wt && wt.id !== sel) await update($, orcaSel, () => wt.id)
    const term = await read($, orcaTerm)
    if (wt && !wt.terms.some(t => t.handle === term)) {
      const latest = wt.terms.slice().sort((a, b) => b.lastOutputAt - a.lastOutputAt)[0]
      await update($, orcaTerm, () => latest?.handle ?? '')
    }
    await loadScreen($)
  } catch (x) {
    const msg = String((x as Error)?.message ?? x)
    await update($, orcaError, () => (/not found|ENOENT|não é reconhecido/i.test(msg) ? 'O comando orca não foi encontrado. Instale ou abra o Orca e tente de novo.' : `Não consegui falar com o Orca: ${clip(msg, 160)}`))
  }
}

export async function loadOrcaLogo($: EngineInterface): Promise<void> {
  const svg = await $.fs.read(`${$.plugin.root}/assets/orca-logo.svg`).catch(() => '')
  await update($, orcaLogo, () => svg)
}
// A logo é branca; aqui ganha a cor pedida (laranja do kit), para aparecer no tema claro e no escuro.
export const tintLogo = (svg: string, color: string) => svg.replace(/fill:#ffffff/gi, `fill:${color}`).replace(/<\?xml[^>]*>|<!--[\s\S]*?-->/g, '')

export async function openOrcaPane($: EngineInterface, isWide?: boolean): Promise<void> {
  if (isWide !== undefined) await update($, orcaWide, () => isWide)
  const wide = await read($, orcaWide)
  // Largo: o máximo que o Claude dá a um painel (~45% da janela); lateral: a largura normal.
  await $.ui.open({ id: ORCA_PANE, title: ORCA_TITLE, columns: wide ? 400 : 60 })
  await startOrcaPolling($)
}

// Lê o Orca agora e passa a acompanhar (usado também pela aba Orca do painel de agentes).
export async function startOrcaPolling($: EngineInterface): Promise<void> {
  await loadOrca($)
  // A tela do terminal a cada 2 s; worktrees e agentes a cada 6 s.
  if (!poll) poll = $.clock.every(2000, () => void (tick++ % 3 === 0 ? loadOrca($) : loadScreen($)).catch(() => undefined))
}

export function stopOrcaPolling(): void {
  poll?.cancel()
  poll = undefined
}

const STATE: Record<string, [string, string, string]> = {
  working: ['●', 'claude', 'Trabalhando'],
  running: ['●', 'claude', 'Trabalhando'],
  busy: ['●', 'claude', 'Trabalhando'],
  thinking: ['●', 'claude', 'Pensando'],
  waiting: ['○', 'warning', 'Esperando você'],
  blocked: ['○', 'warning', 'Esperando você'],
  'needs-input': ['○', 'warning', 'Esperando você'],
  idle: ['○', 'subtle', 'Parado'],
  done: ['✓', 'success', 'Concluído'],
  error: ['✕', 'error', 'Erro'],
  failed: ['✕', 'error', 'Erro'],
}
const stateOf = (s: string) => STATE[s] ?? ['○', 'subtle', s || 'sem estado']
const isBusy = (s: string) => ['Trabalhando', 'Pensando'].includes(stateOf(s)[2])

// Pixel art por IA, no mesmo estilo dos agentes do painel.
const PAL: Record<string, string> = { o: '#e8742c', d: '#3d3929', l: '#e8e0d0', w: '#ffffff', b: '#5b8def', y: '#e8b84a', p: '#9b6dd6' }
const SPRITES: Record<string, string[]> = {
  claude: ['....o....', '.o..o..o.', '..o.o.o..', '...ooo...', 'ooooooooo', '...ooo...', '..o.o.o..', '.o..o..o.', '....o....'],
  codex: ['ddddddddd', 'dbbbbbbbd', 'dbwbbbbbd', 'dbbwbbbbd', 'dbwbbwwbd', 'dbbbbbbbd', 'ddddddddd', '...ddd...', '..ddddd..'],
  antigravity: ['....p....', '...ppp...', '..ppbpp..', 'yypbbbpyy', '.yppbppy.', '..ppppp..', '...ppp...', '....p....', '.........'],
  agente: ['....o....', '....d....', '.ddddddd.', '.dllllld.', '.dlblbld.', '.dllllld.', '.dlooold.', '.ddddddd.', '..d...d..'],
}
const spriteFor = (type: string) => {
  const t = type.toLowerCase()
  return SPRITES[t.includes('claude') ? 'claude' : t.includes('codex') ? 'codex' : t.includes('antigravity') || t === 'agy' ? 'antigravity' : 'agente']!
}
const spriteSvg = (rows: string[], px: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${9 * px}" height="${9 * px}" shape-rendering="crispEdges">${rows
    .flatMap((row, y) => [...row].map((ch, x) => (PAL[ch] ? `<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}" fill="${PAL[ch]}"/>` : '')))
    .join('')}</svg>`

async function showTerminal($: EngineInterface, handle: string): Promise<void> {
  await update($, orcaTerm, () => handle)
  await update($, orcaScreen, () => null)
  await loadScreen($)
}

async function pickWorktree($: EngineInterface, view: OrcaView, id: string): Promise<void> {
  await update($, orcaSel, () => id)
  const latest = view.worktrees.find(x => x.id === id)?.terms.slice().sort((a, b) => b.lastOutputAt - a.lastOutputAt)[0]
  await showTerminal($, latest?.handle ?? '')
}

export async function renderOrcaPane($: EngineInterface, e: Extract<RenderInput, { component: 'Pane' }>): Promise<RenderElement> {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button, Input } = ui
  const Svg = 'Svg' in ui && e.surface !== 'terminal' ? ui.Svg : undefined
  const view = await read($, orca)
  const err = await read($, orcaError)
  const logo = await read($, orcaLogo)
  const wide = await read($, orcaWide)
  const sel = await read($, orcaSel)
  const term = await read($, orcaTerm)
  const screen = await read($, orcaScreen)
  const cols = Math.max(20, e.props.bodyColumns)
  const isNarrow = cols < 40
  // Com espaço, a lista de worktrees vira uma coluna à esquerda, como no Orca; senão, uma fila no topo.
  const hasSidebar = cols >= 72
  const sideCols = hasSidebar ? Math.min(28, Math.floor(cols * 0.3)) : 0
  const mainCols = cols - sideCols - (hasSidebar ? 3 : 0)

  const agents = view?.worktrees.flatMap(w => w.agents) ?? []
  const working = agents.filter(a => isBusy(a.state)).length
  const titleBar = (
    <Box key="orca-barra" flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={2} paddingX={1} marginBottom={1}>
      <Box flexDirection="row" columnGap={2} alignItems="center" flexShrink={1}>
        {Svg && logo ? <Svg source={tintLogo(logo, ORANGE)} alt="Orca" width={30} height={19} /> : <Text color="claude" bold>◆</Text>}
        <Text bold size="heading" weight="semibold">Orca</Text>
        {!isNarrow && view && <Text dimColor size="footnote">{agents.length} agente{agents.length === 1 ? '' : 's'}{working ? `, ${working} trabalhando` : ''}</Text>}
      </Box>
      <Box flexDirection="row" columnGap={2} flexShrink={0}>
        <Button key="orca-largura" plain onPress={() => openOrcaPane($, !wide)}>
          <Text color="claude">{wide ? '⤡' : '⤢'}{isNarrow ? '' : wide ? ' lateral' : ' tela cheia'}</Text>
        </Button>
        <Button key="orca-atualizar" plain onPress={() => loadOrca($)}><Text dimColor>↻</Text></Button>
      </Box>
    </Box>
  )
  const frame = (children: RenderChildren) => <Box flexDirection="column" paddingY={1} overflow="hidden">{titleBar}{children}</Box>
  const note = (text: string, color?: string) => (
    <Box borderStyle="round" borderColor="claude" borderDimColor paddingX={2} paddingY={1}><Text color={color} dimColor={!color}>{text}</Text></Box>
  )
  if (err) return frame(note(err, 'error'))
  if (!view) return frame(note('Conectando ao Orca…'))
  if (view.worktrees.length === 0) return frame(note('Nenhum worktree no Orca ainda. Crie um no Orca e ele aparece aqui.'))

  const wt = view.worktrees.find(w => w.id === sel) ?? view.worktrees[0]!
  const worktreeDot = (w: OrcaWorktree) => {
    const busy = w.agents.some(a => isBusy(a.state))
    return <Text color={busy ? 'claude' : w.status === 'active' ? 'success' : 'subtle'}>{w.status === 'active' || busy ? '●' : '○'}</Text>
  }

  // Lista de worktrees: coluna à esquerda (com espaço) ou fila no topo.
  const sorted = view.worktrees.slice().sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))
  const sidebar = hasSidebar ? (
    <Box key="orca-lateral" flexDirection="column" width={sideCols} flexShrink={0} borderStyle="round" borderColor="claude" borderDimColor paddingX={1} paddingY={1} rowGap={1}>
      <Text dimColor size="footnote">Worktrees</Text>
      {sorted.map(w => (
        <Box key={`orca-wt-${w.id}`} flexDirection="column" paddingX={1}>
          <Button key={`orca-sel-${w.id}`} plain onPress={() => pickWorktree($, view, w.id)}>
            {worktreeDot(w)} <Text bold={w.id === wt.id} color={w.id === wt.id ? 'claude' : undefined}>{clip(w.name, sideCols - 6)}</Text>
          </Button>
          <Text dimColor size="caption">{clip([w.branch, `${w.terms.length} terminal${w.terms.length === 1 ? '' : 'is'}`].filter(Boolean).join(' · '), sideCols - 4)}</Text>
        </Box>
      ))}
    </Box>
  ) : (
    <Box key="orca-fila" flexDirection="row" flexWrap="wrap" columnGap={2} marginBottom={1}>
      {sorted.map(w => (
        <Button key={`orca-sel-${w.id}`} plain onPress={() => pickWorktree($, view, w.id)}>
          {worktreeDot(w)} <Text bold={w.id === wt.id} color={w.id === wt.id ? 'claude' : 'subtle'} underline={w.id === wt.id}>{clip(w.name, 18)}</Text>
        </Button>
      ))}
    </Box>
  )

  // Abas de terminal do worktree, como no Orca: o agente que roda em cada uma, com o ícone da IA.
  const active = wt.terms.find(t => t.handle === term)
  const tabs = (
    <Box key="orca-abas" flexDirection="row" flexWrap="wrap" columnGap={1}>
      {wt.terms.length === 0 && <Text dimColor size="footnote">Nenhum terminal aberto neste worktree.</Text>}
      {wt.terms.map(t => {
        const on = t.handle === term
        return (
          <Box key={`orca-aba-${t.handle}`} flexDirection="row" alignItems="center" columnGap={1} borderStyle="round" borderColor="claude" borderDimColor={!on} paddingX={1}>
            {Svg && <Svg source={spriteSvg(spriteFor(t.agentType), 1)} alt={t.agentType || 'terminal'} width={9} height={9} />}
            <Button key={`orca-tab-${t.handle}`} plain onPress={() => showTerminal($, t.handle)}>
              <Text color={on ? 'claude' : undefined} dimColor={!on} bold={on}>{clip(tabLabel(t), isNarrow ? 12 : 20)}</Text>
            </Button>
          </Box>
        )
      })}
    </Box>
  )

  // A tela do terminal: sem fundo próprio (o vidro aparece), fonte monoespaçada, as últimas linhas como o Orca mostra.
  const agent = wt.agents.find(a => a.terminal === term)
  const shown = screen && screen.handle === term ? screen.lines : []
  const width = Math.max(10, mainCols - 4)
  const terminalView = (
    <Box key="orca-tela" flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1} paddingY={1} overflow="hidden">
      <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
        <Text color="inactive" size="footnote">{active ? clip(`${tabLabel(active)}${agent ? ` · ${stateOf(agent.state)[2]}` : ''}`, width - 14) : 'terminal'}</Text>
        {active && (
          <Button key="orca-ir" plain onPress={() => runOrca($, ['terminal', 'switch', '--terminal', active.handle]).catch(() => $.ui.toast('Não consegui abrir esse terminal no Orca.'))}>
            <Text color="claude" size="footnote">↗ no Orca</Text>
          </Button>
        )}
      </Box>
      {!active ? <Text color="inactive">Escolha um terminal acima.</Text>
        : shown.length === 0 ? <Text color="inactive">Lendo o terminal…</Text>
          : shown.map((l, i) => <Text key={`orca-l-${i}`} mono color="text">{l === '' ? ' ' : clip(l, width)}</Text>)}
    </Box>
  )

  // A caixa de mensagem, embaixo do terminal, como o prompt do Orca. Só envia quando a pessoa aperta Enter.
  const composer = active ? (
    <Input
      key={`orca-msg-${active.handle}`}
      label={`Mensagem para ${clip(tabLabel(active), 28)}`}
      placeholder="Escreva e aperte Enter"
      submitLabel="Enviar"
      onSubmit={async text => {
        if (!text.trim()) return
        await runOrca($, ['terminal', 'send', '--terminal', active.handle, '--text', text, '--enter'])
          .then(() => $.ui.toast(`Mensagem enviada para ${tabLabel(active)}`), () => $.ui.toast('Não consegui enviar a mensagem.'))
        await loadScreen($)
      }}
    />
  ) : null

  // Os agentes do worktree numa fila, com estado; clicar leva ao terminal do agente.
  const agentStrip = wt.agents.length ? (
    <Box key="orca-agentes" flexDirection="row" flexWrap="wrap" columnGap={2}>
      {wt.agents.map(a => {
        const [dot, color, label] = stateOf(a.state)
        return (
          <Button key={`orca-ag-${a.key}`} plain onPress={() => (a.terminal ? showTerminal($, a.terminal) : undefined)}>
            <Text color={color}>{dot}</Text> <Text size="footnote">{clip(a.name, 18)}</Text>{isNarrow ? '' : <Text dimColor size="footnote"> {label}</Text>}
          </Button>
        )
      })}
    </Box>
  ) : null

  const main = (
    <Box key="orca-principal" flexDirection="column" flexGrow={1} flexShrink={1} rowGap={1}>
      <Box flexDirection="column">
        <Text bold>{clip(wt.name, mainCols - 4)}</Text>
        <Text dimColor size="footnote">{clip([wt.repo !== wt.name ? wt.repo : '', wt.branch, wt.path].filter(Boolean).join(' · '), mainCols - 4)}</Text>
      </Box>
      {agentStrip}
      {tabs}
      {terminalView}
      {composer}
    </Box>
  )

  return frame(
    hasSidebar ? (
      <Box flexDirection="row" columnGap={1} alignItems="flex-start" paddingX={1}>{sidebar}{main}</Box>
    ) : (
      <Box flexDirection="column" paddingX={isNarrow ? 0 : 1}>{sidebar}{main}</Box>
    ),
  )
}
