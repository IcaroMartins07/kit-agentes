export type Tipo = 'nota' | 'claude' | 'codex' | 'gemini' | 'cmd'
export type Status = 'parado' | 'rodando' | 'ok' | 'falhou' | 'bloqueado'

/** Um nó do canvas: posição em células no plano virtual, o que roda e o que saiu. */
export type No = {
  id: string
  tipo: Tipo
  titulo: string
  x: number
  y: number
  w: number
  h: number
  /** Prompt (agentes), linha de comando (cmd) ou texto (nota). */
  texto: string
  /** Tipo de subagente quando o nó é Claude (general-purpose, modo-deus:revisor...). */
  agente: string
  status: Status
  saida: string
  agentId?: string
}

/** Deslocamento do canvas (pan), em células. */
export type Vista = { px: number; py: number }

/** O que existe na máquina para rodar os nós. */
export type Ferramentas = { codex: boolean; gemini: boolean; shell: 'bash' | 'cmd' }

declare module 'claude-code' {
  interface PluginState {
    palco: {
      nos: Shaped<No[]>
      vista: Vista
      sel: string | null
      ferramentas: Ferramentas
    }
  }
}
