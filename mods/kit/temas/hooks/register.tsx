// temas: troca a aparência do Claude Code (apps desktop e mobile) entre paletas próprias.
// /tema abre o seletor; /tema <nome> aplica; /tema padrao volta ao tema do app. A escolha fica salva. Sem escolha
// salva (uma instalação nova), entra o padrão do kit: as Dunas, o visual do mockup (cores, cena e vidro).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { ditherDunesNightSvg, ditherDunesSvg } from './dither-dunes'
import { makeColors } from './make-colors.js'
import { ORDEM, PALETAS } from './paletas.js'

const PANE = 'temas'
const CHAVE = 'tema'
const atual = atom({ plugin: 'temas', key: 'atual' } as const, null)

type Nome = keyof typeof PALETAS

// A cena é montada uma vez, na primeira vez que o app a pede.
let dunas: string | undefined
const cenaDunas = () => (dunas ??= cenaDiaENoite(ditherDunesNightSvg(), ditherDunesSvg()))

// Uma cena só que troca sozinha entre noite e dia pelo modo do app: as duas versões têm o mesmo desenho e mudam só as
// cores (nos atributos fill e color), então, no modo claro, uma regra de CSS troca cada cor da noite pela do dia.
export function cenaDiaENoite(noite: string, dia: string): string {
  const cores = (s: string) => s.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
  const de = cores(noite)
  const para = cores(dia)
  const pares = new Map<string, string>()
  de.forEach((c, i) => {
    const d = para[i]
    if (d !== undefined && d.toLowerCase() !== c.toLowerCase()) pares.set(c, d)
  })
  const regras = [...pares].map(([n, d]) => `[fill="${n}"]{fill:${d}}[color="${n}"]{color:${d}}`).join('')
  return noite.replace(/<svg\b[^>]*>/, abre => `${abre}<style>@media (prefers-color-scheme: light){${regras}}</style>`)
}

const ehNome = (x: unknown): x is Nome => typeof x === 'string' && x in PALETAS

async function aplicar($: EngineInterface, nome: Nome): Promise<string> {
  const p = PALETAS[nome]
  // Um tema com cena leva tudo junto, num set só: as cores, a cena atrás da conversa e o vidro dos painéis.
  const visual: ThemeSetArgs = {
    colors: makeColors(p.def).theme,
    ...(p.cena && { backdrop: { scene: p.cena, glass: p.vidro ?? {} } }),
    ...(p.esquema && { overrideColorScheme: p.esquema }),
  }
  const r = await $.theme.set(visual)
  await update($, atual, () => nome)
  await $.store.set(CHAVE, nome)
  return r.isDrawn ? `tema ${PALETAS[nome].nome} aplicado` : `tema ${PALETAS[nome].nome} salvo; esta tela não desenha temas (${r.reason})`
}

async function padrao($: EngineInterface): Promise<string> {
  await $.theme.clear()
  await update($, atual, () => null)
  await $.store.set(CHAVE, 'padrao') // lembra a escolha: sem isto o tema do kit voltaria na próxima sessão
  return 'voltou ao tema do app'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'tema', description: 'Troca o tema do Claude Code: /tema abre o seletor, /tema <nome> aplica, /tema padrao volta ao do app' })
    const salvo = await $.store.get(CHAVE)
    // Sem escolha salva, entra o tema do kit; quem rodou /tema padrao guardou 'padrao' e fica com o do app.
    if (ehNome(salvo)) await aplicar($, salvo)
    else if (salvo === undefined) await aplicar($, 'dunas')
    return started
  })

  on('command.run', { command: 'tema' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (!arg) {
      await $.ui.open({ id: PANE, title: 'temas' })
      return { text: `Temas: ${ORDEM.join(', ')}. Escolha no painel ou use /tema <nome>.` }
    }
    if (arg === 'padrao' || arg === 'padrão') return { text: await padrao($) }
    if (!ehNome(arg)) return { text: `Tema desconhecido: ${arg}. Opções: ${ORDEM.join(', ')}, padrao.` }
    return { text: await aplicar($, arg) }
  })

  // A cena das dunas, animada, atrás da conversa: só os apps desktop e mobile desenham (isInteractive deixa a animação
  // rodar; ela para quando o sistema pede menos movimento).
  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || e.props.scene !== 'dunas') return next(e)
    const { Svg } = $.ui.resolve(e)
    return <Svg isInteractive source={cenaDunas()} alt="Dunas de pontos sob um sol cor de brasa: de noite no modo escuro, de dia no claro" />
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const escolhido = await read($, atual)
    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>O tema vale nos apps desktop e mobile; o terminal mantém as cores dele.</Text>
        {ORDEM.map(nome => {
          const p = PALETAS[nome as Nome]
          const ativo = escolhido === nome
          return (
            <Box key={`t-${nome}`} flexDirection="column">
              <Button
                key={`b-${nome}`}
                label={`${ativo ? '● ' : '○ '}${p.nome}`}
                onPress={async () => {
                  $.ui.toast(await aplicar($, nome as Nome))
                }}
              />
              <Text dimColor>{p.descricao}</Text>
            </Box>
          )
        })}
        <Button
          key="padrao"
          label={escolhido === null ? '● Padrão do app' : '○ Padrão do app'}
          plain
          onPress={async () => {
            $.ui.toast(await padrao($))
          }}
        />
      </Box>
    )
  })
}
