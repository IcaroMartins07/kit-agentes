// Aba Terminais: os agentes do MCP Orca (claude, codex, gemini ou qualquer comando), cada um no seu terminal, sem
// precisar do Orca. Abas por terminal, a tela ao vivo e a caixa de mensagem, como na aba Orca. Tudo pelo comando
// `mcp-orca` (o `npm link` do kit põe no PATH). Atualiza enquanto a aba está aberta e para quando ela fecha.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { TermInfo } from '../types'
import { spriteFor, spriteSvg } from './orca'

const LINHAS = 40
const CLIS = ['claude', 'codex', 'gemini'] as const

export const terms = atom({ plugin: 'painel-agentes', key: 'terms' } as const, null, { shape: 'terms-1' })
const termsError = atom({ plugin: 'painel-agentes', key: 'termsError' } as const, '')
const termSel = atom({ plugin: 'painel-agentes', key: 'termSel' } as const, '')
const termTela = atom({ plugin: 'painel-agentes', key: 'termTela' } as const, null, { shape: 'term-tela-1' })

let poll: { cancel: () => void } | undefined
let tick = 0
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s)

// O argv vai direto para o processo, sem shell. --json vem antes do "--" quando há texto livre depois.
async function mcpOrca($: EngineInterface, args: string[]): Promise<unknown> {
  const r = await $.process.run(['mcp-orca', ...args], { timeoutMs: 15000 })
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `mcp-orca ${args[0]} saiu com ${r.exitCode}`)
  return JSON.parse(r.stdout) as unknown
}

async function loadTela($: EngineInterface): Promise<void> {
  const id = await read($, termSel)
  if (!id) return
  const v = (await mcpOrca($, ['ler', id, '--linhas', String(LINHAS), '--json']).catch(() => null)) as { id: string; estado: string; linhas: string[] } | null
  if (v) await update($, termTela, () => ({ id: v.id, estado: v.estado, linhas: v.linhas.slice(-LINHAS) }))
}

export async function loadTerms($: EngineInterface): Promise<void> {
  try {
    const { terminais } = (await mcpOrca($, ['listar', '--json'])) as { terminais: TermInfo[] }
    await update($, terms, () => terminais)
    await update($, termsError, () => '')
    // Sem escolha (ou ela sumiu): o terminal vivo aberto por último.
    const sel = await read($, termSel)
    if (!terminais.some(t => t.id === sel)) {
      const vivo = terminais.filter(t => t.estado === 'rodando').sort((a, b) => b.inicio - a.inicio)[0] ?? terminais[0]
      await update($, termSel, () => vivo?.id ?? '')
    }
    await loadTela($)
  } catch (x) {
    const msg = String((x as Error)?.message ?? x)
    await update($, termsError, () =>
      /not found|ENOENT|não é reconhecido|not recognized/i.test(msg)
        ? 'O comando mcp-orca não foi encontrado. Na pasta do kit, rode npm link (e npm install dentro de mcp-orca), ou o agents-mode.'
        : `Não consegui falar com o MCP Orca: ${clip(msg, 160)}`,
    )
  }
}

export async function startTermsPolling($: EngineInterface): Promise<void> {
  await loadTerms($)
  // A tela a cada 2 s; a lista a cada 6 s.
  if (!poll) poll = $.clock.every(2000, () => void (tick++ % 3 === 0 ? loadTerms($) : loadTela($)).catch(() => undefined))
}

export function stopTermsPolling(): void {
  poll?.cancel()
  poll = undefined
}

async function escolher($: EngineInterface, id: string): Promise<void> {
  await update($, termSel, () => id)
  await update($, termTela, () => null)
  await loadTela($)
}

