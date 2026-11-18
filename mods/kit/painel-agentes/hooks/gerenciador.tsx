// A aba Skill do painel: cada skill, plugin e mod instalado, com o nome, uma descrição breve e um checkbox para
// ligar ou desligar de verdade. Veio do mod Maestro (/gerenciador), que agora abre esta aba.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { Gestor, Item } from '../types'

const GESTOR_VAZIO: Gestor = { itens: [], carregando: false, erro: '', ocupado: [] }
const gestor = atom({ plugin: 'painel-agentes', key: 'gestor' } as const, GESTOR_VAZIO, { shape: 'gestor-1' })

// ---------- o gerenciador de Skills, Plugins e Mods ----------

// Skills desligadas ficam guardadas aqui, fora de ~/.claude/skills, até serem ligadas de novo.
const DESATIVADAS = 'skills-desativadas'
const chave = (i: Item) => `${i.tipo}:${i.id}`

// Um campo do cabeçalho (frontmatter) de um SKILL.md, numa linha ou em bloco (`|` ou `>`).
export function campo(md: string, nome: string): string {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)?.[1] ?? ''
  const linhas = fm.split(/\r?\n/)
  const i = linhas.findIndex(l => l.startsWith(`${nome}:`))
  if (i < 0) return ''
  const resto = linhas[i]!.slice(nome.length + 1).trim()
  if (resto !== '' && !/^[|>][-+]?$/.test(resto)) return resto.replace(/^["']|["']$/g, '')
  const bloco: string[] = []
  for (const l of linhas.slice(i + 1)) {
    if (!/^\s/.test(l)) break
    bloco.push(l.trim())
  }
  return bloco.join(' ')
}

// A descrição breve: a primeira frase, e no máximo `max` caracteres.
export function resumo(texto: string, max = 120): string {
  const frase = /^(.+?[.!?])(\s|$)/.exec(texto)?.[1] ?? texto
  return frase.length > max ? `${frase.slice(0, max - 1).trimEnd()}…` : frase
}

async function casa($: EngineInterface): Promise<string> {
  return ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/')
}

async function lerJson($: EngineInterface, caminho: string): Promise<Record<string, unknown> | undefined> {
  return $.fs.read(caminho).then(t => JSON.parse(t) as Record<string, unknown>).catch(() => undefined)
}

async function skillsEm($: EngineInterface, pasta: string, ativo: boolean): Promise<Item[]> {
  const itens: Item[] = []
  for (const e of await $.fs.list(pasta).catch(() => [])) {
    if (e.name.startsWith('.')) continue
    const md = await $.fs.read(`${pasta}/${e.name}/SKILL.md`).catch(() => '')
    if (md === '') continue
    itens.push({ tipo: 'skill', id: e.name, nome: campo(md, 'name') || e.name, descricao: campo(md, 'description'), ativo, escopo: 'user', projeto: '' })
  }
  return itens
}

type PluginDaCli = { id: string; scope: string; enabled: boolean; installPath?: string; projectPath?: string }

// Plugins e mods instalados, pela própria CLI do Claude; um mod é um plugin com módulo de hooks.
async function plugins($: EngineInterface): Promise<Item[]> {
  const r = await $.process.run(['claude', 'plugin', 'list', '--json'], { timeoutMs: 60000 })
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || 'claude plugin list falhou')
  const lista = JSON.parse(r.stdout) as PluginDaCli[]
  return Promise.all(lista.map(async (p): Promise<Item> => {
    const pasta = (p.installPath ?? '').replace(/\\/g, '/')
    const manifesto = await lerJson($, `${pasta}/.claude-plugin/plugin.json`)
    const hooks = await lerJson($, `${pasta}/hooks/hooks.json`)
    const ehMod = Array.isArray(hooks?.modules) && hooks.modules.length > 0
    return { tipo: ehMod ? 'mod' : 'plugin', id: p.id, nome: p.id.split('@')[0] ?? p.id, descricao: String(manifesto?.description ?? ''), ativo: p.enabled, escopo: p.scope, projeto: p.projectPath ?? '' }
  }))
}

export async function carregar($: EngineInterface): Promise<void> {
  await update($, gestor, g => ({ ...g, carregando: true, erro: '' }))
  try {
    const home = await casa($)
    const [ligadas, desligadas, todos] = await Promise.all([skillsEm($, `${home}/.claude/skills`, true), skillsEm($, `${home}/.claude/${DESATIVADAS}`, false), plugins($)])
    const porNome = (a: Item, b: Item) => a.nome.localeCompare(b.nome)
    await update($, gestor, g => ({ ...g, itens: [...ligadas, ...desligadas].sort(porNome).concat(todos.sort(porNome)), carregando: false }))
  } catch (x) {
    await update($, gestor, g => ({ ...g, carregando: false, erro: String((x as Error)?.message ?? x) }))
  }
}

