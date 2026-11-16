import { expect, test } from 'claude-code/testing'

import { argvDe, cerca, impedimento, juntarSaida, lerGuardado, noEm, novoNo, paraGuardar, ultimasLinhas } from './modelo'
import type { Ferramentas, No } from '../types'

const F: Ferramentas = { codex: true, gemini: false, shell: 'bash' }
const no = (campos: Partial<No>): No => ({ ...novoNo('cmd', [], { px: 0, py: 0 }, 'a'), ...campos })

test('cerca bloqueia o perigoso e deixa passar o comum', async () => {
  for (const c of ['git push --force', 'git push origin main', 'rm -rf /', 'rm -rf ~', 'npm publish', 'vercel --prod', 'cat .env', 'codex --full-auto x', 'terraform apply']) {
    expect(cerca(c)).not.toBe(null)
  }
  for (const c of ['npm test', 'git status', 'cat .env.example', 'rm -rf node_modules', 'revise o diff e aponte bugs']) {
    expect(cerca(c)).toBe(null)
  }
})

test('argumentos por tipo de nó', async () => {
  expect(argvDe(no({ tipo: 'codex', texto: 'revise' }), F)).toEqual(['codex', 'exec', 'revise'])
  expect(argvDe(no({ tipo: 'gemini', texto: 'oi' }), F)).toEqual(['gemini', '-p', 'oi'])
  expect(argvDe(no({ tipo: 'cmd', texto: 'npm test' }), F)).toEqual(['bash', '-lc', 'npm test'])
  expect(argvDe(no({ tipo: 'cmd', texto: 'dir' }), { ...F, shell: 'cmd' })).toEqual(['cmd', '/d', '/s', '/c', 'dir'])
  expect(argvDe(no({ tipo: 'claude', texto: 'x' }), F)).toBe(null)
  expect(argvDe(no({ tipo: 'cmd', texto: '   ' }), F)).toBe(null)
})

test('impedimentos antes de rodar', async () => {
  expect(impedimento(no({ tipo: 'gemini', texto: 'x' }), F)).toContain('gemini não instalado')
  expect(impedimento(no({ tipo: 'cmd', texto: '' }), F)).toBe('escreva o comando')
  expect(impedimento(no({ tipo: 'nota' }), F)).toBe('nota não roda')
  expect(impedimento(no({ tipo: 'cmd', texto: 'ls', status: 'rodando' }), F)).toBe('já está rodando')
  expect(impedimento(no({ tipo: 'codex', texto: 'x' }), F)).toBe(null)
})

test('nó sob o ponteiro: o de cima ganha', async () => {
  const a = no({ id: 'a', x: 0, y: 0, w: 10, h: 5 })
  const b = no({ id: 'b', x: 5, y: 2, w: 10, h: 5 })
  expect(noEm([a, b], 6, 3)?.id).toBe('b')
  expect(noEm([a, b], 1, 1)?.id).toBe('a')
  expect(noEm([a, b], 40, 40)).toBe(undefined)
})

test('saída guarda só o fim e as linhas saem limpas', async () => {
  expect(juntarSaida('abc', 'def', 4)).toBe('cdef')
  expect(ultimasLinhas('\x1b[32mok\x1b[0m\n\nlinha muito comprida aqui\n', 2, 10)).toEqual(['ok', 'linha mui…'])
})

test('layout salvo: processo em andamento volta a parado; lixo é descartado', async () => {
  const guardado = paraGuardar([no({ id: 'x', status: 'rodando', agentId: 'ag1' })])
  expect(guardado[0]?.status).toBe('parado')
  expect(guardado[0]?.agentId).toBe(undefined)
  expect(lerGuardado([{ id: 'y', tipo: 'nota', x: 3, y: 4 }, { nada: 1 }, 'x']).length).toBe(1)
  expect(lerGuardado('não é lista')).toEqual([])
})

const PANE = {
  plugin: 'palco',
  component: 'Pane',
  requestId: 'palco',
  props: { title: 'palco', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('o painel cria um nó e mostra o editor, no terminal e no desktop', async ($, on) => {
  on('command.register', () => ({ value: { command: 'palco' } }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1000 }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/projeto', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const botao = await ui.find({ type: 'Button', label: /\+ nota/ })
    expect(botao).toBeTruthy()
    if (surface === 'terminal') {
      await ui.press({ key: 'add-nota' })
      const titulo = await ui.find({ type: 'Text', text: /nota 1/ })
      expect(titulo).toBeTruthy()
    }
    await ui.unmount()
  }
})
