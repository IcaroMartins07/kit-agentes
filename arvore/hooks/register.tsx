// arvore: árvore de arquivos do projeto ao lado do chat, marcando em tempo real o que o Claude
// e os subagentes leem (◉), buscam (⌕) e editam (✎). O último toque fica destacado.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Entrada, Modo, Toque } from '../types'
import { FORA, ancestrais, filtrarLista, linhasArvore, linhasTocados, marca, relativo, tocar } from './modelo'
import type { Linha, Tipo } from './modelo'

const PANE = 'arvore'

const toques = atom({ plugin: 'arvore', key: 'toques' } as const, {}, { shape: 'toques-1' })
const ultimo = atom({ plugin: 'arvore', key: 'ultimo' } as const, null)
const modo = atom({ plugin: 'arvore', key: 'modo' } as const, 'tocados')
const abertos = atom({ plugin: 'arvore', key: 'abertos' } as const, [], { shape: 'abertos-1' })
const listas = atom({ plugin: 'arvore', key: 'listas' } as const, {}, { shape: 'listas-1' })

let raiz = ''

// Ferramenta → que tipo de toque e de onde vem o caminho.
const TOQUES: Record<string, { tipo: Tipo; campo: string }> = {
  Read: { tipo: 'lido', campo: 'file_path' },
  Edit: { tipo: 'editado', campo: 'file_path' },
  MultiEdit: { tipo: 'editado', campo: 'file_path' },
  Write: { tipo: 'editado', campo: 'file_path' },
  NotebookEdit: { tipo: 'editado', campo: 'notebook_path' },
  Grep: { tipo: 'buscado', campo: 'path' },
  Glob: { tipo: 'buscado', campo: 'path' },
}

async function carregar($: EngineInterface, dir: string): Promise<void> {
  if (!raiz || dir.startsWith(FORA)) return
  const ja = await read($, listas)
  if (ja[dir]) return
  try {
    const entradas = await $.fs.list(dir ? `${raiz}/${dir}` : raiz)
    const filtradas: Entrada[] = filtrarLista(entradas)
    await update($, listas, l => ({ ...l, [dir]: filtradas }))
  } catch {
    await update($, listas, l => ({ ...l, [dir]: [] }))
  }
}

async function abrirPainel($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: 'arquivos' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    raiz = e.cwd.replace(/\\/g, '/').replace(/\/+$/, '')
    await $.command.register({ name: 'arvore', description: 'Mostra a árvore do projeto e por onde o Claude está andando no código' })
    void abrirPainel($)
    return started
  })

  on('command.run', { command: 'arvore' }, async $ => {
    await abrirPainel($)
    return { text: 'árvore aberta.' }
  })

  // Toda chamada de ferramenta, da sessão e dos subagentes: o que deu certo vira toque.
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    const regra = TOQUES[e.tool]
    if (!regra || r.deny !== undefined || r.isError === true || !raiz) return r
    const caminho = (e as unknown as Record<string, unknown>)[regra.campo]
    // Grep/Glob sem path buscam na raiz: conta como busca no projeto inteiro, sem linha própria.
    if (typeof caminho !== 'string' || !caminho.trim()) return r
    const rel = relativo(raiz, caminho)
    if (!rel) return r
    // Só observa: uma falha aqui nunca muda o resultado da ferramenta.
    try {
      const em = await $.clock.now()
      const por = e.agentId ?? 'principal'
      await update($, toques, t => ({ ...t, [rel]: tocar(t[rel], regra.tipo, em, por) }))
      await update($, ultimo, () => rel)
      if ((await read($, modo)) === 'arvore') {
        await carregar($, '')
        for (const a of ancestrais(rel)) await carregar($, a)
      }
    } catch {
      // painel desatualizado é melhor que ferramenta quebrada
    }
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const t = await read($, toques)
    const m: Modo = await read($, modo)
    const u = await read($, ultimo)
    const linhas: Linha[] = m === 'tocados' ? linhasTocados(t) : linhasArvore(await read($, listas), await read($, abertos), t)
    const vals = Object.values(t)
    const editados = vals.filter(x => x.editado).length
    const lidos = vals.filter(x => x.lido).length
    const buscas = vals.filter(x => x.buscado).length

    const trocarModo = async () => {
      const novo: Modo = m === 'tocados' ? 'arvore' : 'tocados'
      await update($, modo, () => novo)
      if (novo === 'arvore') {
        await carregar($, '')
        for (const rel of Object.keys(t)) for (const a of ancestrais(rel)) await carregar($, a)
      }
    }

    const cor = (x: Toque | undefined) => (!x ? undefined : x.editado ? 'yellow' : x.lido ? 'cyan' : 'blue')
    const recuo = (n: number) => '  '.repeat(n)

    const linha = (l: Linha) => {
      const atual = l.caminho === u
      const rotulo = `${recuo(l.nivel)}${l.pasta ? (l.aberta ? '▾ ' : '▸ ') : '  '}${l.nome}${l.pasta ? '/' : ''}`
      const fim = `${marca(l.toque)}${atual ? '  ◀ agora' : ''}${l.toque && l.toque.por !== 'principal' ? '  (subagente)' : ''}`
      if (l.pasta && m === 'arvore') {
        return (
          <Button
            key={`d-${l.caminho}`}
            label={`${rotulo}${fim ? '  ' + fim : ''}`}
            plain
            onPress={async () => {
              const lista = await read($, abertos)
              if (lista.includes(l.caminho)) await update($, abertos, a => a.filter(x => x !== l.caminho))
              else {
                await update($, abertos, a => [...a, l.caminho])
                await carregar($, l.caminho)
              }
            }}
          />
        )
      }
      return (
        <Box key={`f-${l.caminho}`} flexDirection="row">
          <Text wrap="truncate-end" bold={l.pasta && l.temToque} dimColor={!l.temToque && !l.toque} color={atual ? 'magenta' : cor(l.toque)}>
            {rotulo}
          </Text>
          {fim ? <Text color={atual ? 'magenta' : cor(l.toque)}>{'  ' + fim}</Text> : null}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="modo" label={m === 'tocados' ? 'ver árvore inteira' : 'ver só tocados'} plain onPress={trocarModo} />
          <Button
            key="limpar"
            label="limpar"
            plain
            onPress={async () => {
              await update($, toques, () => ({}))
              await update($, ultimo, () => null)
            }}
          />
        </Box>
        <Text dimColor wrap="truncate-end">
          ✎ {editados} editados · ◉ {lidos} lidos · ⌕ {buscas} buscas{u ? ` · agora: ${u}` : ''}
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {linhas.length === 0 ? (
            <Text dimColor>
              {m === 'tocados' ? 'Nada tocado ainda. Os arquivos aparecem aqui quando o Claude lê, busca ou edita.' : 'Carregando a pasta do projeto...'}
            </Text>
          ) : (
            linhas.map(linha)
          )}
        </Box>
      </Box>
    )
  })
}
