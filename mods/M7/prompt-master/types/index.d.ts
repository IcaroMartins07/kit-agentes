/** O rascunho antes da última reescrita, para o "desfazer"; null quando não há. */
export type PromptOriginal = string | null

declare module 'claude-code' {
  interface PluginState {
    'prompt-master': {
      ocupado: boolean
      original: PromptOriginal
      auto: boolean
    }
  }
}
