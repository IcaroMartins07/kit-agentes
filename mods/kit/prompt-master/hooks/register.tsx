// Prompt Master: um botão no rodapé do prompt (ao lado do modo de edição) que reescreve o rascunho
// com um modelo e o devolve na caixa para você revisar antes de enviar. "↶ desfazer" volta ao
// original. O modo automático (/prompt-master auto on) reescreve ao enviar, só o que você digitou.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import { SISTEMA, carregando, deveReescrever, limpar, modeloDe } from './modelo'

const ocupado = atom({ plugin: 'prompt-master', key: 'ocupado' } as const, false)
const original = atom({ plugin: 'prompt-master', key: 'original' } as const, null)
const auto = atom({ plugin: 'prompt-master', key: 'auto' } as const, false)
const aviso = atom({ plugin: 'prompt-master', key: 'aviso' } as const, '')
const pontos = atom({ plugin: 'prompt-master', key: 'pontos' } as const, 1)

const CHAVE_AUTO = 'auto'

// Como no mockup: em repouso, uma borda fina na cor apagada do tema; no hover, laranja. Sem fundo. A borda existe
// sempre, então o botão não muda de tamanho no hover.
const borda = (_surface: string) => 'subtle'
const BORDA_HOVER = 'claude'

// Mostra um aviso no lugar do botão por alguns segundos, e também como toast.
async function avisar($: EngineInterface, texto: string, detalhe: string): Promise<void> {
  await update($, aviso, () => texto)
  $.ui.toast(`⚠ ${texto} · ${detalhe}`, { timeoutMs: 4000 })
  $.clock.after(3000, () => void update($, aviso, atual => (atual === texto ? '' : atual)).catch(() => undefined))
}

async function reescrever($: EngineInterface, texto: string, modelo: string): Promise<{ texto: string } | { erro: string }> {
  const r = await $.model.complete({ model: modelo, system: SISTEMA, prompt: texto, maxTokens: 2000, timeoutMs: 60000 })
  if (!r.isAnswered) {
    const status = 'status' in r && r.status ? ` ${r.status}` : ''
    return { erro: `o modelo não respondeu (${r.reason}${status})` }
  }
  const novo = limpar(r.text)
  if (!novo) return { erro: 'a resposta veio vazia' }
  return { texto: novo }
}

export const register: Register = (on, options) => {
  const modelo = modeloDe(options.modelo)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const salvo = await $.store.get(CHAVE_AUTO)
    await update($, auto, () => salvo === true)
    await $.command.register({ name: 'prompt-master', description: 'Prompt Master: /prompt-master auto on|off liga a reescrita automática ao enviar' })
    return started
  })

  on('command.run', { command: 'prompt-master' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'auto on' || arg === 'auto off') {
      const ligar = arg === 'auto on'
      await update($, auto, () => ligar)
      await $.store.set(CHAVE_AUTO, ligar)
      return { text: ligar ? 'Prompt Master automático: ligado. Cada prompt que você digitar é reescrito antes de enviar.' : 'Prompt Master automático: desligado. Use o botão para reescrever sob revisão.' }
    }
    const ligado = await read($, auto)
    return { text: `Prompt Master · modelo ${modelo} · automático ${ligado ? 'ligado' : 'desligado'}. Clique no botão ao lado do prompt para reescrever o rascunho, ou use /prompt-master auto on|off.` }
  })

  // Modo automático: reescreve o que a pessoa digitou, na hora do envio.
  on('prompt.submit', async ($, e, next) => {
    await update($, original, () => null)
    if (!(await read($, auto)) || !deveReescrever(e)) return next(e)
    try {
      const r = await reescrever($, e.text, modelo)
      if ('erro' in r) {
        $.ui.toast(`Prompt Master: ${r.erro}; enviei o original`)
        return next(e)
      }
      $.ui.toast('Prompt Master reescreveu o prompt antes de enviar')
      return next({ ...e, text: r.texto })
    } catch {
      return next(e) // falha do mod nunca segura o envio
    }
  })

  // Ao lado dos seletores de modelo e de modo, no rodapé do prompt.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const rodando = await read($, ocupado)
    const anterior = await read($, original)
    const ligado = await read($, auto)
    const alerta = await read($, aviso)
    const quadro = await read($, pontos)
    // O que o Claude Code e os outros mods desenham ali (Accept edits, focus...) continua, ao lado.
    const abaixo = await next(e)

    const clicar = async () => {
      if (await read($, ocupado)) return
      const caixa = await $.prompt.read()
      const texto = caixa.text.trim()
      if (!texto) {
        await avisar($, 'Sem contexto', 'escreva no prompt o que você quer antes de usar o Prompt Master')
        return
      }
      await update($, aviso, () => '')
      await update($, ocupado, () => true)
      // Animação de carregando: 1, 2, 3 pontinhos enquanto o modelo responde.
      const anima = $.clock.every(400, () => void update($, pontos, n => (n % 3) + 1).catch(() => undefined))
      try {
        const r = await reescrever($, texto, modelo)
        if ('erro' in r) {
          await avisar($, 'Não deu para reescrever', r.erro)
          return
        }
        await update($, original, () => caixa.text)
        await $.prompt.fill({ text: r.texto, mode: 'replace' })
        $.ui.toast('✦ Prompt reescrito: revise e envie (↶ desfaz)')
      } catch (x) {
        await avisar($, 'Prompt Master falhou', String((x as Error)?.message ?? x))
      } finally {
        anima.cancel()
        await update($, pontos, () => 1)
        await update($, ocupado, () => false)
      }
    }

    // Do tamanho dos seletores de modelo: sem padding extra e sem fundo. Nenhum botão tem hover (as cores não se
    // invertem sob o mouse); o único hover é a borda laranja do Prompt Master. Com aviso, a borda fica na cor de
    // alerta do tema até o aviso sumir.
    const pilula = (chave: string, filho: RenderChildren, cor?: 'warning', temHover?: true) => (
      <Box
        key={`${chave}-caixa`}
        borderStyle="round"
        borderColor={cor ?? borda(e.surface)}
        hover={temHover ? { borderColor: BORDA_HOVER } : undefined}
      >
        {filho}
      </Box>
    )
    const SEM_HOVER = { inverse: false }

    const rotulo = rodando ? carregando(quadro) : ligado ? '✦ Prompt Master · auto' : '✦ Prompt Master'

    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        {alerta && !rodando
          ? pilula(
              'prompt-master',
              <Button key="prompt-master" plain hover={SEM_HOVER} onPress={clicar}>
                <Text color="warning" bold>⚠ {alerta}</Text>
              </Button>,
              'warning',
            )
          : pilula('prompt-master', <Button key="prompt-master" plain hover={SEM_HOVER} label={rotulo} onPress={clicar} />, undefined, true)}
        {anterior !== null &&
          pilula(
            'prompt-master-desfazer',
            <Button
              key="prompt-master-desfazer"
              label="↶"
              plain
              hover={SEM_HOVER}
              onPress={async () => {
                await $.prompt.fill({ text: anterior, mode: 'replace' })
                await update($, original, () => null)
              }}
            />,
          )}
        {abaixo}
      </Box>
    )
  })
}
