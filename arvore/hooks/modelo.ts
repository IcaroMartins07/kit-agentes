// Lógica pura da árvore: caminhos, toques e as linhas a desenhar. Sem `$`.
import type { Entrada, Toque } from '../types'

export const FORA = '(fora do projeto)'
export const MAX_LINHAS = 500
export const MAX_POR_PASTA = 300

/** Pastas que nunca são listadas: pesadas e sem interesse para seguir o Claude. */
export const IGNORADAS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', 'coverage',
  '.venv', 'venv', '__pycache__', '.pytest_cache', 'target', '.turbo', '.cache', 'graphify-out',
])

const barra = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
const windows = (p: string) => /^[A-Za-z]:\//.test(p)

/**
 * Caminho relativo à raiz do projeto, com "/", ou `${FORA}/<absoluto>` quando está fora.
 * No Windows a comparação ignora maiúsculas.
 */
export function relativo(raiz: string, caminho: string): string {
  const r = barra(raiz)
  let c = barra(caminho)
  if (!c) return ''
  if (!c.startsWith('/') && !windows(c)) c = `${r}/${c.replace(/^\.\//, '')}`
  const igual = (a: string, b: string) => (windows(r) ? a.toLowerCase() === b.toLowerCase() : a === b)
  if (igual(c, r)) return ''
  const prefixo = c.slice(0, r.length + 1)
  if (igual(prefixo, r + '/')) return c.slice(r.length + 1)
  return `${FORA}/${c}`
}

/** Pastas acima de um caminho relativo: "a/b/c.ts" -> ["a", "a/b"]. */
export function ancestrais(rel: string): string[] {
  const partes = rel.split('/')
  const out: string[] = []
  for (let i = 1; i < partes.length; i++) out.push(partes.slice(0, i).join('/'))
  return out
}

export type Tipo = 'lido' | 'editado' | 'buscado'

export function tocar(atual: Toque | undefined, tipo: Tipo, em: number, por: string): Toque {
  const t = atual ?? { lido: 0, editado: 0, buscado: 0, em: 0, por }
  return { ...t, [tipo]: t[tipo] + 1, em, por }
}

/** Uma linha da árvore pronta para desenhar. */
export type Linha = {
  caminho: string
  nome: string
  nivel: number
  pasta: boolean
  aberta: boolean
  toque?: Toque
  /** Algum arquivo dentro desta pasta foi tocado. */
  temToque: boolean
}

const ordenar = (a: { nome: string; pasta: boolean }, b: { nome: string; pasta: boolean }) =>
  a.pasta === b.pasta ? a.nome.localeCompare(b.nome) : a.pasta ? -1 : 1

/** Modo "tocados": só os caminhos tocados e as pastas acima deles, tudo aberto. */
export function linhasTocados(toques: Record<string, Toque>): Linha[] {
  const pastas = new Set<string>()
  for (const rel of Object.keys(toques)) for (const a of ancestrais(rel)) pastas.add(a)
  const filhos = new Map<string, { nome: string; pasta: boolean; caminho: string }[]>()
  const pai = (c: string) => (c.includes('/') ? c.slice(0, c.lastIndexOf('/')) : '')
  const nome = (c: string) => c.slice(c.lastIndexOf('/') + 1)
  for (const p of pastas) {
    const k = pai(p)
    filhos.set(k, [...(filhos.get(k) ?? []), { nome: nome(p), pasta: true, caminho: p }])
  }
  for (const rel of Object.keys(toques)) {
    if (pastas.has(rel)) continue // tocado como pasta (Grep/Glob numa pasta): já é linha
    const k = pai(rel)
    filhos.set(k, [...(filhos.get(k) ?? []), { nome: nome(rel), pasta: false, caminho: rel }])
  }
  const out: Linha[] = []
  const descer = (dir: string, nivel: number) => {
    for (const f of [...(filhos.get(dir) ?? [])].sort(ordenar)) {
      if (out.length >= MAX_LINHAS) return
      out.push({ caminho: f.caminho, nome: f.nome, nivel, pasta: f.pasta, aberta: f.pasta, toque: toques[f.caminho], temToque: true })
      if (f.pasta) descer(f.caminho, nivel + 1)
    }
  }
  descer('', 0)
  return out
}

/** Modo "árvore": pastas listadas, abertas as que o usuário abriu ou que contêm algo tocado. */
export function linhasArvore(listas: Record<string, Entrada[]>, abertos: readonly string[], toques: Record<string, Toque>): Linha[] {
  const comToque = new Set<string>()
  for (const rel of Object.keys(toques)) for (const a of ancestrais(rel)) comToque.add(a)
  const aberto = new Set(abertos)
  const out: Linha[] = []
  const descer = (dir: string, nivel: number) => {
    const entradas = [...(listas[dir] ?? [])].sort(ordenar)
    for (const e of entradas) {
      if (out.length >= MAX_LINHAS) return
      const caminho = dir ? `${dir}/${e.nome}` : e.nome
      const abre = e.pasta && (aberto.has(caminho) || comToque.has(caminho))
      out.push({ caminho, nome: e.nome, nivel, pasta: e.pasta, aberta: abre, toque: toques[caminho], temToque: comToque.has(caminho) || !!toques[caminho] })
      if (abre) descer(caminho, nivel + 1)
    }
  }
  descer('', 0)
  return out
}

/** Entradas de uma listagem, sem as pastas ignoradas e limitadas. */
export function filtrarLista(entradas: readonly { name: string; kind: string }[]): Entrada[] {
  return entradas
    .filter(e => (e.kind === 'file' || e.kind === 'dir') && !(e.kind === 'dir' && IGNORADAS.has(e.name)))
    .slice(0, MAX_POR_PASTA)
    .map(e => ({ nome: e.name, pasta: e.kind === 'dir' }))
}

/** Marca curta do toque: o que aconteceu com o arquivo nesta sessão. */
export function marca(t: Toque | undefined): string {
  if (!t) return ''
  const partes: string[] = []
  if (t.editado) partes.push(`✎${t.editado > 1 ? t.editado : ''}`)
  if (t.lido) partes.push(`◉${t.lido > 1 ? t.lido : ''}`)
  if (t.buscado) partes.push(`⌕${t.buscado > 1 ? t.buscado : ''}`)
  return partes.join(' ')
}
