import type { makeColors } from './make-colors.js'

export type NomeTema = 'cafe' | 'noite' | 'floresta' | 'neon' | 'papel'

export type Paleta = {
  nome: string
  descricao: string
  def: Parameters<typeof makeColors>[0]
}

export const PALETAS: Record<NomeTema, Paleta>
export const ORDEM: readonly NomeTema[]
