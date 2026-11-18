import { expect, test } from 'claude-code/testing'

import { parseOrca, tabLabel } from './orca'

const PS = {
  ok: true,
  result: {
    worktrees: [
      {
        worktreeId: 'wt1', displayName: 'Maestro', repo: 'AprecIA', path: 'C:/p/AprecIA', branch: 'main', status: 'active', isArchived: false, liveTerminalCount: 2,
        preview: '┃ linha um\n──────\n> pronto',
        agents: [
          { paneKey: 'tab1:leaf1', agentType: 'claude', state: 'working', conversationName: 'Revisão', toolName: 'Edit', lastAssistantMessage: null },
          { paneKey: 'tab2:leaf2', agentType: 'codex', state: 'done', conversationName: 'Testes', toolName: null, lastAssistantMessage: 'Terminei   os testes' },
        ],
      },
      { worktreeId: 'wt3', displayName: 'Outro', status: 'inactive', isArchived: false, agents: [] },
      { worktreeId: 'wt2', displayName: 'Velho', isArchived: true, agents: [] },
    ],
  },
}
const TERMS = {
  ok: true,
  result: {
    terminals: [
      { handle: 'term_a', tabId: 'tab1', leafId: 'leaf1', worktreeId: 'wt1', title: 'cmd.exe - claude', agentIdentity: 'claude', lastOutputAt: 5 },
      { handle: 'term_b', tabId: 'tab2', leafId: 'leaf2', worktreeId: 'wt1', title: 'cmd.exe - codex', agentIdentity: 'codex', lastOutputAt: 9 },
      { handle: 'term_c', tabId: 'tab3', leafId: 'leaf3', worktreeId: 'wt1', title: 'C:\Windows\SYSTEM32\cmd.exe - npm  "run" "dev"', lastOutputAt: 1 },
    ],
  },
}
const SCREEN = { ok: true, result: { terminal: { handle: 'term_b', status: 'running', tail: ['$ npm test', '  12 passed', '> pronto', '', ''] } } }

test('junta worktrees, agentes e terminais do Orca', () => {
  const v = parseOrca(PS, TERMS, 7)
  expect(v.worktrees.map(w => w.name)).toEqual(['Maestro', 'Outro'])
  const w = v.worktrees[0]!
  expect(w.agents.map(a => [a.type, a.state, a.name, a.doing, a.terminal])).toEqual([
    ['claude', 'working', 'Revisão', 'Usando Edit', 'term_a'],
    ['codex', 'done', 'Testes', 'Terminei os testes', 'term_b'],
  ])
  // Cada terminal do worktree vira uma aba: com agente, o nome dele; sem, o comando.
  expect(w.terms.map(tabLabel)).toEqual(['Revisão', 'Testes', 'npm'])
  expect(parseOrca({}, {}, 0).worktrees).toEqual([])
})

const ORCA = { plugin: 'painel-agentes', component: 'Pane', requestId: 'orca', props: { title: 'Orca', isFocused: false, bodyColumns: 96, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } } as const

test('o painel Orca parece o Orca: worktrees, abas de terminal, a tela e a mensagem (sem shell)', async ($, on) => {
  const calls: string[][] = []
  on('command.register', () => ({ value: { command: 'x' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => ({ value: '<svg><path style="fill:#ffffff"/></svg>' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: 1 }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv
    calls.push(argv)
    const out = argv[0] !== 'orca' ? '' : argv.includes('ps') ? PS : argv.includes('list') ? TERMS : argv.includes('read') ? SCREEN : { ok: true }
    return { value: { exitCode: 0, stdout: argv[0] === 'orca' ? JSON.stringify(out) : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'orca' } as never)

  for (const [surface, bodyColumns] of [['desktop', 96], ['desktop', 36], ['terminal', 60]] as const) {
    const ui = await $.ui.mount({ ...ORCA, surface, props: { ...ORCA.props, bodyColumns } })
    expect(await ui.find({ type: 'Text', text: /^Maestro$/ })).toBeTruthy()
    // Abriu no terminal com saída mais recente (o do Codex) e mostra a tela dele.
    expect(await ui.find({ type: 'Text', text: /^ {2}12 passed$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'orca-tab-term_a' })).toBeTruthy()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...ORCA, surface: 'desktop' })
  await ui.input({ key: 'orca-msg-term_b', text: 'roda os testes; rm -rf /' } as never)
  // O texto vai como um argumento só: nada é interpretado por shell.
  expect(calls).toContainEqual(['orca', 'terminal', 'send', '--terminal', 'term_b', '--text', 'roda os testes; rm -rf /', '--enter', '--json'])
  expect(calls.some(c => c.includes('read') && c.includes('--screen'))).toBe(true)
  await ui.unmount()
})
