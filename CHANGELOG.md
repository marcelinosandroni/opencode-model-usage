# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

## [Não publicado]

Nenhuma mudança pendente.

## [0.1.1] - 2026-11-27

### Adicionado

- Breakdown por sessão no escopo `all`: `sessionList` lista cada sessão rastreada com totais, latência, contadores e origem dos números.
- Duração decorrida de turnos que ainda estão em andamento.
- Erro declarado `invalid_scope` no RPC `model-usage.stats`, com o motivo `missing_session_id`, no lugar de uma falha genérica.

### Corrigido

- `maxTurnsPerSession` e `maxRequests` agora são aplicados de verdade: turnos e requisições antigas saem do detalhe em memória, sem afetar os totais de lifetime.
- Os agregados por modelo passaram a ser mantidos por sessão, então o recorte por modelo continua completo mesmo quando requisições antigas são descartadas.
- A remoção de uma sessão não deixa mais instantes de requisição órfãos nas janelas de requests por minuto.

## [0.1.0] - 2026-11-27

### Adicionado

- Primeira versão do plugin `opencode.model-usage`.
- Rastreamento de requests por minuto com janelas de 60 s e 5 min, além da média desde o início do rastreamento.
- Tokens de entrada, saída, raciocínio e cache por requisição, por turno e por sessão.
- Custo, latência média e *time to first token*.
- Contagem de erros, retries agendados e chamadas de ferramenta.
- Totais por turno e por modelo, com totais de sessão preferidos a partir de `session.usage.updated`.
- Ferramenta `model_usage` para o agente consultar as métricas.
- RPC público `model-usage.stats`.
- Parte TUI com linha ao vivo no rodapé do prompt e comando `/usage`.
- Resumo periódico no log do servidor, configurável por `logInterval`.
- Testes unitários e workflow de CI.
