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
| `session.execution.succeeded/failed/interrupted` | Fecha o turno com o desfecho. A falha também registra o tipo do erro quando nenhum passo de modelo falhou antes (modelo inexistente, prompt inválido). |
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
- **Session** soma todos os turnos, guarda os agregados por modelo, a contagem de lifetime de erros por tipo, os totais do servidor (`serverTokens`, `serverCost`) e os instantes recentes de erro, retry, ferramenta e turno.

Ao reportar uma sessão, o plugin prefere os totais do servidor e expõe o que ele rastreou em `tracked`. O campo `usageSource` diz qual origem foi usada (`server` ou `tracked`).

No escopo `all`, cada sessão escolhe a própria origem: a soma final usa o total do servidor quando ele existe. O campo `sessionList` detalha cada sessão com seus totais, contadores e latência.

## Requests por minuto

O RPM usa uma janela móvel:

```text
rpm   = requisições iniciadas nos últimos 60 s
rpm5m = requisições iniciadas nos últimos 5 min ÷ 5 (média por minuto)
avgRpm = requisições totais ÷ minutos desde o início do rastreamento
```

O mesmo modelo vale para as outras taxas:

| Taxa | Janela de 60 s | Média de 5 min |
| --- | --- | --- |
| Requisições | `rpm` | `rpm5m` |
| Erros | `errorRpm` | `errorRpm5m` |
| Retries | `retryRpm` | `retryRpm5m` |
| Chamadas de ferramenta | `toolRpm` | `toolRpm5m` |
| Turnos | `turnRpm` | `turnRpm5m` |

Cada sessão guarda seus próprios instantes de início; o escopo `all` soma os instantes de todas as sessões rastreadas. Os instantes de retry, ferramenta e turno são mantidos por 5 minutos (a maior janela usada) e descartados depois disso.

## Erros por tipo

Cada requisição que falha guarda o tipo do erro publicado pelo core (`provider.rate-limit`, `provider.internal`, `provider.transport`, `permission.rejected`, …). O tracker mantém a contagem de lifetime por tipo e monta:

```text
count       = falhas do tipo no total
percentage  = count ÷ erros do escopo × 100
rate        = count ÷ requisições do escopo × 100
perMinute   = falhas do tipo nos últimos 60 s
```

O breakdown sai no escopo da sessão e no escopo `all`, onde os tipos das sessões são somados.

Falhas que acontecem **antes** de qualquer passo de modelo (por exemplo, um modelo inexistente) só publicam `session.execution.failed`. Nesses casos o tracker registra o tipo do erro a partir do evento da execução, e a falha **não** é contada duas vezes quando o turno já tinha um passo que falhou — o passo é a origem autoritativa do erro. O contador `executionErrors` informa quantos erros vieram da execução.

## Superfícies

1. **Servidor** (`src/index.ts`): assina os eventos, mantém o `UsageTracker`, registra a ferramenta `model_usage`, o RPC `model-usage.stats` e o comando de servidor `model-usage`.
2. **TUI** (`src/tui.tsx`): desenha uma linha no rodapé do prompt e registra o comando `/model-usage`, que abre o relatório completo em um diálogo. O nome `/usage` fica reservado para o diálogo de limites de uso do próprio OpenCode.
3. **RPC** (`src/rpc.ts`): contrato público `model-usage.stats`, consumido pela TUI e por qualquer cliente.

O relatório textual é gerado em `src/format.ts`, compartilhado entre terminal, ferramenta e RPC.

### Comando de servidor

O plugin registra o comando `model-usage` com `ctx.command.transform`. Quando algum cliente o executa (`POST /api/session/{id}/command`), o plugin calcula o snapshot da sessão e publica o relatório como mensagem sintética (`ctx.session.synthetic`), que aparece na conversa de qualquer cliente — inclusive no app iOS — sem chamar o modelo.

A TUI tem um comando próprio com o mesmo nome, porque a TUI resolve `/model-usage` localmente e abre um diálogo em vez de escrever na conversa.

## Limites de memória

- Turnos por sessão: `maxTurnsPerSession` (padrão 50). Turnos antigos saem da lista de detalhe, mas os totais da sessão continuam somando.
- Requisições recentes em memória: `maxRequests` (padrão 1.000). É a base das janelas de RPM e das médias de latência e TTFT; os contadores de lifetime (requests, erros, retries, tokens e custo) não são afetados.
- Sessões removidas pela API do servidor saem do rastreamento, junto de suas requisições.

## Superfície de confiança

O plugin considera confiáveis os dados fornecidos pelo host. Ele não altera prompts, ferramentas, agentes, credenciais ou modelos, não acessa banco de dados, arquivos ou endpoints externos, e não faz requisições de rede.