export async function renderTerminais($: EngineInterface, e: Extract<RenderInput, { component: 'Pane' }>): Promise<RenderElement> {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button, Input } = ui
  const Svg = 'Svg' in ui && e.surface !== 'terminal' ? ui.Svg : undefined
  const lista = await read($, terms)
  const err = await read($, termsError)
  const sel = await read($, termSel)
  const tela = await read($, termTela)
  const cols = Math.max(20, e.props.bodyColumns)
  const isNarrow = cols < 40
  const width = Math.max(10, cols - 6)

  const vivos = (lista ?? []).filter(t => t.estado === 'rodando').length
  const abrir = async (cli: (typeof CLIS)[number]) => {
    const cwd = await $.session.cwd()
    await mcpOrca($, ['abrir', '--cli', cli, '--cwd', cwd, '--json'])
      .then(v => escolher($, (v as { id: string }).id), () => $.ui.toast(`Não consegui abrir o ${cli}.`))
    await loadTerms($)
  }
  const barra = (
    <Box key="term-barra" flexDirection="row" flexWrap="wrap" justifyContent="space-between" columnGap={2} paddingX={1} marginBottom={1}>
      <Box flexDirection="row" columnGap={2} alignItems="center">
        <Text bold size="heading" weight="semibold">Terminais</Text>
        {!isNarrow && lista && <Text dimColor size="footnote">{vivos} rodando</Text>}
      </Box>
      <Box flexDirection="row" columnGap={2}>
        {CLIS.map(cli => (
          <Button key={`term-abrir-${cli}`} plain onPress={() => abrir(cli)}><Text color="claude" size="footnote">+ {cli}</Text></Button>
        ))}
        <Button key="term-atualizar" plain onPress={() => loadTerms($)}><Text dimColor>↻</Text></Button>
      </Box>
    </Box>
  )
  const nota = (text: string, color?: string) => (
    <Box borderStyle="round" borderColor="claude" borderDimColor paddingX={2} paddingY={1}><Text color={color} dimColor={!color}>{text}</Text></Box>
  )
  const frame = (corpo: RenderElement | null) => <Box flexDirection="column" overflow="hidden">{barra}{corpo}</Box>
  if (err) return frame(nota(err, 'error'))
  if (!lista) return frame(nota('Conectando ao MCP Orca…'))
  if (lista.length === 0) return frame(nota('Nenhum terminal ainda. Abra um agente com + claude, + codex ou + gemini (na pasta desta sessão).'))

  const atual = lista.find(t => t.id === sel)
  const abas = (
    <Box key="term-abas" flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
      {lista.map(t => {
        const on = t.id === sel
        const vivo = t.estado === 'rodando'
        return (
          <Box key={`term-aba-${t.id}`} flexDirection="row" alignItems="center" columnGap={1} borderStyle="round" borderColor={vivo ? 'claude' : 'subtle'} borderDimColor={!on} paddingX={1}>
            {Svg && <Svg source={spriteSvg(spriteFor(t.cli ?? t.nome), 1)} alt={t.cli ?? 'terminal'} width={9} height={9} />}
            <Button key={`term-tab-${t.id}`} plain onPress={() => escolher($, t.id)}>
              <Text color={on ? 'claude' : undefined} dimColor={!on || !vivo} bold={on}>{clip(t.nome, isNarrow ? 12 : 20)}</Text>
            </Button>
          </Box>
        )
      })}
    </Box>
  )

  // A tela: sem fundo próprio (o vidro aparece), monoespaçada, como o terminal mostra.
  const linhas = tela && tela.id === sel ? tela.linhas : []
  const telaView = (
    <Box key="term-tela" flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1} paddingY={1} overflow="hidden">
      <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
        <Text color="inactive" size="footnote">{atual ? clip([atual.nome, atual.cli, atual.estado].filter(Boolean).join(' · '), width - 12) : 'terminal'}</Text>
        {atual?.estado === 'rodando' && (
          <Button key={`term-fechar-${atual.id}`} plain onPress={() => mcpOrca($, ['fechar', atual.id, '--json']).then(() => loadTerms($), () => $.ui.toast('Não consegui fechar.'))}>
            <Text color="error" size="footnote">✕ fechar</Text>
          </Button>
        )}
      </Box>
      {!atual ? <Text color="inactive">Escolha um terminal acima.</Text>
        : linhas.length === 0 ? <Text color="inactive">Lendo o terminal…</Text>
          : linhas.map((l, i) => <Text key={`term-l-${i}`} mono color="text">{l === '' ? ' ' : clip(l, width)}</Text>)}
    </Box>
  )

  // A caixa de mensagem: só envia quando a pessoa aperta Enter; o texto vai depois de "--", como argumento só.
  const caixa = atual?.estado === 'rodando' ? (
    <Input
      key={`term-msg-${atual.id}`}
      label={`Mensagem para ${clip(atual.nome, 28)}`}
      placeholder="Escreva e aperte Enter"
      submitLabel="Enviar"
      onSubmit={async text => {
        if (!text.trim()) return
        await mcpOrca($, ['enviar', atual.id, '--json', '--', text])
          .then(() => $.ui.toast(`Mensagem enviada para ${atual.nome}`), () => $.ui.toast('Não consegui enviar a mensagem.'))
        await loadTela($)
      }}
    />
  ) : null

  return frame(
    <Box flexDirection="column" rowGap={1} paddingX={isNarrow ? 0 : 1}>
      {abas}
      {telaView}
      {caixa}
    </Box>,
  )
}
