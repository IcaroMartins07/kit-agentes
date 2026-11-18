import { expect, test } from 'claude-code/testing'

import { campo, resumo } from './gerenciador'

const PANE = { plugin: 'painel-agentes', component: 'Pane', requestId: 'agentes', props: { title: 'Agentes', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as const

// Espera o que o motor faz depois de um clique (atualizações assíncronas) chegar à tela.
async function until(check: () => Promise<boolean>): Promise<boolean> {
  for (let i = 0; i < 300; i++) {
    if (await check()) return true
    await new Promise(r => setTimeout(r, 5))
  }
  return false
}

test('aba Skill: lista skills, plugins e mods com nome, descrição embaixo e checkbox; o checkbox liga e desliga de verdade', async ($, on) => {
  const runs: string[][] = []
  const toasts: string[] = []
  const files: Record<string, string> = {
    'C:/Users/voce/.claude/skills/humanizer/SKILL.md': '---\nname: humanizer\ndescription: |\n  Reescreve texto com cara de IA. Usa quando revisar prosa.\n---\n# Humanizer',
    'C:/Users/voce/.claude/skills-desativadas/graphify/SKILL.md': '---\nname: graphify\ndescription: "Mapa do projeto em grafo."\n---\n',
    'C:/cache/temas/.claude-plugin/plugin.json': JSON.stringify({ name: 'temas', description: 'Temas para os apps.' }),
    'C:/cache/temas/hooks/hooks.json': JSON.stringify({ modules: ['./register.tsx'] }),
    'C:/cache/context7/.claude-plugin/plugin.json': JSON.stringify({ name: 'context7', description: 'Documentação atual das bibliotecas.' }),
  }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.read', (_, e) => {
    const t = files[(e as { path: string }).path.split('\\').join('/')]
    if (t === undefined) throw new Error('não existe')
    return { value: t }
  })
  on('fs.list', (_, e) => {
    const p = (e as { path: string }).path.split('\\').join('/')
    const nome = p.endsWith('/skills') ? 'humanizer' : p.endsWith('/skills-desativadas') ? 'graphify' : ''
    return { value: (nome ? [{ name: nome, kind: 'dir', size: 0, mtimeMs: 0, isLink: false }, { name: '.trash', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] : []) as never }
  })
  on('env.get', (_, e) => ({ value: (e as { name: string }).name === 'USERPROFILE' ? 'C:\\Users\\voce' : undefined }))
  on('process.run', (_, e) => {
    const argv = [...(e as { argv: readonly string[] }).argv]
    runs.push(argv)
    const lista = [
      { id: 'temas@kit-agentes', scope: 'user', enabled: true, installPath: 'C:\\cache\\temas' },
      { id: 'context7@claude-plugins-official', scope: 'user', enabled: false, installPath: 'C:\\cache\\context7' },
    ]
    return { value: { exitCode: 0, stdout: argv[2] === 'list' ? JSON.stringify(lista) : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } as never }))
  on('ui.status', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/p' }))
  on('clock.now', () => ({ value: 1000 }))
  on('clock.every', () => ({ value: undefined }))
  on('agent.list', () => ({ value: [] }))
  on('command.list', () => ({ value: [] }))
  on('ui.toast', (_, e) => { toasts.push((e as { text: string }).text); return { value: undefined } })
  on('command.register', (_, e) => ({ value: { command: (e as { name: string }).name } }))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })

  // /gerenciador abre o painel já na aba Skill, sem deixar linha no chat.
  const out = await $.command.run({ command: 'gerenciador' } as never)
  expect(out.text).toBeUndefined()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as never)
  expect(await ui.find({ type: 'Button', key: 'aba-skill' })).toBeTruthy()
  expect(await until(async () => Boolean(await ui.find({ type: 'Button', key: 'check-plugin:context7@claude-plugins-official' })))).toBe(true)
  // Cada item: nome, descrição breve embaixo, checkbox no fim.
  for (const [nome, descricao] of [['humanizer', 'Reescreve texto com cara de IA.'], ['graphify', 'Mapa do projeto em grafo.'], ['temas', 'Temas para os apps.'], ['context7', 'Documentação atual das bibliotecas.']]) {
    expect(await ui.find({ type: 'Text', text: nome })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: descricao })).toBeTruthy()
  }
  const check = async (k: string) => (await ui.find({ type: 'Button', key: `check-${k}` }))?.props.label
  expect(await check('skill:humanizer')).toBe('☑')
  expect(await check('skill:graphify')).toBe('☐')
  expect(await check('mod:temas@kit-agentes')).toBe('☑') // tem módulo de hooks: é mod
  expect(await check('plugin:context7@claude-plugins-official')).toBe('☐')
  expect(await ui.find({ type: 'Text', text: /^Skills/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^Plugins/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^Mods/ })).toBeTruthy()

  // Plugin: claude plugin enable, no escopo dele.
  await ui.press({ key: 'check-plugin:context7@claude-plugins-official' })
  expect(await until(async () => (await check('plugin:context7@claude-plugins-official')) === '☑')).toBe(true)
  expect(runs).toContainEqual(['claude', 'plugin', 'enable', 'context7@claude-plugins-official', '--scope', 'user'])
  // Mod: claude plugin disable.
  await ui.press({ key: 'check-mod:temas@kit-agentes' })
  expect(await until(async () => (await check('mod:temas@kit-agentes')) === '☐')).toBe(true)
  expect(runs).toContainEqual(['claude', 'plugin', 'disable', 'temas@kit-agentes', '--scope', 'user'])
  // Skill: a pasta vai para skills-desativadas.
  await ui.press({ key: 'check-skill:humanizer' })
  expect(await until(async () => (await check('skill:humanizer')) === '☐')).toBe(true)
  const mover = runs.find(r => r[0] === 'node')
  expect(mover?.slice(-2)).toEqual(['C:/Users/voce/.claude/skills/humanizer', 'C:/Users/voce/.claude/skills-desativadas/humanizer'])
  expect(toasts.some(t => t.includes('reiniciar'))).toBe(true)
  await ui.unmount()
})

test('lê a descrição do SKILL.md em linha ou em bloco, e a encurta na primeira frase', () => {
  expect(campo('---\nname: x\ndescription: Uma linha só.\n---', 'description')).toBe('Uma linha só.')
  expect(campo('---\ndescription: >\n  Em bloco,\n  duas linhas.\nname: y\n---', 'description')).toBe('Em bloco, duas linhas.')
  expect(campo('---\nname: "com aspas"\n---', 'name')).toBe('com aspas')
  expect(campo('sem cabeçalho', 'name')).toBe('')
  expect(resumo('Primeira frase. Segunda frase.')).toBe('Primeira frase.')
  expect(resumo('a'.repeat(200), 50).length).toBe(50)
})
