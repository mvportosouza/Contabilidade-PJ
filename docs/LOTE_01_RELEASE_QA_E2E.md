# LOTE 01 — RELEASE QA / E2E CERTIFICATION

## Objetivo

Certificar os fluxos críticos em ambiente real sem alterar o layout da aplicação.

## Automação incluída

`tests/e2e/qa-real.spec.js` cobre:

- autenticação com sessão real;
- refresh e logout;
- sessão compartilhada em duas abas;
- acesso ao fluxo de recuperação de senha;
- criação, edição e exclusão de receita;
- criação e exclusão de despesa;
- criação e exclusão de distribuição de lucros;
- favoritos e configurações;
- dados tributários;
- persistência após logout/login;
- modo offline e sincronização posterior;
- conflito de alterações concorrentes entre abas;
- geração e download real de PDF;
- manifest e Service Worker;
- reabertura do shell offline;
- smoke test de console.

`playwright.config.js` foi adicionado para que `E2E_BASE_URL` seja realmente usado pelo Playwright. Antes, o workflow definia a variável, mas não existia configuração de `baseURL`; portanto `npx playwright test` não estava apontando explicitamente para a produção.

## Correção funcional feita no Lote 01

Foi corrigida uma condição de corrida em `lib/storage.js`.

Em múltiplas abas, `localStorage` é compartilhado. A implementação anterior podia ler do `localStorage` o timestamp recém-escrito por outra aba e utilizá-lo como `baseUpdatedAt`. Isso poderia transformar uma alteração concorrente em overwrite silencioso.

Agora o optimistic concurrency check usa primeiro o `remoteUpdatedAt` mantido em memória pela própria aba. Assim:

1. Aba A carrega versão 1.
2. Aba B carrega versão 1.
3. A salva e passa para versão 2.
4. B tenta salvar usando versão 1.
5. Supabase detecta conflito.
6. A interface oferece as duas opções já existentes:
   - Usar versão da nuvem;
   - Manter dados deste dispositivo.

Nenhuma alteração de layout ou estilo foi feita.

## O que não pode ser certificado automaticamente

Alguns fluxos exigem operação manual ou infraestrutura externa:

- confirmação real do e-mail de uma conta recém-criada;
- alteração de senha de uma conta de produção, por ser uma operação destrutiva sobre credencial;
- teste de sessão expirada artificialmente;
- instalação pelo ícone no iOS/Android e splash nativo;
- impressão física do PDF;
- exclusão permanente da conta;
- fechamento mensal: não foi localizado no código um fluxo explícito de "fechamento mensal". Portanto este item não deve ser marcado como PASS até existir e ser validado o comportamento esperado.

## Execução no GitHub Actions

Secrets:

- `E2E_EMAIL`
- `E2E_PASSWORD`

A URL padrão é:

`https://contabilidade-pj.vercel.app`

Pode ser sobrescrita por `E2E_BASE_URL`.

O workflow continua manual para impedir alterações destrutivas acidentais em produção.

## Critério de fechamento

O Lote 01 somente deve ser considerado concluído quando:

- os testes automatizados estiverem PASS;
- os fluxos manuais acima estiverem registrados como PASS;
- não houver regressão visual;
- produção estiver na mesma versão validada pelo pipeline.
