# NFS-e — primeira etapa: autenticação assistida

Esta entrega implementa somente a inicialização protegida da execução e a validação do acesso à Contabilizei. **Não preenche, revisa nem emite notas fiscais.** A emissão ficará bloqueada até a validação dos seletores e dos dados fiscais em uma etapa posterior.

## Escopo desta etapa

- O botão `Emitir Nota` aparece exclusivamente no modal `À Emitir`.
- O backend calcula as pendências diretamente do `app_state` do usuário autenticado e limita a execução ao mês/ano selecionados.
- Nesta primeira fase, somente uma pendência é vinculada à execução.
- O GitHub Actions inicia um runner Playwright sob demanda.
- O robô acessa a tela de login, aguarda o código de seis dígitos e valida o acesso.
- O código 2FA é temporário e não é enviado aos logs.
- Nenhuma nota é criada ou confirmada nesta fase.

## Migração Supabase

A tabela `public.nfse_automation_runs` e a função `public.consume_nfse_otp(uuid)` já foram aplicadas no Supabase de produção e verificadas. **Não execute novamente a migration `20261119000000_nfse_automation_runs.sql`**: ela inclui `CREATE TABLE` e já está registrada no histórico. O app continua usando `app_state` para os lançamentos; esta tabela isolada guarda apenas as execuções.

## Variáveis na Vercel

Configurar em Project Settings → Environment Variables (Production e Preview somente se necessário):

- `SUPABASE_SERVICE_ROLE_KEY`: chave service_role do projeto Supabase. Nunca usar prefixo `NEXT_PUBLIC_`. Já cadastrada na Vercel Production; não altere.
- `GITHUB_ACTIONS_TOKEN`: token Fine-grained do GitHub, limitado ao repositório `mvportosouza/Contabilidade-PJ`, com permissão Repository permissions → Actions: Read and write.
- `GITHUB_ACTIONS_REPOSITORY`: `mvportosouza/Contabilidade-PJ` (pode permanecer no padrão do backend).
- `NFSE_API_BASE_URL`: origem HTTPS do aplicativo, sem barra final; configurada também no GitHub Actions Secret `NFSE_API_BASE_URL`.
- `NFSE_WORKFLOW_FILE`: `nfse-assistida.yml` (opcional; o backend já usa esse nome como padrão).
- `NFSE_WORKER_BRIDGE_TOKEN`: segredo aleatório forte compartilhado com o GitHub Actions. Gere um valor novo (mínimo 32 bytes aleatórios) e use o mesmo valor nos dois ambientes.
- `NFSE_OTP_ENCRYPTION_KEY`: chave aleatória de 32 bytes codificada em hexadecimal (64 caracteres). Usada para criptografar o OTP no banco. Gere com `openssl rand -hex 32`.
- `CONTABILIZEI_EMAIL`: e-mail de login da Contabilizei.
- `CONTABILIZEI_PASSWORD`: senha da Contabilizei.

Não inserir valores reais neste arquivo, no ZIP ou no repositório.

## Secrets no GitHub

Em Settings → Secrets and variables → Actions → New repository secret:

- `NFSE_API_BASE_URL`: URL HTTPS de produção do aplicativo, sem barra final. Se também for cadastrada na Vercel, use a mesma origem (por exemplo, `https://contabilidade-pj.vercel.app`).
- `NFSE_WORKER_BRIDGE_TOKEN`: exatamente o mesmo valor configurado na Vercel.

O token de bridge não é um token GitHub. O `GITHUB_ACTIONS_TOKEN` fica somente na Vercel.

## Ordem de instalação

1. Não executar novamente SQL no Supabase: a tabela e a função atômica já estão instaladas.
2. Cadastrar as variáveis e secrets ainda ausentes, conforme a lista acima.
3. Fazer upload dos arquivos desta entrega para o repositório mantendo os caminhos.
4. Aguardar o deploy da Vercel.
5. Verificar no GitHub se o workflow `NFS-e - autenticação assistida` aparece na aba Actions.
6. Somente depois de cadastrar os secrets e conferir os seletores, iniciar a validação de login e 2FA. Nesta etapa não ocorre emissão.

## Segurança e limitações

- O endpoint do aplicativo valida a sessão Supabase antes de iniciar uma execução.
- O runner autentica no backend por segredo compartilhado, não por credenciais do usuário.
- O backend verifica o dono da execução ao consultar status e receber OTP.
- O OTP é criptografado com AES-256-GCM antes de ser gravado, expira em três minutos e é consumido por uma função SQL atômica (`UPDATE ... RETURNING`), que impede duas requisições concorrentes de obterem o mesmo código.
- O worker recebe credenciais da Contabilizei do backend; elas não são passadas como inputs do workflow nem impressas nos logs.
- A tabela de execução guarda somente os IDs das transações nesta fase, não cópias dos dados de pacientes/clientes.
- Não ativar emissão real nesta etapa. O próximo pacote deverá implementar preenchimento e revisão da nota, com uma confirmação explícita antes de qualquer emissão.

## Observação sobre o workflow

Como o repositório é público, os runners padrão hospedados pelo GitHub para Linux são gratuitos e ilimitados para esse uso, conforme a documentação oficial: https://docs.github.com/en/actions/reference/runners/github-hosted-runners


## Geração local dos segredos

Execute localmente (não cole os valores no chat e não os versione):

```bash
# Chave AES-256-GCM (64 caracteres hexadecimais)
openssl rand -hex 32

# Segredo de bridge (32 bytes aleatórios, hexadecimal)
openssl rand -hex 32
```

Use o primeiro valor em `NFSE_OTP_ENCRYPTION_KEY` na Vercel. Use o segundo valor idêntico em `NFSE_WORKER_BRIDGE_TOKEN` na Vercel e nos GitHub Actions Secrets.


## Situação da configuração verificada em 19/11/2026

- `SUPABASE_SERVICE_ROLE_KEY` já existe na Vercel em Production.
- As variáveis abaixo não foram encontradas na Vercel Production durante a verificação: `GITHUB_ACTIONS_TOKEN`, `GITHUB_ACTIONS_REPOSITORY`, `NFSE_WORKFLOW_FILE`, `NFSE_WORKER_BRIDGE_TOKEN`, `NFSE_OTP_ENCRYPTION_KEY`, `CONTABILIZEI_EMAIL` e `CONTABILIZEI_PASSWORD`.
- Não foi possível consultar os valores nem a existência dos GitHub Actions Secrets por meio da conexão disponível; confira `NFSE_API_BASE_URL` e `NFSE_WORKER_BRIDGE_TOKEN` em Settings → Secrets and variables → Actions.
- A URL e a chave pública do Supabase já são usadas pelo app existente; não substitua as variáveis atuais do projeto.

A checagem de login/2FA ainda exige validar os seletores contra a página atual da Contabilizei. Não use o botão enquanto os secrets estiverem incompletos.
