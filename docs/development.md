# Desenvolvimento

## Pré-requisitos

- Node.js 20 ou superior
- npm 10 ou superior
- Git

## Preparação

```bash
git clone https://github.com/marcelinosandroni/opencode-model-usage.git
cd opencode-model-usage
npm install
```

## Comandos

```bash
npm run typecheck
npm test
npm run check
```

`npm run check` é o comando usado pela CI e deve passar antes de abrir um PR.

## Executar localmente no OpenCode

Adicione o clone à configuração global:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "/caminho/absoluto/opencode-model-usage"
  ]
}
```

Depois de alterar o código, toque no ponto de entrada para acionar o watcher:

```bash
touch index.ts
```

Arquivos sob diretórios de configuração vigiados são recarregados automaticamente. Se o clone estiver fora desses diretórios e o servidor não detectar a alteração, reinicie o serviço apenas durante o desenvolvimento.

Para confirmar:

```bash
opencode plugin list
```

## Estrutura

```text
.
├── index.ts                 # ponto de entrada publicado (parte de servidor)
├── src/index.ts             # plugin de servidor: eventos, ferramenta e RPC
├── src/usage.ts             # rastreamento e agregação (puro, testável)
├── src/format.ts            # formatação de relatório (puro, testável)
├── src/options.ts           # validação das opções
├── src/rpc.ts               # contrato público `model-usage.stats`
├── src/tui.tsx              # parte TUI: rodapé ao vivo e comando /usage
├── test/usage.test.ts       # testes do rastreamento
├── test/format.test.ts      # testes de formatação
├── docs/                    # documentação técnica
└── .github/workflows/       # CI
```

## Estratégia de testes

Os testes usam `node:test` por meio do `tsx` e cobrem apenas código puro, sem servidor. Eles verificam:

- contagem de requisições, tokens, custo e latência por requisição;
- erros e requisições repetidas sem dupla contagem;
- agrupamento de requisições em turnos;
- contagem de retries e chamadas de ferramenta;
- preferência pelos totais do servidor;
- janelas de requests por minuto;
- agregação do escopo `all` e remoção de sessão;
- formatação de contagens, custos, durações e relatórios.

## Pull requests

1. Crie uma branch a partir de `main`.
2. Faça a alteração e acrescente testes quando necessário.
3. Rode `npm run check`.
4. Atualize a documentação e o changelog.
5. Abra o pull request usando o template apropriado.

## Versionamento e publicação

O projeto segue SemVer:

- **PATCH:** correções sem mudança de contrato;
- **MINOR:** nova opção ou comportamento compatível;
- **MAJOR:** mudança incompatível de configuração ou API.

Revise o pacote com:

```bash
npm pack --dry-run
```

A publicação no npm não é automática. Depois de revisar o artefato, publique com o escopo correto:

```bash
npm publish --access public
```
