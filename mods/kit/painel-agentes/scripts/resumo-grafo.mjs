// Resume o graph.json do graphify (pode passar de 4 MiB, o teto do $.fs.read)
// num JSON pequeno: os nós de maior grau numa esfera, as arestas entre eles e as maiores comunidades.
import { readFileSync } from 'node:fs'

const MAX_NOS = 90
const MAX_ARESTAS = 260

const g = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const links = g.links ?? g.edges ?? []
const grau = new Map()
for (const l of links) {
  grau.set(l.source, (grau.get(l.source) ?? 0) + 1)
  grau.set(l.target, (grau.get(l.target) ?? 0) + 1)
}

const porComunidade = new Map()
for (const n of g.nodes) {
  const nome = n.community_name ?? String(n.community ?? '?')
  porComunidade.set(nome, (porComunidade.get(nome) ?? 0) + 1)
}
const comunidades = [...porComunidade].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
const ordem = new Map(comunidades.map((c, i) => [c.name, i]))

// Ordena por comunidade para que cada uma fique numa faixa da esfera.
const top = [...g.nodes]
  .sort((a, b) => (grau.get(b.id) ?? 0) - (grau.get(a.id) ?? 0))
  .slice(0, MAX_NOS)
  .map(n => ({ id: n.id, c: ordem.get(n.community_name ?? String(n.community ?? '?')) ?? 99, d: grau.get(n.id) ?? 0 }))
  .sort((a, b) => a.c - b.c)

const indice = new Map(top.map((n, i) => [n.id, i]))
const ouro = Math.PI * (3 - Math.sqrt(5))
const nodes = top.map((n, i) => {
  const y = 1 - (2 * (i + 0.5)) / top.length
  const r = Math.sqrt(1 - y * y)
  const t = ouro * i
  const f = v => Math.round(v * 1000) / 1000
  return { x: f(Math.cos(t) * r), y: f(y), z: f(Math.sin(t) * r), c: Math.min(n.c, 9), d: n.d }
})

const vistas = new Set()
const edges = []
for (const l of links) {
  const a = indice.get(l.source), b = indice.get(l.target)
  if (a === undefined || b === undefined || a === b) continue
  const k = a < b ? `${a}-${b}` : `${b}-${a}`
  if (vistas.has(k)) continue
  vistas.add(k)
  edges.push([a, b])
  if (edges.length >= MAX_ARESTAS) break
}
// Grafo esparso entre os hubs: liga cada nó sem aresta ao vizinho mais próximo na esfera, para formar a rede.
const temAresta = new Set(edges.flat())
nodes.forEach((n, i) => {
  if (temAresta.has(i) || edges.length >= MAX_ARESTAS) return
  let melhor = -1, dist = Infinity
  nodes.forEach((m, j) => {
    if (j === i) return
    const d = (n.x - m.x) ** 2 + (n.y - m.y) ** 2 + (n.z - m.z) ** 2
    if (d < dist) { dist = d; melhor = j }
  })
  if (melhor >= 0) edges.push([i, melhor])
})

process.stdout.write(JSON.stringify({
  nodes,
  edges,
  communities: comunidades.slice(0, 6),
  total: { nodes: g.nodes.length, links: links.length, communities: comunidades.length },
}))
