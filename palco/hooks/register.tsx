// palco: canvas ao lado do chat para dispor e rodar agentes (Claude, Codex, Gemini), comandos e notas.
// M1: painel, canvas com pan, nós arrastáveis, layout salvo por projeto.
// M2: nós que rodam: Claude como subagente, Codex/Gemini/comando como processo, todos pela cerca.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ferramentas, No, Tipo, Vista } from '../types'
import {
  COR_STATUS,
  MAX_NOS,
  ROTULO,
  SIMBOLO,
  argvDe,
  cerca,
  impedimento,
  juntarSaida,
  lerGuardado,
  novoNo,
  paraGuardar,
  ultimasLinhas,
} from './modelo'

const PANE = 'palco'
const PANE_SAIDA = 'palco-saida'

const nos = atom({ plugin: 'palco', key: 'nos' } as const, [], { shape: 'nos-1' })
const vista = atom({ plugin: 'palco', key: 'vista' } as const, { px: 0, py: 0 })
const sel = atom({ plugin: 'palco', key: 'sel' } as const, null)
const ferramentas = atom({ plugin: 'palco', key: 'ferramentas' } as const, { codex: false, gemini: false, shell: 'bash' })

// Processos em andamento, por nó: o iterador do fluxo, para parar.
const vivos = new Map<string, AsyncIterator<unknown>>()
let chave = 'layout:'

const TIPOS: Tipo[] = ['nota', 'claude', 'codex', 'gemini', 'cmd']

async function guardar($: EngineInterface): Promise<void> {
  const lista = await read($, nos)
  const v = await read($, vista)
  await $.store.set(chave, { nos: paraGuardar(lista), vista: v })
}

async function mudarNo($: EngineInterface, id: string, fn: (n: No) => No): Promise<void> {
  await update($, nos, lista => lista.map(n => (n.id === id ? fn(n) : n)))
}

async function existe($: EngineInterface, argv: string[]): Promise<boolean> {
  try {
    const r = await $.process.run(argv, { timeoutMs: 8000 })
    return r.exitCode === 0
  } catch {
    return false
  }
}

async function rodar($: EngineInterface, id: string): Promise<string> {
  const lista = await read($, nos)
  const no = lista.find(n => n.id === id)
  if (!no) return 'nó não existe'
  const f = await read($, ferramentas)
  const impede = impedimento(no, f)
  if (impede) return impede
  const perigo = cerca(no.texto)
  if (perigo) {
    await mudarNo($, id, n => ({ ...n, status: 'bloqueado', saida: `[palco · cerca] bloqueado: ${perigo}. Rode você mesmo, se for o caso.` }))
    $.ui.toast(`palco: ${no.titulo} bloqueado (${perigo})`)
    await guardar($)
    return `bloqueado: ${perigo}`
  }

  if (no.tipo === 'claude') {
    const r = await $.agent.spawn({ prompt: no.texto, description: no.titulo, subagentType: no.agente || 'general-purpose' })
    if (r.deny !== undefined) {
      await mudarNo($, id, n => ({ ...n, status: 'falhou', saida: `não iniciou: ${r.deny}` }))
      return `não iniciou: ${r.deny}`
    }
    await mudarNo($, id, n => ({ ...n, status: 'rodando', saida: '', agentId: r.agentId }))
    return `rodando (${r.model ?? 'modelo da sessão'})`
  }

  const argv = argvDe(no, f)
  if (!argv) return 'nada para rodar'
  await mudarNo($, id, n => ({ ...n, status: 'rodando', saida: `$ ${argv.join(' ')}\n` }))

  // O laço é a vida do processo: roda solto, depois que o hook responde.
  void (async () => {
    const fluxo = $.process.spawn({ argv })
    const it = fluxo[Symbol.asyncIterator]()
    vivos.set(id, it as AsyncIterator<unknown>)
    let pendente = ''
    let ultimo = 0
    const descarregar = async () => {
      if (!pendente) return
      const p = pendente
      pendente = ''
      await mudarNo($, id, n => ({ ...n, saida: juntarSaida(n.saida, p) }))
    }
    try {
      while (true) {
        const passo = await it.next()
        if (passo.done) {
          await descarregar()
          const fim = passo.value as { code: number | null; signal: string | null } | undefined
          const ok = fim?.code === 0
          await mudarNo($, id, n => ({
            ...n,
            status: ok ? 'ok' : 'falhou',
            saida: juntarSaida(n.saida, `\n[saiu com ${fim?.signal ?? fim?.code ?? '?'}]`),
          }))
          if (!ok) $.ui.toast(`palco: ${no.titulo} falhou`)
          break
        }
        const pedaco = passo.value as { stream: string; text: string }
        pendente += pedaco.text
        const agora = await $.clock.now()
        if (agora - ultimo > 250) {
          ultimo = agora
          await descarregar()
        }
      }
    } catch (x) {
      await descarregar()
      await mudarNo($, id, n => ({ ...n, status: 'falhou', saida: juntarSaida(n.saida, `\n[erro: ${String((x as Error)?.message ?? x)}]`) }))
    } finally {
      vivos.delete(id)
      await guardar($)
    }
  })()
  return 'rodando'
}

