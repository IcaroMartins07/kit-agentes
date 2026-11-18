// Os mascotes dos agentes: o Claude em pixel art (corpo laranja, olhos, braços e quatro perninhas), cada um com o
// acessório da sua função. Dados puros, sem `$`. Sprites de 14 x 14, '.' é transparente.

export const G = 14

export const PALETTE: Record<string, number> = {
  o: 0xe8742c, // o Claude
  k: 0x1a1a1a, // olhos, óculos escuros
  d: 0x5a4632, // madeira, couro
  l: 0xe8e0d0, // papel
  w: 0xffffff,
  g: 0x9a958a, // cinza
  s: 0xb8bcc4, // aço
  b: 0x5b8def, // azul
  c: 0x2fb5c9, // ciano
  y: 0xe8b84a, // dourado
  t: 0xc8a46a, // cáqui
  G: 0x3fb950, // verde
  r: 0xd94a3a, // vermelho
  m: 0x8e2a4a, // vinho
  n: 0x4a5060, // moletom cinza-grafite (visível no fundo escuro)
}

type Pinta = (x0: number, x1: number, y0: number, y1: number, c: string) => void
type Ponto = (pts: ReadonlyArray<readonly [number, number]>, c: string) => void

// O Claude de base e, por cima, o acessório.
function claude(enfeite: (p: Pinta, ponto: Ponto) => void): string[] {
  const g = Array.from({ length: G }, () => Array.from({ length: G }, () => '.'))
  const p: Pinta = (x0, x1, y0, y1, c) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y]?.[x] !== undefined) g[y]![x] = c
  }
  const ponto: Ponto = (pts, c) => { for (const [x, y] of pts) p(x, x, y, y, c) }
  p(3, 10, 4, 10, 'o') // corpo
  p(1, 12, 7, 8, 'o') // braços
  p(5, 5, 5, 6, 'k') // olho esquerdo
  p(8, 8, 5, 6, 'k') // olho direito
  for (const x of [3, 5, 8, 10]) p(x, x, 11, 12, 'o') // pernas
  enfeite(p, ponto)
  return g.map(r => r.join(''))
}

export const SPRITES = {
  // O Claude principal: o chefe, de coroa.
  claude: claude((p, ponto) => {
    p(3, 10, 3, 3, 'y')
    p(3, 3, 1, 2, 'y')
    p(6, 7, 0, 2, 'y')
    p(10, 10, 1, 2, 'y')
    ponto([[6, 3], [7, 3]], 'r')
  }),
  // O maestro: gravata-borboleta vermelha, batuta e uma nota musical.
  maestro: claude((p, ponto) => {
    ponto([[5, 9], [5, 10], [6, 9], [7, 9], [8, 9], [8, 10]], 'r') // gravata-borboleta
    ponto([[12, 6], [13, 5]], 'g')
    ponto([[13, 4]], 'w')
    ponto([[2, 0], [2, 1], [2, 2], [3, 0], [1, 3], [2, 3]], 'y')
  }),
  // Dev: hacker de moletom com capuz, óculos escuros e código verde no ar.
  hacker: claude((p, ponto) => {
    p(3, 10, 3, 3, 'n')
    p(2, 2, 3, 6, 'n')
    p(11, 11, 3, 6, 'n')
    p(4, 9, 5, 5, 'k')
    p(4, 6, 5, 6, 'k')
    p(7, 9, 5, 6, 'k')
    ponto([[5, 5], [8, 5]], 'G')
    ponto([[12, 0], [13, 1], [12, 2], [13, 3]], 'G')
  }),
  // Design: boina vinho, pincel com tinta azul e respingos de tinta.
  design: claude((p, ponto) => {
    p(2, 9, 3, 3, 'm')
    p(3, 8, 2, 2, 'm')
    ponto([[6, 1]], 'm')
    ponto([[12, 6], [12, 5]], 'd')
    ponto([[13, 4]], 's')
    ponto([[13, 3]], 'b')
    ponto([[0, 10], [1, 11]], 'b')
    ponto([[0, 12]], 'y')
    ponto([[13, 10]], 'r')
  }),
  // Explore: chapéu de safári e lupa.
  explore: claude((p, ponto) => {
    p(2, 11, 3, 3, 't')
    p(4, 9, 1, 2, 't')
    p(4, 9, 2, 2, 'd')
    ponto([[12, 3], [11, 4], [13, 4], [12, 5]], 's')
    ponto([[12, 4]], 'b')
    ponto([[12, 6]], 'd')
  }),
  // Plan: óculos e prancheta com um item marcado.
  plan: claude((p, ponto) => {
    p(4, 9, 5, 5, 'g')
    ponto([[5, 5], [8, 5]], 'k')
    p(0, 2, 5, 10, 'l')
    ponto([[1, 4]], 'g')
    ponto([[0, 7], [1, 7], [0, 9], [1, 9]], 'g')
    ponto([[2, 7]], 'G')
  }),
  // Review: monóculo dourado e um visto verde.
  revisor: claude((_p, ponto) => {
    ponto([[8, 4], [7, 5], [9, 5], [7, 6], [9, 6], [8, 7]], 'y')
    ponto([[5, 2], [6, 3], [7, 2], [8, 1], [9, 0]], 'G')
  }),
  // Segurança: elmo de cavaleiro com pluma e escudo.
  seguranca: claude((p, ponto) => {
    p(3, 10, 2, 4, 's')
    ponto([[6, 0], [7, 0], [7, 1], [8, 1]], 'r')
    p(0, 2, 6, 10, 'b')
    ponto([[1, 11]], 'b')
    ponto([[1, 7], [1, 8], [1, 9], [0, 8], [2, 8]], 'w')
  }),
  // QA: rede que pegou uma joaninha (o bug).
  qa: claude((_p, ponto) => {
    ponto([[12, 6], [12, 5], [12, 4]], 'd')
    ponto([[11, 1], [12, 0], [13, 1], [11, 2], [13, 2], [12, 3]], 'w')
    ponto([[12, 1]], 'r')
    ponto([[12, 2]], 'k')
  }),
  // Docs: pena e pergaminho.
  docs: claude((p, ponto) => {
    p(0, 2, 5, 10, 'l')
    p(0, 2, 5, 5, 't')
    p(0, 2, 10, 10, 't')
    ponto([[0, 7], [1, 7], [0, 8], [1, 8]], 'g')
    ponto([[12, 6]], 'k')
    ponto([[12, 5], [13, 4], [13, 3], [13, 2]], 'w')
  }),
  // DevOps: capacete de obra e chave inglesa.
  devops: claude((p, ponto) => {
    p(4, 9, 1, 2, 'y')
    p(2, 11, 3, 3, 'y')
    ponto([[12, 6], [12, 5], [12, 4]], 's')
    ponto([[11, 2], [11, 3], [13, 2], [13, 3], [12, 3]], 's')
  }),
  // Dados: gráfico de barras subindo.
  dados: claude((p) => {
    p(11, 11, 2, 3, 'b')
    p(12, 12, 1, 3, 'G')
    p(13, 13, 0, 3, 'y')
  }),
  // Banco de dados: o cilindro.
  db: claude((p) => {
    p(0, 2, 6, 10, 'b')
    p(0, 2, 6, 6, 'c')
    p(0, 2, 8, 8, 'c')
  }),
  // Mobile: celular na mão.
  mobile: claude((p) => {
    p(12, 13, 3, 7, 'k')
    p(12, 13, 4, 5, 'c')
  }),
  // Os outros: fone de ouvido, pronto para ajudar.
  padrao: claude((p, ponto) => {
    ponto([[3, 3], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 3]], 'k')
    p(2, 2, 4, 6, 'k')
    p(11, 11, 4, 6, 'k')
  }),
} satisfies Record<string, string[]>

