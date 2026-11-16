/** Como um arquivo foi tocado nesta sessão. */
export type Toque = {
  lido: number
  editado: number
  buscado: number
  /** Momento do último toque (ms do relógio do engine). */
  em: number
  /** Quem tocou por último: "principal" ou o agentId do subagente. */
  por: string
}

/** Uma entrada de pasta já listada. */
export type Entrada = { nome: string; pasta: boolean }

export type Modo = 'tocados' | 'arvore'

declare module 'claude-code' {
  interface PluginState {
    arvore: {
      toques: Shaped<Record<string, Toque>>
      ultimo: string | null
      modo: Modo
      abertos: Shaped<string[]>
      listas: Shaped<Record<string, Entrada[]>>
    }
  }
}
