import { expect, test } from 'claude-code/testing'

import { makeColors } from './make-colors.js'
import { ORDEM, PALETAS } from './paletas.js'

test('toda paleta vira um tema que o desktop pinta', async () => {
  expect(ORDEM.length).toBe(5)
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