async function parar($: EngineInterface, id: string): Promise<void> {
  const it = vivos.get(id)
  if (it?.return) await it.return(undefined)
  vivos.delete(id)
  await mudarNo($, id, n => (n.status === 'rodando' ? { ...n, status: 'falhou', saida: juntarSaida(n.saida, '\n[parado por você]') } : n))
}

async function adicionar($: EngineInterface, tipo: Tipo): Promise<void> {
  const lista = await read($, nos)
  if (lista.length >= MAX_NOS) {
    $.ui.toast(`palco: limite de ${MAX_NOS} nós`)
    return
  }
  const v = await read($, vista)
  const id = `n${(await $.clock.now()).toString(36)}${lista.length}`
  const no = novoNo(tipo, lista, v, id)
  await update($, nos, l => [...l, no])
  await update($, sel, () => id)
  await guardar($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    chave = `layout:${e.cwd}`
    try {
      const salvo = (await $.store.get(chave)) as { nos?: unknown; vista?: Vista } | undefined
      if (salvo) {
        await update($, nos, () => lerGuardado(salvo.nos))
        if (salvo.vista && typeof salvo.vista.px === 'number') await update($, vista, () => ({ px: salvo.vista!.px, py: salvo.vista!.py }))
      }
    } catch {
      // layout ilegível: começa vazio
    }
    const f: Ferramentas = {
      codex: await existe($, ['codex', '--version']),
      gemini: await existe($, ['gemini', '--version']),
      shell: (await existe($, ['bash', '--version'])) ? 'bash' : 'cmd',
    }
    await update($, ferramentas, () => f)
    await $.command.register({ name: 'palco', description: 'Abre o palco: canvas para dispor e rodar agentes, comandos e notas' })
    return started
  })

  on('command.run', { command: 'palco' }, async $ => {
    await $.ui.open({ id: PANE, title: 'palco' })
    return { text: 'palco aberto.' }
  })

  // Resposta de um nó Claude: o turno final do subagente que ele iniciou.
  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const lista = await read($, nos)
      const no = lista.find(n => n.agentId === agentId)
      if (no) {
        const texto = 'text' in e && typeof e.text === 'string' ? e.text : ''
        const ok = e.reason === 'answer'
        await mudarNo($, no.id, n => ({ ...n, status: ok ? 'ok' : 'falhou', saida: juntarSaida('', texto || `[terminou: ${e.reason}]`) }))
        if (!ok) $.ui.toast(`palco: ${no.titulo} terminou com ${e.reason}`)
        await guardar($)
      }
    }
    return next(e)
  })

  // Eventos do canvas.
  on('ui.message', async ($, e, next) => {
    if (e.element !== 'canvas') return next(e)
    const d = (e.data ?? {}) as { tipo?: string; id?: string | null; dx?: number; dy?: number }
    if (d.tipo === 'selecionar') await update($, sel, () => (typeof d.id === 'string' ? d.id : null))
    else if (d.tipo === 'mover' && d.id) {
      await mudarNo($, d.id, n => ({ ...n, x: n.x + (d.dx ?? 0), y: n.y + (d.dy ?? 0) }))
      await update($, sel, () => d.id ?? null)
      await guardar($)
    } else if (d.tipo === 'pan') {
      await update($, vista, v => ({ px: v.px + (d.dx ?? 0), py: v.py + (d.dy ?? 0) }))
      await guardar($)
    } else if (d.tipo === 'centro') {
      await update($, vista, () => ({ px: 0, py: 0 }))
      await guardar($)
    } else if (d.tipo === 'excluir' && d.id) {
      await parar($, d.id)
      await update($, nos, l => l.filter(n => n.id !== d.id))
      await update($, sel, () => null)
      await guardar($)
    }
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Input } = ui
    // O canvas precisa de `Client` (terminal e desktop); no celular o palco mostra só a lista.
    const Client = 'Client' in ui ? ui.Client : null
    const lista = await read($, nos)
    const v = await read($, vista)
    const s = await read($, sel)
    const f = await read($, ferramentas)
    const no = lista.find(n => n.id === s) ?? null
    const linhasPainel = e.viewport?.rows ?? 30
    const alturaCanvas = Math.max(10, linhasPainel - (no ? 13 : 6))

    const visto = lista.map(n => ({
      id: n.id,
      titulo: n.titulo,
      tipo: n.tipo === 'claude' ? `claude · ${n.agente || 'general-purpose'}` : ROTULO[n.tipo],
      x: n.x,
      y: n.y,
      w: n.w,
      h: n.h,
      cor: COR_STATUS[n.status],
      simbolo: SIMBOLO[n.status],
      linhas: ultimasLinhas(n.tipo === 'nota' ? n.texto : n.saida || n.texto, Math.max(0, n.h - 4), n.w - 4),
    }))

    const botao = (tipo: Tipo) => {
      const falta = (tipo === 'codex' && !f.codex) || (tipo === 'gemini' && !f.gemini)
      return <Button key={`add-${tipo}`} label={`+ ${ROTULO[tipo]}${falta ? ' (ausente)' : ''}`} plain onPress={() => adicionar($, tipo)} />
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {TIPOS.map(botao)}
          <Button key="centro" label="⌂" plain onPress={() => update($, vista, () => ({ px: 0, py: 0 }))} />
        </Box>
        {Client ? (
          <Client
            key="canvas"
            module="./canvas.tsx"
            width="100%"
            height={alturaCanvas}
            props={{ nos: visto, px: v.px, py: v.py, sel: s, vazio: 'Canvas vazio: adicione um nó acima. Arraste o fundo para mover a vista e os nós para reposicioná-los; setas também movem a vista.' }}
          />
        ) : (
          <Box flexDirection="column">
            {lista.map(n => (
              <Button key={`item-${n.id}`} label={`${SIMBOLO[n.status]} ${n.titulo} · ${ROTULO[n.tipo]}`} plain onPress={() => update($, sel, () => n.id)} />
            ))}
          </Box>
        )}
        {no ? (
          <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
            <Text bold wrap="truncate-end">
              {SIMBOLO[no.status]} {no.titulo} · {no.tipo === 'claude' ? `claude · ${no.agente}` : ROTULO[no.tipo]} · {no.status}
            </Text>
            <Input
              key={`titulo-${no.id}`}
              label="título"
              value={no.titulo}
              submitLabel="ok"
              onSubmit={valor => mudarNo($, no.id, n => ({ ...n, titulo: valor.trim() || n.titulo })).then(() => guardar($))}
            />
            {no.tipo === 'claude' && (
              <Input
                key={`agente-${no.id}`}
                label="agente"
                placeholder="general-purpose, modo-deus:revisor..."
                value={no.agente}
                submitLabel="ok"
                onSubmit={valor => mudarNo($, no.id, n => ({ ...n, agente: valor.trim() || 'general-purpose' })).then(() => guardar($))}
              />
            )}
            <Input
              key={`texto-${no.id}`}
              label={no.tipo === 'nota' ? 'nota' : no.tipo === 'cmd' ? 'comando' : 'prompt'}
              value={no.texto}
              rows={3}
              submitLabel="salvar"
              onSubmit={valor => mudarNo($, no.id, n => ({ ...n, texto: valor })).then(() => guardar($))}
            />
            <Box flexDirection="row" gap={1}>
              {no.tipo !== 'nota' && no.status !== 'rodando' && (
                <Button
                  key="rodar"
                  label="▶ rodar"
                  onPress={async () => {
                    const r = await rodar($, no.id)
                    if (r !== 'rodando' && !r.startsWith('rodando')) $.ui.toast(`palco: ${r}`)
                  }}
                />
              )}
              {no.status === 'rodando' && no.tipo !== 'claude' && <Button key="parar" label="■ parar" onPress={() => parar($, no.id)} />}
              {no.status === 'rodando' && no.tipo === 'claude' && no.agentId && (
                <Button key="ver" label="ver conversa" plain onPress={() => $.ui.view({ agentId: no.agentId! })} />
              )}
              {no.tipo !== 'nota' && <Button key="saida" label="saída" plain onPress={() => $.ui.open({ id: PANE_SAIDA, title: `palco · ${no.titulo}` })} />}
              <Button
                key="excluir"
                label="excluir"
                plain
                onPress={async () => {
                  await parar($, no.id)
                  await update($, nos, l => l.filter(n => n.id !== no.id))
                  await update($, sel, () => null)
                  await guardar($)
                }}
              />
            </Box>
          </Box>
        ) : (
          <Text dimColor>Clique num nó para editar e rodar. {f.gemini ? '' : 'Gemini CLI ausente.'}</Text>
        )}
      </Box>
    )
  })

  // Saída completa do nó selecionado.
  on('ui.render', { component: 'Pane', requestId: PANE_SAIDA }, async ($, e) => {
    const { Box, Text, Code } = $.ui.resolve(e)
    const lista = await read($, nos)
    const s = await read($, sel)
    const no = lista.find(n => n.id === s)
    if (!no) return <Text dimColor>Selecione um nó no palco.</Text>
    return (
      <Box flexDirection="column">
        <Text bold>
          {SIMBOLO[no.status]} {no.titulo} · {no.status}
        </Text>
        {no.saida ? <Code source={no.saida.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')} /> : <Text dimColor>Sem saída ainda.</Text>}
      </Box>
    )
  })
}