export type Mascote = keyof typeof SPRITES

// A função pelo tipo do agente; se o tipo não disser, pelo nome. A ordem importa: segurança antes de revisão, QA antes
// de design (qa-ui), e os devs específicos antes do hacker genérico.
const REGRAS: ReadonlyArray<readonly [RegExp, Mascote]> = [
  [/maestro|orquestr/, 'maestro'],
  [/seguran|security/, 'seguranca'],
  [/revis|review|audit|verif|fatos/, 'revisor'],
  [/\bqa\b|qa-|teste|test|e2e|regress/, 'qa'],
  [/explore|search|pesquis/, 'explore'],
  [/plan/, 'plan'],
  [/devops|deploy|infra/, 'devops'],
  [/docs|\bdoc\b|guide|guia|escrit|writer/, 'docs'],
  [/dados|data|analy|anali/, 'dados'],
  [/\bdb\b|banco|sql|database/, 'db'],
  [/mobile|android|\bios\b/, 'mobile'],
  [/front|design|\bui\b|\bux\b/, 'design'],
  [/\bdev\b|dev-|back|engineer|hack|coder|programa/, 'hacker'],
]

const pelo = (texto: string): Mascote | undefined => REGRAS.find(([re]) => re.test(texto.toLowerCase()))?.[1]

export function mascoteDe(tipo: string, nome: string, isMain = false): Mascote {
  if (isMain) return 'claude'
  return pelo(tipo) ?? pelo(nome) ?? 'padrao'
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

// O desenho em Svg, de `size` px (a grade de 14 cabe nele, pixels nítidos). Com `tile`, o mascote fica num ladrilho
// arredondado, cinza translúcido (aparece no tema claro e no escuro), com 2 pixels de respiro em volta.
export function spriteSvg(rows: readonly string[], size: number, tile = false): string {
  const rects = rows
    .flatMap((row, y) => [...row].map((ch, x) => (PALETTE[ch] !== undefined ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${hex(PALETTE[ch]!)}"/>` : '')))
    .join('')
  const m = tile ? 2 : 0
  const fundo = tile ? `<rect x="${-m}" y="${-m}" width="${G + 2 * m}" height="${G + 2 * m}" rx="3.5" fill="#808080" fill-opacity="0.16" shape-rendering="geometricPrecision"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m} ${-m} ${G + 2 * m} ${G + 2 * m}" width="${size}" height="${size}" shape-rendering="crispEdges">${fundo}${rects}</svg>`
}
