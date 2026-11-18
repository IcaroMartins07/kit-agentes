/** Nome da paleta aplicada (chave de PALETAS), ou null para o tema do app. */
export type TemaAtual = string | null

declare module 'claude-code' {
  interface PluginState {
    temas: {
      atual: TemaAtual
    }
  }
}
