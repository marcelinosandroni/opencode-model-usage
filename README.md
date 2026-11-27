# OpenCode Model Usage

[![CI](https://github.com/marcelinosandroni/opencode-model-usage/actions/workflows/ci.yml/badge.svg)](https://github.com/marcelinosandroni/opencode-model-usage/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Plugin para **OpenCode V2** que acompanha o uso do modelo e mostra **requests por minuto**, tokens de entrada e saída, custo, latência e muito mais, por turno e por sessão.

Ele não altera prompts, modelos ou credenciais: apenas lê o stream público de eventos e expõe os números que deriva.

## O que é medido

| Métrica | Origem | Observações |
| --- | --- | --- |
| Requests por minuto (RPM) | `session.step.started` | Requisições iniciadas na janela móvel de 60 s. Também há média de 5 min e média desde o início do rastreamento. |
| Tokens de entrada / saída | `session.step.ended` | Soma de `tokens.input` e `tokens.output` por requisição, turno e sessão. |
| Tokens de raciocínio | `session.step.ended` | `tokens.reasoning`, reportado separadamente. |
| Tokens de cache | `session.step.ended` | `tokens.cache.read` e `tokens.cache.write`. |
| Custo (USD) | `session.step.ended` | Soma do custo reportado pelo core. |
| Latência | `session.step.*` | Tempo total da requisição e *time to first token* (TTFT). |
| Erros | `session.step.failed` | Requisições que falharam e o tipo do erro. |
| Retries | `session.retry.scheduled` | Tentativas reagendadas pelo core. |
| Chamadas de ferramenta | `session.tool.called` / `session.tool.failed` | Volume e falhas por turno. |
| Totais por turno | `session.execution.*` | Um turno é uma execução: pode conter várias requisições. |
| Totais por sessão | `session.usage.updated` | Totais cumulativos do próprio servidor; usados quando disponíveis. |
| Breakdown por sessão | agregação do plugin | O escopo `all` lista cada sessão rastreada com seus totais, latência e contadores. |

## Como ver os números

O plugin oferece três surfaces, todas públicas:

1. **No terminal** — uma linha ao vivo no rodapé do prompt com RPM, tokens e custo, e o comando `/usage` que abre o relatório completo.
2. **Pelo agente** — a ferramenta `model_usage` devolve o mesmo relatório. Funciona no cliente móvel: basta pedir "como está meu uso?".
3. **Por RPC** — o método `model-usage.stats` expõe os números estruturados para qualquer cliente.

```text
Uso do modelo — sessão ses_x
Requisições: 3 req/min (janela de 60s) · 2.5 req/min (média de 5min) · 1.5 req/min (média)
Requisições totais: 12 (1 falharam) · sessões: 1 · acompanhando desde 2026-11-27T00:00:00.000Z
Tokens: entrada 128.4k · saída 12.9k · raciocínio 4.1k · cache leitura 210k · cache escrita 0 · total 141.3k
Custo: $0.4213 (origem: sessão do servidor)
Latência: média 3.2s · TTFT médio 820ms · erros 1 · retries 2 · ferramentas 5 (1 falharam)

Turnos:
  #3 · 4 req (0 falharam) · in 12k · out 1.2k · rac 300 · cache 0/0 · $0.031 · 8.0s · succeeded

Sessões:
  ses_x · 12 req (1 falharam) · in 128.4k · out 12.9k · rac 4.1k · cache 210k/0 · $0.4213 · lat 3.2s · 3 turnos · retries 2 · ferramentas 5 · origem servidor

Modelos:
  nvidia/nvidia/test · 12 req · in 128.4k · out 12.9k · rac 4.1k · cache 210k/0 · $0.4213 · lat 3.2s · ttft 820ms · 1 erros
```

## Compatibilidade

- **OpenCode:** V2, a partir da versão `2.4.1`, testada neste repositório.
- **Runtime:** Node.js 20+ ou Bun.
- **APIs usadas:** eventos públicos de sessão (`session.step.*`, `session.execution.*`, `session.usage.updated`, `session.retry.scheduled`, `session.tool.*`), `ctx.tool.transform`, `ctx.rpc.register` e, na parte TUI, `context.ui.slot`, `context.keymap.layer` e `context.client.rpc`.

## Instalação

Adicione o pacote GitHub à lista `plugins` da configuração global:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "github:marcelinosandroni/opencode-model-usage"
  ]
}
```

O OpenCode recarrega plugins automaticamente após a alteração da configuração. Não é necessário reiniciar o servidor.

Para instalar pelo CLI:

```bash
opencode plugin add github:marcelinosandroni/opencode-model-usage
```

Confirme o carregamento com:

```bash
opencode plugin list
```

A saída deve conter:

```text
opencode.model-usage
```

## Configuração

A configuração é opcional. Para passar opções, use a forma de objeto:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:marcelinosandroni/opencode-model-usage",
      "options": {
        "enabled": true,
        "logInterval": 60000,
        "providerIDs": [],
        "modelIDs": [],
        "trackTools": true,
        "maxTurnsPerSession": 50,
        "maxRequests": 1000
      }
    }
  ]
}
```

