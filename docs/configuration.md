# Configuração

As opções são JSON e podem ser fornecidas na entrada `plugins` da configuração.

## Opções

| Opção | Tipo | Padrão | Efeito |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Quando `false`, nenhum hook, ferramenta ou RPC é registrado. |
| `logInterval` | `number` | `60000` | Intervalo em ms do resumo periódico no log do servidor. `0` desliga o log. |
| `providerIDs` | `string[]` | `[]` | Só rastreia estes providers. Lista vazia rastreia todos. |
| `modelIDs` | `string[]` | `[]` | Só rastreia estes modelos. Lista vazia rastreia todos. |
| `trackTools` | `boolean` | `true` | Conta chamadas de ferramenta e falhas de ferramenta. |
| `maxTurnsPerSession` | `number` | `50` | Quantos turnos manter por sessão em memória. |
| `maxRequests` | `number` | `1000` | Quantas requisições recentes manter em memória. |
## Comportamento padrão

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:marcelinosandroni/opencode-model-usage",
      "options": {
        "enabled": true
      }
    }
  ]
}
```

Com o padrão, o plugin rastreia todos os providers e modelos, conta ferramentas e publica um resumo a cada minuto no log do servidor.

## Rastrear apenas um provider

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:marcelinosandroni/opencode-model-usage",
      "options": {
        "providerIDs": ["nvidia"],
        "modelIDs": ["nemotron/test-model"]
      }
    }
  ]
}
```

A opção `modelIDs` usa o ID do modelo, sem o ID do provider. A comparação de provider ignora maiúsculas de minúsculas.

## Desligar o log periódico

```json
{
  "logInterval": 0
}
```

Com `0`, o plugin continua mostrando os números no terminal, na ferramenta e no RPC, mas não escreve resumo algum no log do servidor.

## Desativar temporariamente

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:marcelinosandroni/opencode-model-usage",
      "options": {
        "enabled": false
      }
    }
  ]
}
```

O OpenCode recarrega a configuração e o plugin. Não é preciso reiniciar o servidor.

## Precedência

1. `enabled: false` impede todo o comportamento.
2. `providerIDs` e `modelIDs` limitam quais requisições entram nas estatísticas.
3. `trackTools: false` remove chamadas e falhas de ferramenta das contagens.
4. Os totais por sessão do servidor têm prioridade sobre a soma local; `usageSource` indica a origem usada.
5. `maxTurnsPerSession` e `maxRequests` limitam o detalhe mantido em memória, nunca os totais de lifetime.

## Validação

- Valores numéricos finitos e não negativos são aceitos e arredondados para inteiros.
- Entradas que não são strings são ignoradas nas listas.
- `maxTurnsPerSession` e `maxRequests` nunca caem abaixo de 1.

## Coexistência com outros plugins

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "opencode-mobile-notifications",
    "github:marcelinosandroni/opencode-queue-followups",
    "github:marcelinosandroni/opencode-nvidia-retry",
    "github:marcelinosandroni/opencode-model-usage"
  ]
}
```

Os quatro plugins são independentes e podem coexistir.
