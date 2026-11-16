// temas: troca a aparência do Claude Code (apps desktop e mobile) entre paletas próprias.
// /tema abre o seletor; /tema <nome> aplica; /tema padrao volta ao tema do app. A escolha fica salva.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { ORDEM, PALETAS } from './paletas.js'

const PANE = 'temas'
const CHAVE = 'tema'
const atual = atom({ plugin: 'temas', key: 'atual' } as const, null)

type Nome = keyof typeof PALETAS

const ehNome = (x: unknown): x is Nome => typeof x === 'string' && x in PALETAS

async function aplicar($: EngineInterface, nome: Nome): Promise<string> {
  const { theme } = makeColors(PALETAS[nome].def)
  const visual: ThemeSetArgs = { colors: theme }
  const r = await $.theme.set(visual)
  await update($, atual, () => nome)
  await $.store.set(CHAVE, nome)
  return r.isDrawn ? `tema ${PALETAS[nome].nome} aplicado` : `tema ${PALETAS[nome].nome} salvo; esta tela não desenha temas (${r.reason})`
}

async function padrao($: EngineInterface): Promise<string> {
  await $.theme.clear()
  await update($, atual, () => null)
  await $.store.delete(CHAVE)
  return 'voltou ao tema do app'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'tema', description: 'Troca o tema do Claude Code: /tema abre o seletor, /tema <nome> aplica, /tema padrao volta ao do app' })
    const salvo = await $.store.get(CHAVE)
    if (ehNome(salvo)) await aplicar($, salvo)
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
