import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'painel-agentes',
  component: 'Pane',
  requestId: 'agentes',
  props: { title: 'Agentes', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const LISTA = {
  terminais: [
    { id: 't1', nome: 'front', cli: 'claude', cwd: '/proj', estado: 'rodando', inicio: 1 },
    { id: 't2', nome: 'revisor', cli: 'codex', cwd: '/proj', estado: 'rodando', inicio: 2 },
    { id: 't3', nome: 'velho', cli: null, cwd: '/proj', estado: 'encerrado', inicio: 0 },
  ],
}
const TELA = { id: 't2', estado: 'rodando', linhas: ['> revisa o último commit', '  2 itens', 'pronto'] }

type On = Parameters<Extract<Parameters<typeof test>[1], (...a: never[]) => unknown>>[1]
function preparar(on: On, run: (argv: string[]) => { exitCode: number; stdout: string; stderr: string }) {
  on('command.register', () => ({ value: { command: 'x' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => ({ value: '' }))
  on('fs.list', () => ({ value: [] }))
  on('agent.list', () => ({ value: [] }))
  on('command.list', () => ({ value: [] }))
  on('clock.now', () => ({ value: 1 }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e) => ({ value: { ...run((e as { argv: string[] }).argv), isStdoutTruncated: false, isStderrTruncated: false } }))
}

test('aba Terminais: os terminais do MCP Orca, a tela do escolhido e a mensagem, sem shell', async ($, on) => {
  const calls: string[][] = []
  preparar(on, argv => {
    calls.push(argv)
    if (argv[0] !== 'mcp-orca') return { exitCode: 0, stdout: '', stderr: '' }
    const out = argv[1] === 'listar' ? LISTA : argv[1] === 'ler' ? TELA : argv[1] === 'abrir' ? { id: 't4' } : { ok: true }
    return { exitCode: 0, stdout: JSON.stringify(out), stderr: '' }
  })
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

  for (const [surface, bodyColumns] of [['desktop', 60], ['desktop', 34], ['terminal', 60]] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns } })
    await ui.press({ key: 'aba-terminais' })
    expect(await ui.find({ type: 'Button', key: 'term-tab-t1' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'term-tab-t2' })).toBeTruthy()
    // Abre no terminal vivo mais recente (o do Codex) e mostra a tela dele.
    expect(await ui.find({ type: 'Text', text: /^ {2}2 itens$/ })).toBeTruthy()
    await ui.press({ key: 'aba-agentes' })
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'aba-terminais' })
  // O texto vai como um argumento só, depois de "--": nem shell nem a CLI o interpretam.
  await ui.input({ key: 'term-msg-t2', text: '--help; rm -rf /' } as never)
  expect(calls).toContainEqual(['mcp-orca', 'enviar', 't2', '--json', '--', '--help; rm -rf /'])
  await ui.press({ key: 'term-abrir-codex' })
  expect(calls).toContainEqual(['mcp-orca', 'abrir', '--cli', 'codex', '--cwd', '/proj', '--json'])
  await ui.press({ key: 'term-fechar-t2' })
  expect(calls).toContainEqual(['mcp-orca', 'fechar', 't2', '--json'])
  await ui.unmount()
})

test('aba Terminais: sem o comando mcp-orca, explica como instalar', async ($, on) => {
  preparar(on, argv => (argv[0] === 'mcp-orca' ? { exitCode: 1, stdout: '', stderr: "'mcp-orca' não é reconhecido como um comando interno" } : { exitCode: 0, stdout: '', stderr: '' }))
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'aba-terminais' })
  expect(await ui.find({ type: 'Text', text: /npm link/ })).toBeTruthy()
  await ui.unmount()
})
