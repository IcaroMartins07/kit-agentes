// Regras puras do Prompt Master: o que reescrever e como limpar a resposta do modelo. Sem `$`.

export const SISTEMA = [
  'Você reescreve prompts que uma pessoa vai mandar para o Claude Code, um agente de programação.',
  'Objetivo: o mesmo pedido, mais claro e acionável. Nunca responda ao pedido; só reescreva.',
  '',
  'Regras:',
  '- Mantenha o idioma da pessoa.',
  '- Mantenha a intenção, todos os fatos, nomes de arquivos, caminhos, comandos, trechos de código, números e restrições exatamente como vieram.',
  '- Não invente requisito, tecnologia, arquivo nem contexto que não esteja no texto. Se algo essencial faltar, acrescente no fim uma linha "Se faltar informação, pergunte antes sobre: ..." em vez de supor.',
  '- Quando ajudar, organize em: objetivo; contexto; o que fazer (passos ou requisitos); restrições; como saber que terminou (critério verificável).',
  '- Pedido curto e já claro continua curto: não infle.',
  '- Sem preâmbulo, sem comentário, sem aspas e sem bloco de código em volta: devolva só o prompt reescrito.',
].join('\n')

export const MIN_CARACTERES = 20

/** O modo automático só reescreve o que a pessoa digitou, que não seja comando nem pedido curtinho. */
export function deveReescrever(e: { text: string; command?: unknown; origin?: { kind?: string } }): boolean {
  if (e.origin?.kind !== 'composer') return false
  if (e.command) return false
  const t = e.text.trim()
  if (t.length < MIN_CARACTERES) return false
  if (t.startsWith('/') || t.startsWith('!') || t.startsWith('#')) return false
  return true
}

/** Tira o que o modelo às vezes põe em volta: cercas de código, aspas, rótulos. */
export function limpar(resposta: string): string {
  let t = resposta.trim()
  const cerca = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/)
  if (cerca?.[1] !== undefined) t = cerca[1].trim()
  t = t.replace(/^(prompt reescrito|prompt|reescrito)\s*:\s*/i, '')
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('“') && t.endsWith('”'))) t = t.slice(1, -1).trim()
  return t
}

export const MODELOS = ['sonnet', 'haiku', 'opus'] as const
export type Modelo = (typeof MODELOS)[number]
export const modeloDe = (v: unknown): Modelo => (MODELOS.includes(v as Modelo) ? (v as Modelo) : 'sonnet')

// Rótulo do botão enquanto reescreve: 1 a 3 pontinhos, completados com espaços fixos para o botão não pular.
export const carregando = (quadro: number) => `✦ Reescrevendo${'.'.repeat(quadro)}${' '.repeat(3 - quadro)}`
