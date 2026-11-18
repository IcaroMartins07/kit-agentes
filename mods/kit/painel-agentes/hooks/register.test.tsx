import { expect, test } from 'claude-code/testing'
import { G, SPRITES, mascoteDe, spriteSvg } from './sprites'

import { diffStat, fmtTime, fmtTokens, graphSvg, parseStatus, planOf, whereOf } from './register'

const PANE = {
  plugin: 'painel-agentes',
  component: 'Pane',
  requestId: 'agentes',
  props: { title: 'Agentes', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const GRAPH = JSON.stringify({
  nodes: [{ x: 0, y: 1, z: 0, c: 0, d: 3 }, { x: 1, y: 0, z: 0, c: 1, d: 1 }],
  edges: [[0, 1]],
  communities: [{ name: 'hooks', count: 10 }],
  total: { nodes: 2, links: 1, communities: 1 },
})

test('um subagente aparece com o que faz, o que alterou e o grafo', async ($, on) => {
  on('command.register', () => ({ value: { command: 'agentes' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.exists', () => ({ value: true }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: GRAPH, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('agent.spawn', () => ({ model: 'm', agentId: 'sub1' }))
  on('agent.list', () => ({ value: [] }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.list', () => ({ value: [] }))
  const opened: string[] = []
  on('command.run', (_, e) => { opened.push(e.command); return { text: '' } })
  on('fs.list', (_, e) => ({ value: JSON.stringify(e).includes('src') ? [{ name: 'b.ts', kind: 'file', size: 1, mtimeMs: 0, isLink: false }] : [{ name: 'src', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }, { name: 'a.ts', kind: 'file', size: 1, mtimeMs: 0, isLink: false }, { name: '.git', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'p', description: 'Pesquisa', subagentType: 'Explore' } as never)
  await ($ as unknown as { tool: { call: (i: object) => Promise<unknown> } }).tool.call({ tool: 'TodoWrite', agentId: 'sub1', todos: [] })
  await ($ as unknown as { tool: { call: (i: object) => Promise<unknown> } }).tool.call({ tool: 'Edit', agentId: 'sub1', file_path: '/proj/a.ts', old_string: 'x', new_string: 'y' })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^Pesquisa$/ }))?.text).toBe('Pesquisa')
    expect((await ui.find({ type: 'Text', text: /Editando/ }))?.text).toBe('Editando a.ts')
    // Como no mockup: a seção Agentes com as contagens, o agente em cartão e, no desktop, o mascote num ladrilho.
    expect(await ui.find({ type: 'Text', text: /^Agentes$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^1 rodando · 0 concluídos$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Box', key: 'a-sub1' })).toBeTruthy()
    if (surface === 'desktop') {
      const mascotes = (await ui.findAll({ type: 'Svg' })).filter(s => s.props.alt === 'mascote do agente')
      expect(mascotes.length).toBe(2) // o Claude da tarefa e o Explore
      expect(String(mascotes[0]?.props.source)).toContain('viewBox="-2 -2 18 18"')
    }
    // No desktop a barra é um Svg em pílula (o rótulo vai no alt); no terminal, o Progress do app.
    const said = [...(await ui.findAll({ type: 'Svg' })).map(b => String(b.props.alt)), ...(await ui.findAll({ type: 'Text' })).map(b => b.text ?? '')]
    expect(said.some(x => x.startsWith('Progresso da tarefa'))).toBe(true)
    expect(said.some(x => x.startsWith('Progresso de Pesquisa'))).toBe(true)
    // Tempo e tokens uma vez por barra: a da tarefa (o Claude) e a do sub-agente.
    expect((await ui.findAll({ type: 'Text', text: /^⏱/ })).length).toBe(2)
    expect((await ui.findAll({ type: 'Text', text: /tokens$/ })).length).toBe(2)
    expect(await ui.find({ type: 'Button', key: 'aba-agentes' })).toBeTruthy()
    // "N alterações" leva à aba Alterações com o diff aberto.
    await ui.press({ key: 'ver-sub1' })
    expect(await ui.find({ type: 'Code' })).toBeTruthy()
    await ui.press({ key: 'aba-cerebro' })
    expect(await ui.find({ type: 'Text', text: /ligações/ })).toBeTruthy()
    // Arquivos: a árvore fica neste painel; nenhum outro painel é aberto.
    await ui.press({ key: 'aba-arquivos' })
    expect(await ui.find({ type: 'Text', text: /^Worktree$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^a\.ts$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^\.git$/ })).toBeUndefined()
    // O sub-agente editou a.ts: o nome fica marcado e a legenda explica as cores.
    expect(await ui.find({ type: 'Text', text: /^Guia Worktree$/ })).toBeTruthy()
    await ui.press({ key: 't-src' })
    expect(await ui.find({ type: 'Text', text: /^b\.ts$/ })).toBeTruthy()
    await ui.press({ key: 't-src' })
    expect(opened).not.toContain('filetree')
    await ui.press({ key: 'aba-agentes' })
    await ui.unmount()
  }
})

test('acima do prompt não fica nada de nenhum mod; a barra de progresso fica só no painel', async ($, on) => {
  on('command.register', () => ({ value: { command: 'agentes' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  const row = (plugin: string) => ({ plugin, tree: { type: 'Text', props: {}, children: [plugin] } })
  const props = { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  const rows = [row('painel-agentes'), row('savvy-progress'), row('ponytail'), row('maestro'), row('reflect-mod')]
  const ui = await $.ui.mount({ plugin: 'painel-agentes', component: 'AbovePromptList', requestId: 'band', surface: 'desktop', props: { ...props, rows } } as never)
  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()

  // Com uma tarefa rodando, o mod não desenha nada acima do prompt.
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await $.turn.start({ prompt: 'faz algo' } as never).catch(() => undefined)
  const band = await $.ui.mount({ plugin: 'painel-agentes', component: 'AbovePrompt', requestId: 'faixa', surface: 'desktop', props } as never)
  expect(await band.find({ type: 'Svg' })).toBeUndefined()
  expect(await band.find({ type: 'Progress' })).toBeUndefined()
  await band.unmount()
})

test('o progresso vem do plano do agente, e tempo e tokens ficam legíveis', () => {
  const items = [{ status: 'completed' }, { status: 'in_progress' }, { status: 'pending' }]
  expect(planOf('TodoWrite', { todos: items }, null)).toEqual({ done: 1, total: 3 })
  expect(planOf('mcp__ccd_turn__update_plan', { items }, null)).toEqual({ done: 1, total: 3 })
  expect(planOf('mcp__ccd_turn__update_plan', { advance: true }, { done: 1, total: 3 })).toEqual({ done: 2, total: 3 })
  expect(planOf('mcp__ccd_turn__update_plan', { done: [2, 3], start: 4 }, { done: 2, total: 3 })).toEqual({ done: 3, total: 3 })
  expect(planOf('mcp__ccd_turn__update_plan', { advance: true }, null)).toBeUndefined()
  expect(planOf('Bash', { command: 'ls' }, null)).toBeUndefined()
  expect(fmtTime(4200)).toBe('4s')
  expect(fmtTime(374000)).toBe('6m 14s')
  expect(fmtTokens(950)).toBe('950')
  expect(fmtTokens(12345)).toBe('12k')
  expect(fmtTokens(2500000)).toBe('2.5M')
})

test('a esfera girando cabe no limite de 131072 caracteres do Svg com o grafo no tamanho máximo', () => {
  const nodes = Array.from({ length: 90 }, (_, i) => ({ x: Math.cos(i), y: Math.sin(i) * 0.5, z: Math.sin(i), c: i % 5, d: (i % 9) + 1 }))
  const edges = Array.from({ length: 260 }, (_, i) => [i % 90, (i * 7 + 3) % 90] as [number, number])
  const svg = graphSvg({ nodes, edges, communities: [], total: { nodes: 90, links: 260, communities: 5 } }, 320)
  expect(svg.length).toBeLessThan(131072)
})

test('onde o agente está: arquivo da ferramenta, relativo à pasta da sessão', () => {
  expect(whereOf('Edit', { file_path: String.raw`C:\proj\src\a.ts` }, 'C:/proj')).toEqual({ path: 'src/a.ts', kind: 'write' })
  expect(whereOf('Read', { file_path: '/proj/README.md' }, '/proj/')).toEqual({ path: 'README.md', kind: 'read' })
  expect(whereOf('Read', { file_path: 'c:/PROJ/x.md' }, 'C:/proj')).toEqual({ path: 'x.md', kind: 'read' })
  expect(whereOf('Read', { file_path: '/outra/pasta/x.md' }, '/proj')).toBeUndefined()
  expect(whereOf('Bash', { command: 'ls' }, '/proj')).toBeUndefined()
})

// 3 larguras x 3 superfícies x 4 abas: pesado, e passava dos 5 s padrão com a máquina ocupada.
test('responsivo: estreito, médio e largo, em todas as abas e superfícies, sem nada maior que o corpo', { timeoutMs: 30000 }, async ($, on) => {
  on('command.register', () => ({ value: { command: 'agentes' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.exists', () => ({ value: true }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: GRAPH, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.list', () => ({ value: [{ name: 'um-arquivo-com-um-nome-bem-comprido-que-nao-cabe-numa-tela-estreita.tsx', kind: 'file', size: 1, mtimeMs: 0, isLink: false }] }))
  on('agent.spawn', () => ({ model: 'm', agentId: 'sub1' }))
  on('agent.list', () => ({ value: [] }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'p', description: 'Um sub-agente com um nome bem comprido para testar o corte', subagentType: 'Explore' } as never)
  await ($ as unknown as { tool: { call: (i: object) => Promise<unknown> } }).tool.call({ tool: 'Edit', agentId: 'sub1', file_path: '/proj/um-arquivo-com-um-nome-bem-comprido-que-nao-cabe-numa-tela-estreita.tsx', old_string: 'x', new_string: 'y' })

  for (const bodyColumns of [24, 48, 96]) {
    for (const surface of ['mobile', 'desktop', 'terminal'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns } })
      for (const [aba, titulo] of [['agentes', /^Concluídos|^Um sub-agente/], ['arquivos', /^Worktree$/], ['alteracoes', /^Um sub-agente/], ['cerebro', /^Maiores grupos$/]] as const) {
        await ui.press({ key: `aba-${aba}` })
        expect(await ui.find({ type: 'Text', text: titulo })).toBeTruthy()
        // Textos curtos (nomes, rótulos) são cortados ao corpo; textos corridos quebram linha sozinhos.
        for (const x of await ui.findAll({ type: 'Text' })) {
          if (!/\s/.test((x.text ?? '').trim())) expect((x.text ?? '').length).toBeLessThanOrEqual(bodyColumns)
        }
        // Desenhos (esfera, pixel art) nunca mais largos que o corpo (~7px por coluna).
        for (const s of await ui.findAll({ type: 'Svg' })) {
          if (typeof s.props.width === 'number') expect(s.props.width).toBeLessThanOrEqual(bodyColumns * 7)
        }
      }
      await ui.press({ key: 'aba-agentes' })
      await ui.unmount()
    }
  }
})

test('git status -z: renomeação, nomes com acento e pasta da sessão dentro do repo', () => {
  const raw = ' M mods/a.ts\0R  mods/novo.ts\0mods/velho.ts\0?? mods/Cérebro.md\0 M fora/x.ts\0'
  expect(parseStatus(raw, 'mods/')).toEqual([
    { code: 'M', path: 'a.ts' },
    { code: 'R', path: 'novo.ts' },
    { code: '??', path: 'Cérebro.md' },
  ])
})

test('worktree ao vivo: o que um comando de terminal muda aparece marcado, com o agente no arquivo', async ($, on) => {
  let status = ''
  on('command.register', () => ({ value: { command: 'agentes' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.exists', () => ({ value: false }))
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv.join(' ')
    const stdout = argv.includes('rev-parse') ? '\n' : argv.includes('status') ? status : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 5000, isLink: false } }))
  on('fs.list', () => ({ value: [{ name: 'gerado.json', kind: 'file', size: 1, mtimeMs: 5000, isLink: false }] }))
  on('clock.now', () => ({ value: 4000 }))
  on('clock.every', () => ({ value: undefined }))
  on('agent.list', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', () => {
    status = '?? gerado.json\0' // o comando criou o arquivo
    return { result: {} }
  })
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await ($ as unknown as { tool: { call: (i: object) => Promise<unknown> } }).tool.call({ tool: 'Bash', command: 'node gera.mjs' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'aba-arquivos' })
  expect(await ui.find({ type: 'Text', text: /^gerado\.json$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^novo$/ })).toBeTruthy()
  // O Claude está nesse arquivo, editando: aparece o ✎ e o nome dele ao lado.
  expect((await ui.find({ type: 'Text', text: /^✎/ }))?.text).toContain('Claude')
  expect(await ui.find({ type: 'Text', text: /^Editando agora/ })).toBeTruthy()
  await ui.unmount()
})

test('contagem de linhas do diff, como o +N −N do GitHub', () => {
  expect(diffStat('@@ -1,2 +1,3 @@\n-a\n-b\n+c\n+d\n+e')).toEqual({ add: 3, del: 2 })
  expect(diffStat('@@ -0,0 +1,1 @@\n+x')).toEqual({ add: 1, del: 0 })
})

test('pasta com agente atuando fica na cor do status, sem fundo (o vidro aparece); volta a "editado" quando ele para', async ($, on) => {
  on('command.register', () => ({ value: { command: 'agentes' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.exists', () => ({ value: false }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.list', (_, e) => ({ value: JSON.stringify(e).includes('src') ? [{ name: 'a.ts', kind: 'file', size: 1, mtimeMs: 0, isLink: false }] : [{ name: 'src', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }, { name: 'docs', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.every', () => ({ value: undefined }))
  on('agent.list', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await ($ as unknown as { tool: { call: (i: object) => Promise<unknown> } }).tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'x', new_string: 'y' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'aba-arquivos' })
  const rowOf = async (path: string) => (await ui.findAll({ type: 'Box' })).find(b => b.key === `w-${path}`)
  const nameOf = async (name: string) => ui.find({ type: 'Text', text: new RegExp(`^${name}$`) })
  expect((await rowOf('src'))?.props.backgroundColor).toBeUndefined()
  expect((await nameOf('src'))?.props).toMatchObject({ color: 'claude', bold: true })
  expect((await nameOf('docs'))?.props.color).toBeUndefined()

  await ($ as unknown as { turn: { complete: (i: object) => Promise<unknown> } }).turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })
  await ui.redraw()
  expect((await nameOf('src'))?.props.color).toBe('bashBorder')

  // Alterações: o arquivo com ícone e +1 −1, como no GitHub.
  await ui.press({ key: 'aba-alteracoes' })
  expect(await ui.find({ type: 'Text', text: /^\+1$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^−1$/ })).toBeTruthy()
  expect((await ui.findAll({ type: 'Svg' })).some(s => String(s.props.alt).startsWith('arquivo'))).toBe(true)
  await ui.unmount()
})

test('cada agente vira um Claude com o acessório da função: hacker, design, QA, segurança e os outros', () => {
  const casos: Array<[string, string]> = [
    ['dev-back', 'hacker'], ['dev-front', 'design'], ['qa-unit', 'qa'], ['qa-ui', 'qa'], ['revisor-seguranca', 'seguranca'],
    ['revisor', 'revisor'], ['auditor-de-fatos', 'revisor'], ['Explore', 'explore'], ['Plan', 'plan'], ['dev-docs', 'docs'],
    ['dev-devops', 'devops'], ['dev-dados', 'dados'], ['dev-db', 'db'], ['dev-mobile', 'mobile'], ['maestro', 'maestro'],
    ['general-purpose', 'padrao'], ['claude-code-guide', 'docs'],
  ]
  for (const [tipo, esperado] of casos) expect([tipo, mascoteDe(tipo, '')]).toEqual([tipo, esperado])
  // Sem tipo que diga a função, vale o nome; o principal é sempre o Claude de coroa.
  expect(mascoteDe('general-purpose', 'Design do mockup')).toBe('design')
  expect(mascoteDe('qualquer', 'x', true)).toBe('claude')
  // Todo sprite é o Claude (corpo laranja e olhos) numa grade de 14 x 14, e nenhum é igual a outro.
  const todos = Object.values(SPRITES)
  for (const s of todos) {
    expect(s.length).toBe(G)
    expect(s.every(r => r.length === G)).toBe(true)
    expect([s[6]![5], s[6]![8]]).toEqual(['k', 'k']) // os dois olhos
    expect([3, 5, 8, 10].map(x => s[12]![x])).toEqual(['o', 'o', 'o', 'o']) // as quatro perninhas
  }
  expect(new Set(todos.map(s => s.join(''))).size).toBe(todos.length)
  expect(spriteSvg(SPRITES.claude, 28)).toContain('viewBox="0 0 14 14"')
})
