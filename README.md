# OpenCode Model Usage

[![CI](https://github.com/marcelinosandroni/opencode-model-usage/actions/workflows/ci.yml/badge.svg)](https://github.com/marcelinosandroni/opencode-model-usage/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Plugin para **OpenCode V2** que acompanha o uso do modelo e mostra **requests por minuto**, tokens de entrada e saída, custo, latência e muito mais, por turno e por sessão.

Ele não altera prompts, modelos ou credenciais: apenas lê o stream público de eventos e expõe os números que deriva.

## O que é medido

| Métrica | Origem | Observações |
| --- | --- | --- |
| Requests por minuto (RPM) | `session.step.started` | Requisições iniciadas na janela móvel de 60 s. Também há média de 5 min e média desde o início do rastreamento. |
| **Erros por tipo** | `session.step.failed` + `session.execution.failed` | Contagem, **percentual sobre os erros**, **percentual sobre todas as requisições** e falhas por minuto de cada tipo (`provider.rate-limit`, `provider.internal`, …). Falhas que acontecem antes de qualquer passo de modelo (modelo inexistente, por exemplo) entram pelo evento da execução. |
| Taxa de erro | derivado | Percentual de requisições que falharam. |
| **Retries por minuto** | `session.retry.scheduled` | Total da sessão e por minuto (janela de 60 s e média de 5 min). |
| **Chamadas de ferramenta por minuto** | `session.tool.called` / `session.tool.failed` | Total, por minuto e falhas. |
| **Turnos por minuto** | `session.execution.started` | Total de execuções e por minuto. |
| Tokens de entrada / saída | `session.step.ended` | Soma de `tokens.input` e `tokens.output` por requisição, turno e sessão. |
| Tokens de raciocínio | `session.step.ended` | `tokens.reasoning`, reportado separadamente. |
| Tokens de cache | `session.step.ended` | `tokens.cache.read` e `tokens.cache.write`. |
| Custo (USD) | `session.step.ended` | Soma do custo reportado pelo core. |
| Latência | `session.step.*` | Tempo total da requisição e *time to first token* (TTFT). |
| Totais por turno | `session.execution.*` | Um turno é uma execução: pode conter várias requisições. |
| Totais por sessão | `session.usage.updated` | Totais cumulativos do próprio servidor; usados quando disponíveis. |
| Breakdown por sessão | agregação do plugin | O escopo `all` lista cada sessão rastreada com seus totais, latência e contadores. |

## Como ver os números

O plugin oferece quatro surfaces, todas públicas:

1. **No terminal** — uma linha ao vivo no rodapé do prompt com RPM, tokens e custo, e o comando `/model-usage` que abre o relatório completo (o `/usage` nativo continua sendo o de limites de uso do OpenCode).
2. **Pelo agente** — a ferramenta `model_usage` devolve o mesmo relatório. Funciona no cliente móvel: basta pedir "como está meu uso?".
3. **Por RPC** — o método `model-usage.stats` expõe os números estruturados para qualquer cliente.
4. **Por comando do servidor** — o comando `model-usage` aparece em `GET /api/command` e pode ser executado por qualquer cliente com `POST /api/session/{id}/command`. Ele publica o relatório como mensagem sintética na conversa, **sem gastar uma chamada de modelo**.

### No iPhone

| Caminho | Como usar | Custo |
| --- | --- | --- |
| Chat | Peça no chat: "como está meu uso de modelo?" — o agente chama a ferramenta `model_usage` e responde na conversa. | 1 chamada de modelo |
| Comando | Execute o comando `model-usage` pela API de comandos do cliente; o relatório aparece como mensagem na conversa. | Nenhum |
| Notificação | Peça "manda meu uso pro celular" — o agente usa `notify_phone` (plugin `opencode-mobile-notifications`) e o resumo chega na tela bloqueada. | 1 chamada de modelo |

O rodapé e o diálogo do terminal são exclusivos da TUI; no app iOS o relatório chega como mensagem da conversa ou como push.

```text
Uso do modelo — sessão ses_x
Requisições: 3 req/min (janela de 60s) · 1.2 req/min (média de 5min) · 0.8 req/min (média)
Requisições totais: 12 (2 falharam · 16.7% de erro) · sessões: 1 · plugin rastreando desde 2026-11-27T00:00:00.000Z
Erros: 2 (0.3/min · média de 5min 0.1/min · 1 da execução) · Retries: 5 (1.2/min · média de 5min 0.8/min)
Chamadas de ferramenta: 17 (2.1/min · média de 5min 1.4/min) · Turnos: 3 (0.4/min · média de 5min 0.2/min)
Tokens (totais da sessão): entrada 128.4k · saída 12.9k · raciocínio 4.1k · cache leitura 210k · cache escrita 0 · total 141.3k
Custo: $0.4213 (origem: sessão do servidor)
Latência: média 3.2s · TTFT médio 820ms · falhas de ferramenta 1
Observado pelo plugin: 2 req · in 5.1k · out 961 · rac 0 · cache 295.2k/0 · $0 (desde o carregamento do plugin)

Erros por tipo:
  provider.rate-limit · 2 (66.7% dos erros · 16.7% das requisições) · 0.3/min
  provider.internal · 1 (33.3% dos erros · 8.3% das requisições) · 0.1/min

Turnos:
  #3 · 4 req (0 falharam) · in 12k · out 1.2k · rac 300 · cache 0/0 · $0.031 · 8.0s · succeeded

Sessões:
  ses_x · 12 req (2 falharam) · in 128.4k · out 12.9k · rac 4.1k · cache 210k/0 · $0.4213 · lat 3.2s · 0 req/min · 1 turnos (0/min) · retries 5 (1.2/min) · ferramentas 17 (2.1/min) · 2 erros (16.7%) · origem servidor

Modelos:
  nvidia/nvidia/test · 12 req · in 128.4k · out 12.9k · rac 4.1k · cache 210k/0 · $0.4213 · lat 3.2s · ttft 820ms · 2 erros
```

### Duas origens de números

- **Totais da sessão** vêm do servidor (`session.usage.updated`) e cobrem a sessão inteira, mesmo o que aconteceu antes de o plugin carregar.
- **Detalhe por turno, modelo e janela por minuto** vem do que o plugin observou desde o carregamento. Atualizar o plugin reinicia essa parte.

Quando os dois números divergem, o relatório mostra a linha **"Observado pelo plugin"** para deixar a diferença explícita.

## Compatibilidade

- **OpenCode:** V2, a partir da versão `2.4.1`, testada neste repositório.
- **Runtime:** Node.js 20+ ou Bun.
- **APIs usadas:** eventos públicos de sessão (`session.step.*`, `session.execution.*`, `session.usage.updated`, `session.retry.scheduled`, `session.tool.*`), `ctx.tool.transform`, `ctx.rpc.register`, `ctx.command.transform`, `ctx.session.synthetic` e, na parte TUI, `context.ui.slot`, `context.keymap.layer` e `context.client.rpc`.

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

O retorno é o mesmo snapshot usado pelo terminal e pela ferramenta, com `rpm`, `rpm5m`, `avgRpm`, `errorRate`, `errorTypes`, `retryRpm`, `toolRpm`, `turnRpm`, `turnCount`, `tokens`, `cost`, `turns`, `sessionList` e `models`.

## Resumo diário no celular

Com o plugin [`opencode-phone-notify`](https://github.com/marcelinosandroni/opencode-phone-notify) instalado, o `opencode-model-usage` manda um **resumo diário por push**, por padrão às **20:00** no horário do servidor:

```json
{
  "package": "github:marcelinosandroni/opencode-model-usage",
  "options": {
    "dailySummary": {
      "enabled": true,
      "at": "20:00",
      "timeZone": "America/Sao_Paulo",
      "title": "Uso do modelo · {date}",
      "body": "{requests} req ({turns} turnos) · in {input} · out {output} · {errors} erros · {retries} retries · {tools} tools · {cost}"
    }
  }
}
```

| Opção | Padrão | Descrição |
| --- | --- | --- |
| `enabled` | `true` | Liga/desliga o resumo. |
| `at` | `"20:00"` | Hora do envio (`HH:MM` no fuso escolhido). Se o servidor estiver fora do ar na hora, envia no primeiro check depois dela. |
| `timeZone` | fuso do servidor | Fuso IANA para a hora e para os contadores do dia (`America/Sao_Paulo`, por exemplo). |
| `title` / `body` | ver acima | Templates com placeholders. |

Placeholders do corpo: `{date}`, `{time}`, `{requests}`, `{failed}`, `{errors}`, `{retries}`, `{tools}`, `{turns}`, `{input}`, `{output}`, `{reasoning}`, `{cacheRead}`, `{cacheWrite}`, `{total}`, `{cost}`.

Os contadores do dia são buckets por calendário (guardados por 7 dias), contados com os mesmos eventos do relatório: requisições, tokens, custo, erros, retries, ferramentas e turnos. Sem o plugin de notificações instalado, o resumo não é entregue e o plugin apenas registra um aviso.

`errorTypes` traz, para cada tipo de erro: `count` (total), `percentage` (participação nos erros), `rate` (participação em todas as requisições) e `perMinute` (falhas do tipo na janela de 60 s).

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