| Opção | Tipo | Padrão | Descrição |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Desative com `false` para não registrar nada. |
| `logInterval` | `number` | `60000` | Intervalo em ms do resumo periódico no log do servidor. `0` desliga o log. |
| `providerIDs` | `string[]` | `[]` | Só rastreia estes providers. Lista vazia rastreia todos. |
| `modelIDs` | `string[]` | `[]` | Só rastreia estes modelos. Lista vazia rastreia todos. |
| `trackTools` | `boolean` | `true` | Conta chamadas de ferramenta e falhas de ferramenta. |
| `maxTurnsPerSession` | `number` | `50` | Quantos turnos manter por sessão em memória. Turnos antigos saem da lista, mas os totais permanecem. |
| `maxRequests` | `number` | `1000` | Quantas requisições recentes manter em memória. É a base das janelas de RPM e das médias de latência. |

Consulte [docs/configuration.md](docs/configuration.md) para precedência, exemplos e regras de validação.

## Ferramenta `model_usage`

Agentes podem consultar as métricas a qualquer momento:

```json
{
  "scope": "session",
  "sessionID": "ses_x",
  "format": "report"
}
```

| Parâmetro | Tipo | Padrão | Descrição |
| --- | --- | --- | --- |
| `scope` | `"session" \| "all"` | `"session"` | Sessão atual ou todas as sessões rastreadas. |
| `sessionID` | `string` | sessão atual | Sessão a reportar. |
| `format` | `"report" \| "compact"` | `"report"` | Relatório completo ou uma linha. |

## RPC `model-usage.stats`

```ts
import { OpenCode } from "@opencode/client"
import { ModelUsage } from "opencode-model-usage/rpc"

const client = OpenCode.make({ baseUrl: "http://127.0.0.1:4096" })
const stats = await client.rpc(ModelUsage).stats({ scope: "all" })
```

O retorno é o mesmo snapshot usado pelo terminal e pela ferramenta, com `rpm`, `rpm5m`, `avgRpm`, `tokens`, `cost`, `turns`, `sessionList` e `models`.

Quando `scope` é `"session"` e `sessionID` não é informado, o método devolve o erro declarado `invalid_scope` com o motivo `missing_session_id`.

## Operation

- O estado vive apenas em memória e é descartado no hot reload.
- O plugin não faz requisições de rede e não grava prompts, erros ou credenciais.
- Os totais por sessão vêm do servidor quando ele publica `session.usage.updated`; caso contrário, o plugin soma o que observou. O campo `usageSource` indica a origem.
- No escopo `all`, cada sessão usa o total do servidor quando disponível, e a soma final aparece em `tokens` e `cost`. O que o plugin observou fica em `tracked`.
- As estatísticas do escopo `all` cobrem as sessões do local (projeto) onde o plugin está carregado.

## Limitações

- O plugin só enxerga eventos a partir do momento em que foi carregado. Totais por sessão ainda ficam corretos porque o servidor publica o acumulado.
- Um "request" é um passo de modelo (`session.step`), não uma requisição HTTP: o core pode reusar a mesma requisição em casos de retry.
- Custo e tokens dependem do provider reportar os valores corretamente.

## Desenvolvimento

```bash
npm install
npm run check
```

- `npm run typecheck`: valida os tipos com TypeScript estrito, incluindo a parte TUI.
- `npm test`: executa os testes unitários.
- `npm run check`: executa typecheck e testes.

Veja [docs/development.md](docs/development.md) para o fluxo completo.

## Documentação

- [Arquitetura](docs/architecture.md)
- [Configuração](docs/configuration.md)
- [Compatibilidade](docs/compatibility.md)
- [Desenvolvimento](docs/development.md)

## Problemas e contribuições

Abra uma issue em [Issues](https://github.com/marcelinosandroni/opencode-model-usage/issues). Contribuições são bem-vindas; leia [CONTRIBUTING.md](CONTRIBUTING.md).

## Licença

[MIT](LICENSE) © 2026 Marcelino Sandroni.
