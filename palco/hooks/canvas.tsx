// Módulo de superfície do palco: desenha o canvas e trata ponteiro e teclado no thread de desenho.
// Sem `$`: fala com o register.tsx por `surface.post`. Autocontido de propósito (não importa nada do mod).
import type { ClientModule } from 'claude-code'

/** O que o register manda: nós já com as linhas de saída prontas para desenhar. */
type NoVisto = {
  id: string
  titulo: string
  tipo: string
  x: number
  y: number
  w: number
  h: number
  cor: string
  simbolo: string
  linhas: string[]
}
type Props = { nos: NoVisto[]; px: number; py: number; sel: string | null; vazio: string }
type Local = { modo: 'nada' | 'pan' | 'no'; id: string | null; x0: number; y0: number; dx: number; dy: number; moveu: boolean }

const PARADO: Local = { modo: 'nada', id: null, x0: 0, y0: 0, dx: 0, dy: 0, moveu: false }

const noEm = (nos: NoVisto[], x: number, y: number): NoVisto | undefined => {
  for (let i = nos.length - 1; i >= 0; i--) {
    const n = nos[i]
    if (n && x >= n.x && x < n.x + n.w && y >= n.y && y < n.y + n.h) return n
  }
  return undefined
}

const corta = (t: string, w: number) => (t.length > w ? t.slice(0, Math.max(1, w - 1)) + '…' : t)

const Canvas: ClientModule<Props, Local> = (p, s) => {
  const { Box, Text } = s.elements
  const st = s.state ?? PARADO

  s.onPointer(ev => {
    const atual = s.state ?? PARADO
    if (ev.type === 'down' && ev.button === 'left') {
      const alvo = noEm(p.nos, ev.x + p.px, ev.y + p.py)
      s.setState({ modo: alvo ? 'no' : 'pan', id: alvo?.id ?? null, x0: ev.x, y0: ev.y, dx: 0, dy: 0, moveu: false })
      return
    }
    if (ev.type === 'move' && atual.modo !== 'nada') {
      const dx = ev.x - atual.x0
      const dy = ev.y - atual.y0
      if (dx !== atual.dx || dy !== atual.dy) s.setState({ ...atual, dx, dy, moveu: atual.moveu || dx !== 0 || dy !== 0 })
      return
    }
    if (ev.type === 'up' && atual.modo !== 'nada') {
      if (!atual.moveu) s.post({ tipo: 'selecionar', id: atual.id })
      else if (atual.modo === 'no') s.post({ tipo: 'mover', id: atual.id, dx: atual.dx, dy: atual.dy })
      else s.post({ tipo: 'pan', dx: -atual.dx, dy: -atual.dy })
      s.setState(PARADO)
    }
  })

  s.onKey(k => {
    const passo = k.shift ? 10 : 3
    const mapa: Record<string, [number, number]> = { left: [-passo, 0], right: [passo, 0], up: [0, -passo], down: [0, passo] }
    const passoXY = mapa[k.key]
    if (passoXY) s.post({ tipo: 'pan', dx: passoXY[0], dy: passoXY[1] })
    else if (k.key === '0' || k.key === 'home') s.post({ tipo: 'centro' })
    else if ((k.key === 'delete' || k.key === 'backspace') && p.sel) s.post({ tipo: 'excluir', id: p.sel })
  })

  // Deslocamento ao vivo durante um arrasto, antes do register confirmar.
  const panX = p.px - (st.modo === 'pan' ? st.dx : 0)
  const panY = p.py - (st.modo === 'pan' ? st.dy : 0)
  const largura = Math.max(10, s.columns)
  const altura = Math.max(6, s.rows)

  const visiveis = p.nos
    .map(n => {
      const arrastando = st.modo === 'no' && st.id === n.id
      return { n, sx: n.x - panX + (arrastando ? st.dx : 0), sy: n.y - panY + (arrastando ? st.dy : 0) }
    })
    .filter(({ n, sx, sy }) => sx + n.w > 0 && sy + n.h > 0 && sx < largura && sy < altura)

  return (
    <Box width="100%" height={altura} position="relative" overflow="hidden">
      {p.nos.length === 0 && (
        <Box position="absolute" top={1} left={2}>
          <Text dimColor>{p.vazio}</Text>
        </Box>
      )}
      {visiveis.map(({ n, sx, sy }) => {
        const selecionado = p.sel === n.id
        const interno = Math.max(4, n.w - 4)
        return (
          <Box
            key={n.id}
            position="absolute"
            left={sx}
            top={sy}
            width={n.w}
            height={n.h}
            flexDirection="column"
            borderStyle={selecionado ? 'double' : 'round'}
            borderColor={selecionado ? 'magenta' : n.cor}
            paddingX={1}
            overflow="hidden"
          >
            <Text bold wrap="truncate-end">
              <Text color={n.cor}>{n.simbolo} </Text>
              {corta(n.titulo, interno - 2)}
            </Text>
            <Text dimColor wrap="truncate-end">
              {n.tipo}
            </Text>
            {n.linhas.slice(-(n.h - 4)).map((l, i) => (
              <Text key={`${n.id}-${i}`} wrap="truncate-end">
                {corta(l, interno)}
              </Text>
            ))}
          </Box>
        )
      })}
      <Box position="absolute" bottom={0} right={1}>
        <Text dimColor>
          {panX},{panY}
        </Text>
      </Box>
    </Box>
  )
}

export default Canvas
