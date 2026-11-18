import type { ThemeBackdropGlass } from 'claude-code'

import type { makeColors } from './make-colors.js'

export type NomeTema = 'dunas' | 'kit' | 'cafe' | 'noite' | 'floresta' | 'neon' | 'papel'

export type Paleta = {
  nome: string
  descricao: string
  def: Parameters<typeof makeColors>[0]
  /** Cena de fundo desenhada atrás da conversa (ver dither-dunes.ts); sem ela, o fundo é o da paleta. */
  cena?: string
  /** O vidro dos painéis do app por cima da cena. */
  vidro?: ThemeBackdropGlass
  /** O modo para o qual a cena foi feita, quando ela serve só a um. */
  esquema?: 'light' | 'dark'
}

export const PALETAS: Record<NomeTema, Paleta>
export const ORDEM: readonly NomeTema[]
