# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

## [Não publicado]

Nenhuma mudança pendente.

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
