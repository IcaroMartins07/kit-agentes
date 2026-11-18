export type Change = { file: string; diff: string }
export type AgentStatus = 'running' | 'waiting' | 'done' | 'failed'
/** Passos concluídos de um plano (TodoWrite ou a lista de tarefas do app); null quando não há plano. */
export type Plan = { done: number; total: number } | null
export type Agent = {
  id: string
  name: string
  type: string
  doing: string
  status: AgentStatus
  changes: Change[]
  /** $.clock.now() de quando começou a rodar (para o principal: o turno atual). */
  startedAt: number
  /** Quando parou; 0 enquanto roda. */
  endedAt: number
  tokens: number
  plan: Plan
  /** Quem o chamou: o id do agente pai; '' quando foi o Claude principal. */
  parentId: string
  /** Onde o agente está agora: o arquivo (relativo à pasta da sessão) que lê ou edita; '' quando nenhum. */
  where: string
  whereKind: 'read' | 'write' | ''
}
export type GraphNode = { x: number; y: number; z: number; c: number; d: number }
export type Graph = {
  nodes: GraphNode[]
  edges: [number, number][]
  communities: { name: string; count: number }[]
  total: { nodes: number; links: number; communities: number }
}

/** Um item do gerenciador: uma skill pessoal, um plugin ou um mod (plugin com módulo de hooks). */
export type Item = {
  tipo: 'skill' | 'plugin' | 'mod'
  /** A pasta da skill, ou o id do plugin (`nome@marketplace`). */
  id: string
  nome: string
  descricao: string
  ativo: boolean
  /** O escopo do plugin (user, project, local); `user` nas skills. */
  escopo: string
  /** A pasta do projeto de um plugin de escopo local ou de projeto; vazio nos outros. */
  projeto: string
}

export type Gestor = { itens: Item[]; carregando: boolean; erro: string; ocupado: string[] }

export type OrcaAgent = { key: string; type: string; state: string; name: string; doing: string; terminal: string }
export type OrcaTerminal = { handle: string; title: string; agentType: string; agentName: string; lastOutputAt: number }
export type OrcaWorktree = { id: string; name: string; repo: string; path: string; branch: string; status: string; terminals: number; preview: string; agents: OrcaAgent[]; terms: OrcaTerminal[] }
export type OrcaView = { at: number; worktrees: OrcaWorktree[] }

declare module 'claude-code' {
  interface PluginState {
    'painel-agentes': {
      agents: Shaped<Agent[]>
      expanded: string
      graph: Shaped<Graph | null>
      graphError: string
      now: number
      tab: 'agentes' | 'arquivos' | 'alteracoes' | 'cerebro' | 'orca' | 'skill'
      /** O que a aba Skill mostra: skills, plugins e mods, cada um ligado ou não. */
      gestor: Shaped<Gestor>
      /** git status --porcelain do worktree: código (M, A, D, ??) e caminho. */
      worktree: Shaped<{ code: string; path: string }[]>
      /** Pastas abertas na árvore da aba Arquivos, relativas à pasta da sessão. */
      treeOpen: string[]
      /** Arquivos que os agentes leram ou escreveram nesta sessão (escrever vence ler). */
      touched: Shaped<{ path: string; kind: 'read' | 'write' }[]>
      /** O que o Orca mostra: worktrees e os agentes de cada um (Claude, Codex, Antigravity...). */
      orca: Shaped<OrcaView | null>
      orcaError: string
      /** A logo do Orca, lida do arquivo do mod. */
      orcaLogo: string
      /** O worktree ou agente aberto no painel Orca; '' quando nenhum. */
      orcaOpen: string
      orcaWide: boolean
      /** Worktree e terminal escolhidos no painel Orca, e a tela desse terminal. */
      orcaSel: string
      orcaTerm: string
      orcaScreen: Shaped<{ handle: string; status: string; lines: string[] } | null>
      graphHtml: string
    }
  }
}
