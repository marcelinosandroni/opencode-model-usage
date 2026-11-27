# Compatibilidade

## OpenCode

| Versão | Status | Observações |
| --- | --- | --- |
| `2.4.1` | Testada | Versão do servidor usada no desenvolvimento e na validação. |
| `2.4.2` | Compatível esperada | Usa a mesma API pública do plugin. |
| OpenCode V1 | Não suportada | A API de plugins e o stream de eventos são diferentes. |

O plugin requer o stream público de eventos do OpenCode V2, a API pública de ferramentas e o registro público de RPC.

## Node.js e Bun

- Node.js 20+ é o baseline dos testes automatizados.
- Bun também é suportado pelo loader de plugins do OpenCode.
- O pacote mantém o código em TypeScript e publica o ponto de entrada `index.ts`.

## Dependências

A única dependência de runtime é `\@opencode/plugin`. A parte TUI declara `solid-js`, `@opentui/solid`, `@opentui/core` e `@opencode/theme` como *peer dependencies* opcionais, porque quem executa a interface é o próprio OpenCode.

## Limites do OpenCode

O plugin não muda o comportamento do core: ele apenas observa o que o core já publica. Se um provider não reportar tokens ou custo, o número correspondente aparece como zero.

Eventos usados que podem evoluir: `session.step.*`, `session.execution.*`, `session.usage.updated`, `session.retry.scheduled` e `session.tool.*`.
