/** O rascunho antes da última reescrita, para o "desfazer"; null quando não há. */
export type PromptOriginal = string | null

declare module 'claude-code' {
  interface PluginState {
    'prompt-master': {
      ocupado: boolean
      original: PromptOriginal
      auto: boolean
      /** Aviso curto no lugar do botão (ex.: "Sem contexto"); '' quando não há. */
      aviso: string
      /** Quadro da animação de carregando: 1, 2 ou 3 pontinhos. */
      pontos: number
    }
  }
}