// Move a pasta de uma skill (o $.fs não move pastas): um node curto, sem shell, com os dois caminhos como argumentos.
const MOVER = "const fs=require('fs'),path=require('path');const [de,para]=process.argv.slice(1);if(fs.existsSync(para))throw new Error('já existe: '+para);fs.mkdirSync(path.dirname(para),{recursive:true});fs.renameSync(de,para)"

// Liga ou desliga um item de verdade: skill muda de pasta; plugin e mod passam pelo `claude plugin enable/disable`.
async function alternar($: EngineInterface, item: Item): Promise<void> {
  const k = chave(item)
  if ((await read($, gestor)).ocupado.includes(k)) return
  await update($, gestor, g => ({ ...g, ocupado: [...g.ocupado, k], erro: '' }))
  try {
    if (item.tipo === 'skill') {
      const base = `${await casa($)}/.claude`
      const [de, para] = item.ativo ? [`${base}/skills/${item.id}`, `${base}/${DESATIVADAS}/${item.id}`] : [`${base}/${DESATIVADAS}/${item.id}`, `${base}/skills/${item.id}`]
      const r = await $.process.run(['node', '-e', MOVER, de, para])
      if (r.exitCode !== 0) throw new Error(r.stderr.trim().split('\n').pop() || 'não deu para mover a pasta da skill')
    } else {
      const argv = ['claude', 'plugin', item.ativo ? 'disable' : 'enable', item.id, '--scope', item.escopo]
      const r = await $.process.run(argv, item.projeto ? { cwd: item.projeto, timeoutMs: 60000 } : { timeoutMs: 60000 })
      if (r.exitCode !== 0) throw new Error(r.stderr.trim() || r.stdout.trim() || 'o claude recusou')
    }
    await update($, gestor, g => ({ ...g, itens: g.itens.map(i => (chave(i) === k ? { ...i, ativo: !i.ativo } : i)) }))
    $.ui.toast(`${item.nome} ${item.ativo ? 'desativado' : 'ativado'}: vale ao reiniciar o app.`)
  } catch (x) {
    await update($, gestor, g => ({ ...g, erro: `${item.nome}: ${String((x as Error)?.message ?? x)}` }))
  } finally {
    await update($, gestor, g => ({ ...g, ocupado: g.ocupado.filter(o => o !== k) }))
  }
}

// O conteúdo da aba: o topo com o ↻ e as três seções.
export async function renderGestor($: EngineInterface, e: Extract<RenderInput, { component: 'Pane' }>): Promise<RenderElement> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const g = await read($, gestor)
  if (g.itens.length === 0 && !g.carregando && g.erro === '') void carregar($).catch(() => undefined)
  const max = Math.max(40, e.props.bodyColumns * 2)
  const secao = (titulo: string, tipo: Item['tipo']) => {
    const itens = g.itens.filter(i => i.tipo === tipo)
    return (
      <Box key={`secao-${tipo}`} flexDirection="column" rowGap={1} marginBottom={1} borderStyle="round" borderColor="claude" borderDimColor paddingX={1} paddingY={1}>
        <Text bold color="claude">{titulo} <Text dimColor>{itens.filter(i => i.ativo).length} de {itens.length} ativos</Text></Text>
        {itens.length === 0 && <Text dimColor>Nenhum.</Text>}
        {itens.map(i => {
          const k = chave(i)
          const isBusy = g.ocupado.includes(k)
          return (
            <Box key={`item-${k}`} flexDirection="row" columnGap={2} alignItems="flex-start">
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                <Text bold dimColor={!i.ativo}>{i.nome}</Text>
                {i.descricao !== '' && <Text dimColor size="footnote">{resumo(i.descricao, max)}</Text>}
              </Box>
              <Box flexShrink={0}>
                <Button key={`check-${k}`} plain label={isBusy ? '◌' : i.ativo ? '☑' : '☐'} onPress={() => alternar($, i)} />
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      <Box key="topo" flexDirection="row" justifyContent="space-between" columnGap={2} marginBottom={1}>
        <Box flexShrink={1}><Text dimColor size="footnote">Marque para ativar e desmarque para desativar. Vale ao reiniciar o app.</Text></Box>
        <Button key="atualizar-skill" plain onPress={() => carregar($)}><Text color="claude">↻</Text></Button>
      </Box>
      {g.erro !== '' && <Text color="warning">{g.erro}</Text>}
      {g.carregando && g.itens.length === 0
        ? <Text dimColor>Lendo skills, plugins e mods…</Text>
        : [secao('Skills', 'skill'), secao('Plugins', 'plugin'), secao('Mods', 'mod')]}
    </Box>
  )
}
