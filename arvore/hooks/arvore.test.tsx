import { expect, test } from 'claude-code/testing'

import { FORA, ancestrais, filtrarLista, linhasArvore, linhasTocados, marca, relativo, tocar } from './modelo'

test('caminho relativo: Windows sem diferença de caixa, Unix exato, fora do projeto marcado', async () => {
  expect(relativo('C:\\Proj\\app', 'c:/proj/app/src/a.ts')).toBe('src/a.ts')
  expect(relativo('C:/Proj/app', 'C:\\Proj\\app\\README.md')).toBe('README.md')
  expect(relativo('/home/x/app', '/home/x/app/lib/b.py')).toBe('lib/b.py')
  expect(relativo('/home/x/app', 'src/c.ts')).toBe('src/c.ts')
  expect(relativo('/home/x/app', '/etc/hosts')).toBe(`${FORA}//etc/hosts`)
  expect(relativo('/home/x/app', '/home/x/app')).toBe('')
  expect(relativo('/home/x/app', '/home/x/application/z')).toBe(`${FORA}//home/x/application/z`)
})

test('ancestrais e toques acumulados', async () => {
  expect(ancestrais('a/b/c.ts')).toEqual(['a', 'a/b'])
  const t = tocar(tocar(undefined, 'lido', 1, 'principal'), 'editado', 2, 'ag1')
  expect(t).toEqual({ lido: 1, editado: 1, buscado: 0, em: 2, por: 'ag1' })
  expect(marca(t)).toBe('✎ ◉')
  expect(marca(tocar(t, 'lido', 3, 'x'))).toBe('✎ ◉2')
})

test('modo tocados: só o caminho até os arquivos tocados, pastas primeiro', async () => {
  const toque = tocar(undefined, 'lido', 1, 'principal')
  const linhas = linhasTocados({ 'src/b.ts': toque, 'src/ui/a.tsx': toque, 'README.md': toque })
  expect(linhas.map(l => `${l.nivel}:${l.nome}`)).toEqual(['0:src', '1:ui', '2:a.tsx', '1:b.ts', '0:README.md'])
})

test('modo árvore: abre o que o usuário abriu e o que tem toque dentro', async () => {
  const listas = {
    '': [{ nome: 'src', pasta: true }, { nome: 'docs', pasta: true }, { nome: 'package.json', pasta: false }],
    src: [{ nome: 'a.ts', pasta: false }],
    docs: [{ nome: 'x.md', pasta: false }],
  }
  const fechado = linhasArvore(listas, [], {})
  expect(fechado.map(l => l.nome)).toEqual(['docs', 'src', 'package.json'])
  const comToque = linhasArvore(listas, [], { 'src/a.ts': tocar(undefined, 'editado', 1, 'principal') })
  expect(comToque.map(l => l.nome)).toEqual(['docs', 'src', 'a.ts', 'package.json'])
  expect(linhasArvore(listas, ['docs'], {}).map(l => l.nome)).toEqual(['docs', 'x.md', 'src', 'package.json'])
})

test('listagem sem node_modules nem .git', async () => {
  const r = filtrarLista([
    { name: 'node_modules', kind: 'dir' },
    { name: '.git', kind: 'dir' },
    { name: 'src', kind: 'dir' },
    { name: 'a.ts', kind: 'file' },
    { name: 'link', kind: 'other' },
  ])
  expect(r).toEqual([{ nome: 'src', pasta: true }, { nome: 'a.ts', pasta: false }])
})

const PANE = {
  plugin: 'arvore',
  component: 'Pane',
  requestId: 'arvore',
  props: { title: 'arquivos', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('o painel marca em tempo real o que o Claude leu e editou', async ($, on) => {
  on('command.register', () => ({ value: { command: 'arvore' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: 5 }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/projeto', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/projeto/src/a.ts' })
  await $.tool.call({ tool: 'Edit', file_path: '/projeto/src/b.ts', old_string: 'x', new_string: 'y' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /1 editados · ◉ 1 lidos/ }))?.text).toContain('agora: src/b.ts')
    expect(await ui.find({ type: 'Text', text: /a\.ts/ })).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /◀ agora/ }))?.text).toContain('✎')
    await ui.unmount()
  }
})

test('chamada negada ou com erro não vira toque', async ($, on) => {
  on('command.register', () => ({ value: { command: 'arvore' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: 5 }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {}, isError: true }))
  await $.session.start({ cwd: '/projeto', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/projeto/nao-existe.ts' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Nada tocado ainda/ })).toBeTruthy()
  await ui.unmount()
})
