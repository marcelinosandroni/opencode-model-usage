# Segurança

## Versões suportadas

A versão mais recente na branch `main` recebe correções de segurança.

## Relato de vulnerabilidade

Não publique detalhes de uma vulnerabilidade em uma issue pública. Envie um relatório privado pelo mecanismo **Security advisory** do repositório no GitHub.

Inclua:

- versão do plugin e do OpenCode;
- passos de reprodução;
- impacto esperado;
- configuração relevante, sem segredos.

Você receberá uma confirmação em até cinco dias úteis. A correção será coordenada com o mantenedor antes da divulgação.

## Superfície do plugin

O plugin:

- assina eventos públicos de sessão;
- registra uma ferramenta de leitura (`model_usage`) e um RPC de leitura (`model-usage.stats`);
- guarda em memória apenas identificadores de sessão, identificadores de mensagem, modelos, agentes, instantes e contadores;
- não lê o conteúdo dos prompts, respostas ou erros;
- não grava prompts, erros ou credenciais em armazenamento próprio;
- não faz requisições de rede;
- não altera prompts, modelos, ferramentas, agentes, permissões ou credenciais.

## Limitações conhecidas

As estatísticas cobrem apenas o que o plugin observou desde o carregamento. Os totais por sessão ficam corretos porque o servidor publica o acumulado em `session.usage.updated`, mas o detalhamento por turno e por modelo começa no carregamento.

Custo e tokens dependem do provider reportar os valores corretamente.

Os identificadores de sessão e de mensagem ficam em memória enquanto o plugin estiver carregado. O hot reload descarta esse estado.
