# Arquitetura

## Objetivo

O plugin responde a três perguntas sem intervenção do usuário:

1. **Quanta carga estou gerando?** — requests por minuto.
2. **Quanto o modelo consumiu?** — tokens de entrada, saída, raciocínio e cache, por requisição, por turno e por sessão.
3. **Quanto custa e como está a saúde?** — custo, latência, TTFT, erros, retries e chamadas de ferramenta.

## Fontes de dados

Tudo vem do stream público de eventos do OpenCode V2:

```ts
ctx.event.subscribe({
  types: [
    "session.step.started",
    "session.step.first-token",
    "session.step.ended",
    "session.step.failed",
    "session.execution.started",
    "session.execution.succeeded",
    "session.execution.failed",
    "session.execution.interrupted",
    "session.retry.scheduled",
    "session.tool.called",
    "session.tool.failed",
    "session.usage.updated",
    "session.deleted",
  ],
})
```

| Evento | Uso |
| --- | --- |
| `session.step.started` | Abre uma requisição (modelo, agente, instante de início). |
| `session.step.first-token` | Marca o TTFT. |
| `session.step.ended` | Fecha a requisição com tokens, custo e `finish`. |
| `session.step.failed` | Fecha a requisição com o tipo do erro. |
| `session.execution.started` | Abre um turno. |
| `session.execution.succeeded/failed/interrupted` | Fecha o turno com o desfecho. |
| `session.retry.scheduled` | Conta retry agendado pelo core. |
| `session.tool.called/failed` | Conta chamadas e falhas de ferramenta. |
| `session.usage.updated` | Totais cumulativos do servidor para a sessão. |
| `session.deleted` | Remove a sessão do rastreamento. |

## Modelo de dados

```text
request  = um passo de modelo (session.step.*)
turn     = uma execução (session.execution.*), com zero ou mais requests
session  = agrupamento de turnos, com totais do servidor quando disponíveis
```

- **Request** carrega modelo, agente, instante de início, TTFT, duração, tokens, custo, `finish` e tipo de erro.
- **Turn** soma requests, tokens, custo, retries e ferramentas, e guarda o desfecho. Um turno em andamento reporta o tempo decorrido até o momento da consulta.
- **Session** soma todos os turnos, guarda os agregados por modelo e os totais do servidor (`serverTokens`, `serverCost`).

Ao reportar uma sessão, o plugin prefere os totais do servidor e expõe o que ele rastreou em `tracked`. O campo `usageSource` diz qual origem foi usada (`server` ou `tracked`).

No escopo `all`, cada sessão escolhe a própria origem: a soma final usa o total do servidor quando ele existe. O campo `sessionList` detalha cada sessão com seus totais, contadores e latência.

## Requests por minuto

O RPM usa uma janela móvel:

```text
rpm   = requisições iniciadas nos últimos 60 s
rpm5m = requisições iniciadas nos últimos 5 min (média por minuto)
avgRpm = requisições totais ÷ minutos desde o início do rastreamento
```

Cada sessão guarda seus próprios instantes de início; o escopo `all` soma os instantes de todas as sessões rastreadas.

## Superfícies

1. **Servidor** (`src/index.ts`): assina os eventos, mantém o `UsageTracker`, registra a ferramenta `model_usage` e o RPC `model-usage.stats`.
2. **TUI** (`src/tui.tsx`): desenha uma linha no rodapé do prompt e registra o comando `/model-usage`, que abre o relatório completo em um diálogo. O nome `/usage` fica reservado para o diálogo de limites de uso do próprio OpenCode.
3. **RPC** (`src/rpc.ts`): contrato público `model-usage.stats`, consumido pela TUI e por qualquer cliente.

O relatório textual é gerado em `src/format.ts`, compartilhado entre terminal, ferramenta e RPC.

## Limites de memória

- Turnos por sessão: `maxTurnsPerSession` (padrão 50). Turnos antigos saem da lista de detalhe, mas os totais da sessão continuam somando.
- Requisições recentes em memória: `maxRequests` (padrão 1.000). É a base das janelas de RPM e das médias de latência e TTFT; os contadores de lifetime (requests, erros, retries, tokens e custo) não são afetados.
- Sessões removidas pela API do servidor saem do rastreamento, junto de suas requisições.

## Superfície de confiança

O plugin considera confiáveis os dados fornecidos pelo host. Ele não altera prompts, ferramentas, agentes, credenciais ou modelos, não acessa banco de dados, arquivos ou endpoints externos, e não faz requisições de rede.
