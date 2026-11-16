// Prompt Master: um botão no rodapé do prompt (ao lado do modo de edição) que reescreve o rascunho
// com um modelo e o devolve na caixa para você revisar antes de enviar. "↶ desfazer" volta ao
// original. O modo automático (/prompt-master auto on) reescreve ao enviar, só o que você digitou.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import { SISTEMA, deveReescrever, limpar, modeloDe } from './modelo'

const ocupado = atom({ plugin: 'prompt-master', key: 'ocupado' } as const, false)
const original = atom({ plugin: 'prompt-master', key: 'original' } as const, null)
const auto = atom({ plugin: 'prompt-master', key: 'auto' } as const, false)

const CHAVE_AUTO = 'auto'

// Borda em repouso igual à dos seletores do rodapé; laranja suave só no hover.
const ESTILO = { borda: 'subtle', bordaHover: 'claude' } as const

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

  // O botão, no rodapé do prompt, antes dos modos (Accept edits, focus...).
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const { Box, Button } = $.ui.resolve(e)
    const rodando = await read($, ocupado)
    const anterior = await read($, original)
    const ligado = await read($, auto)
    // O que o Claude Code e os outros mods desenham ali (Accept edits, focus...) continua, ao lado.
    const abaixo = await next(e)

    const clicar = async () => {
      if (await read($, ocupado)) return
      const caixa = await $.prompt.read()
      const texto = caixa.text.trim()
      if (!texto) {
        $.ui.toast('Prompt Master: escreva o prompt primeiro')
        return
      }
      await update($, ocupado, () => true)
      try {
        const r = await reescrever($, texto, modelo)
        if ('erro' in r) {
          $.ui.toast(`Prompt Master: ${r.erro}`)
          return
        }
        await update($, original, () => caixa.text)
        await $.prompt.fill({ text: r.texto, mode: 'replace' })
        $.ui.toast('Prompt reescrito: revise e envie (↶ desfaz)')
      } catch (x) {
        $.ui.toast(`Prompt Master falhou: ${String((x as Error)?.message ?? x)}`)
      } finally {
        await update($, ocupado, () => false)
      }
    }

    // Mesmo visual dos seletores do rodapé (modelo, modo): sem a moldura própria do botão, texto na
    // fonte e cor padrão, borda cinza discreta do tema. No hover, só a borda muda para o laranja do
    // Claude, esmaecido para ficar suave. Cores do tema: acompanham claro, escuro e os mods de tema.
    const pilula = (chave: string, filho: RenderChildren) => (
      <Box
        key={`${chave}-caixa`}
        borderStyle="round"
        borderColor={ESTILO.borda}
        paddingX={1}
        hover={{ borderColor: ESTILO.bordaHover, borderDimColor: true }}
      >
        {filho}
      </Box>
    )

    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        {pilula(
          'prompt-master',
          <Button key="prompt-master" plain label={rodando ? '✦ reescrevendo…' : ligado ? '✦ Prompt Master · auto' : '✦ Prompt Master'} onPress={clicar} />,
        )}
        {anterior !== null &&
          pilula(
            'prompt-master-desfazer',
            <Button
              key="prompt-master-desfazer"
              label="↶ desfazer"
              plain
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
