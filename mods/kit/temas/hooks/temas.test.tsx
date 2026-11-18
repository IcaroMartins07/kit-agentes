import { expect, test } from 'claude-code/testing'

import { ditherDunesNightSvg, ditherDunesSvg } from './dither-dunes'
import { cenaDiaENoite } from './register'
import { makeColors } from './make-colors.js'
import { ORDEM, PALETAS } from './paletas.js'

test('toda paleta vira um tema que o desktop pinta', async () => {
  expect(ORDEM.length).toBe(7)
  for (const nome of ORDEM) {
    const { theme, problems } = makeColors(PALETAS[nome].def)
    expect(Object.keys(theme).length > 0).toBe(true)
    expect(problems.filter(l => l.startsWith("Desktop won't paint"))).toEqual([])
  }
})

const PANE = {
  plugin: 'temas',
  component: 'Pane',
  requestId: 'temas',
  props: { title: 'temas', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('o seletor aplica, salva e volta ao padrão, no terminal e no desktop', async ($, on) => {
  const salvos: unknown[] = []
  let limpou = 0
  on('command.register', () => ({ value: { command: 'tema' } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', (_, e) => {
    salvos.push((e as { value: unknown }).value)
    return { value: undefined }
  })
  on('store.delete', () => ({ value: undefined }))
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 't' } }))
  on('ui.toast', () => ({ value: undefined }))
  on('theme.clear', () => {
    limpou++
    return { value: { isDrawn: true, requestId: 't' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'b-cafe' })
    expect(salvos.at(-1)).toBe('cafe')
    expect(String((await ui.find({ type: 'Button', key: 'b-cafe' }))?.props.label)).toContain('● Café')
    await ui.press({ key: 'padrao' })
    await ui.unmount()
  }
  expect(limpou).toBe(2)
})

test('instalação nova: entram as Dunas, o visual do mockup: cores, cena e vidro com blur pequeno num set só', async ($, on) => {
  const sets: Array<Record<string, unknown>> = []
  const salvos: unknown[] = []
  on('command.register', () => ({ value: { command: 'tema' } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', (_, e) => {
    salvos.push((e as { value: unknown }).value)
    return { value: undefined }
  })
  on('theme.set', (_, e) => {
    sets.push(e as Record<string, unknown>)
    return { value: { isDrawn: true, requestId: 't' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  expect(salvos).toEqual(['dunas'])
  // Sem tint: o vidro toma a cor do painel de cada modo. Sem modo forçado: vale o claro e o escuro.
  expect(sets[0]?.backdrop).toEqual({ scene: 'dunas', glass: { blur: 0, opacity: 0.55 } })
  expect(sets[0]?.overrideColorScheme).toBeUndefined()
  expect(Object.keys(sets[0]?.colors as object).length > 0).toBe(true)

  // O app desenha a cena animada atrás da conversa; outra cena fica de fora.
  const fundo = { plugin: 'temas', component: 'Backdrop', requestId: 'b', props: { scene: 'dunas', plugin: 'temas', glass: { blur: 0, opacity: 0.55 } } } as const
  const ui = await $.ui.mount({ ...fundo, surface: 'desktop' } as never)
  const svg = await ui.find({ type: 'Svg' })
  // A cena é a da noite, com as cores do dia no modo claro.
  const cena = String(svg?.props.source)
  expect(cena).toBe(cenaDiaENoite(ditherDunesNightSvg(), ditherDunesSvg()))
  expect(cena).toContain('@media (prefers-color-scheme: light)')
  expect(cena).toContain('[fill="#231d17"]{fill:#ece2cd}') // o papel da noite vira o papel do dia
  expect(svg?.props.isInteractive).toBe(true)
  expect(String(svg?.props.source).length).toBeLessThan(131072)
  await ui.unmount()
  const outra = await $.ui.mount({ ...fundo, surface: 'desktop', props: { ...fundo.props, scene: 'lagoa' } } as never)
  expect(await outra.find({ type: 'Svg' })).toBeUndefined()
  await outra.unmount()
})
