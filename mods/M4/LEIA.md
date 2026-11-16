# M4 · Cache Tax

- **Origem:** github.com/karanb192/cache-tax (o marketplace `karanb192/claude-code-mods` aponta para ele), commit `7304f9b` · v2.4.2 · MIT. Guardados só os arquivos do plugin (sem `docs/` e `site/`).
- **O que faz:** avisa o custo estimado de regravar o contexto quando o cache expira e mantém o cache aquecido durante pausas.
- **Usar:** `/cache-tax` mostra o estado; `/keepwarm 90m` antes de uma pausa; `/keepwarm off` encerra.
- **Instalar:**
  ```
  /plugin marketplace add karanb192/claude-code-mods
  /plugin install cache-tax@claude-code-mods
  ```
- **Revisão:** sem rede própria. O `/keepwarm` faz chamadas de modelo periódicas (`$.model.fork`) para manter o cache. Observa o envio de prompts para estimar o custo.
- **Atenção:** manter o cache usa tokens e exige cache principal de uma hora. Os valores são equivalentes de API, não cobrança extra garantida na assinatura.
