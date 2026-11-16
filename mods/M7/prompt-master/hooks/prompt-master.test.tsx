import { expect, test } from 'claude-code/testing'

import { deveReescrever, limpar, modeloDe } from './modelo'

const composer = { kind: 'composer' }
const USO = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

test('automático só reescreve o que a pessoa digitou, sem comando e não curtinho', async () => {
  expect(deveReescrever({ text: 'cria um endpoint de login com testes', origin: composer })).toBe(true)
  expect(deveReescrever({ text: 'oi', origin: composer })).toBe(false)
  expect(deveReescrever({ text: '/deus cria um endpoint de login', origin: composer })).toBe(false)
  expect(deveReescrever({ text: 'cria um endpoint de login com testes', origin: { kind: 'sdk' } })).toBe(false)
  expect(deveReescrever({ text: 'cria um endpoint de login com testes', origin: composer, command: { name: 'x' } })).toBe(false)
})

test('limpa o que o modelo põe em volta', async () => {
  expect(limpar('```\nFaça X\n```')).toBe('Faça X')
  expect(limpar('Prompt reescrito: Faça X')).toBe('Faça X')
  expect(limpar('"Faça X"')).toBe('Faça X')
  expect(limpar('  Faça X  ')).toBe('Faça X')
  expect(modeloDe('opus')).toBe('opus')
  expect(modeloDe('gpt')).toBe('sonnet')
})

const RODAPE = { plugin: 'prompt-master', component: 'SessionMode', requestId: 'r', props: { modes: ['accept edits'] } } as const

test('o botão reescreve o rascunho na caixa e o desfazer volta ao original, no terminal e no desktop', async ($, on) => {
  const preenchidos: string[] = []
  on('command.register', () => ({ value: { command: 'prompt-master' } }))
  on('store.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.read', () => ({ value: { text: 'faz um login', cursor: 0 } }))
  on('model.complete', () => ({ value: { isAnswered: true, text: '```\nImplemente o login com testes.\n```', usage: USO } }))
  on('prompt.fill', (_, e) => {
    preenchidos.push((e as { text: string }).text)
    return { isFilled: true, cursor: 0 }
  })
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    preenchidos.length = 0
    const ui = await $.ui.mount({ ...RODAPE, surface })
    expect(await ui.find({ type: 'Button', key: 'prompt-master' })).toBeTruthy()
    await ui.press({ key: 'prompt-master' })
    expect(preenchidos).toEqual(['Implemente o login com testes.'])
    await ui.press({ key: 'prompt-master-desfazer' })
    expect(preenchidos).toEqual(['Implemente o login com testes.', 'faz um login'])
    await ui.unmount()
  }
})

test('automático: reescreve ao enviar; se o modelo falha, envia o original', async ($, on) => {
  const enviados: string[] = []
  let falhar = false
  on('command.register', () => ({ value: { command: 'prompt-master' } }))
  on('store.get', () => ({ value: true }))
  on('store.set', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', () => ({
    value: falhar ? { isAnswered: false, reason: 'empty-reply', usage: USO } : { isAnswered: true, text: 'Versão melhor do pedido.', usage: USO },
  }))
  on('prompt.submit', (_, e) => {
    enviados.push(e.text)
    return { text: e.text }
  })
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })

  await $.prompt.submit({ text: 'cria um endpoint de login com testes', origin: { kind: 'composer' }, wait: false } as never)
  falhar = true
  await $.prompt.submit({ text: 'outro pedido grande o bastante aqui', origin: { kind: 'composer' }, wait: false } as never)
  await $.prompt.submit({ text: '/deus algo', origin: { kind: 'composer' }, wait: false } as never)
  expect(enviados).toEqual(['Versão melhor do pedido.', 'outro pedido grande o bastante aqui', '/deus algo'])
})

test('o botão segue o visual dos seletores do rodapé (borda discreta, sem moldura própria)', async ($, on) => {
  on('command.register', () => ({ value: { command: 'prompt-master' } }))
  on('store.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...RODAPE, surface })
    const caixa = await ui.find({ type: 'Box', key: 'prompt-master-caixa' })
    expect(caixa?.props.borderStyle).toBe('round')
    expect(caixa?.props.borderColor).toBe('subtle')
    // O hover (borda laranja suave) é aplicado pela superfície e não aparece no find: confira na tela.
    const botao = await ui.find({ type: 'Button', key: 'prompt-master' })
    expect(botao?.props.plain).toBe(true)
    await ui.unmount()
  }
})
