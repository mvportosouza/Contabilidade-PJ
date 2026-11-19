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

Aplicar `supabase/migrations/20261119000000_nfse_automation_runs.sql` no projeto Supabase de produção. A tabela nova é isolada e não modifica `app_state`, `profiles` ou os lançamentos existentes. RLS fica habilitado sem políticas para clientes; somente o backend com `service_role` opera a tabela.

## Variáveis na Vercel

Configurar em Project Settings → Environment Variables (Production e Preview somente se necessário):

- `SUPABASE_SERVICE_ROLE_KEY`: chave service_role do projeto Supabase. Nunca usar prefixo `NEXT_PUBLIC_`.
- `GITHUB_ACTIONS_TOKEN`: token Fine-grained do GitHub, limitado ao repositório `mvportosouza/Contabilidade-PJ`, com permissão Repository permissions → Actions: Read and write.
- `GITHUB_ACTIONS_REPOSITORY`: `mvportosouza/Contabilidade-PJ`.
- `NFSE_WORKFLOW_FILE`: `nfse-assistida.yml`.
- `NFSE_WORKER_BRIDGE_TOKEN`: segredo aleatório forte compartilhado com o GitHub Actions. Gere um valor novo (mínimo 32 bytes aleatórios) e use o mesmo valor nos dois ambientes.
- `NFSE_OTP_ENCRYPTION_KEY`: chave aleatória de 32 bytes codificada em hexadecimal (64 caracteres). Usada para criptografar o OTP no banco. Gere com `openssl rand -hex 32`.
- `CONTABILIZEI_EMAIL`: e-mail de login da Contabilizei.
- `CONTABILIZEI_PASSWORD`: senha da Contabilizei.

Não inserir valores reais neste arquivo, no ZIP ou no repositório.

## Secrets no GitHub

Em Settings → Secrets and variables → Actions → New repository secret:

- `NFSE_API_BASE_URL`: URL HTTPS de produção do aplicativo, sem barra final (por exemplo, `https://contabilidade-pj.vercel.app`).
- `NFSE_WORKER_BRIDGE_TOKEN`: exatamente o mesmo valor configurado na Vercel.

O token de bridge não é um token GitHub. O `GITHUB_ACTIONS_TOKEN` fica somente na Vercel.

## Ordem de instalação

1. Aplicar a migration SQL no Supabase.
2. Cadastrar as variáveis e secrets acima.
3. Fazer upload dos arquivos desta entrega para o repositório mantendo os caminhos.
4. Aguardar o deploy da Vercel.
5. Verificar no GitHub se o workflow `NFS-e - autenticação assistida` aparece na aba Actions.
6. Abrir o modal `À Emitir` e usar `Emitir Nota` para validar somente o login e o 2FA.

## Segurança e limitações

- O endpoint do aplicativo valida a sessão Supabase antes de iniciar uma execução.
- O runner autentica no backend por segredo compartilhado, não por credenciais do usuário.
- O backend verifica o dono da execução ao consultar status e receber OTP.
- O OTP é criptografado com AES-256-GCM antes de ser gravado, expira em três minutos e é removido quando consumido.
- O worker recebe credenciais da Contabilizei do backend; elas não são passadas como inputs do workflow nem impressas nos logs.
- A tabela de execução guarda somente os IDs das transações nesta fase, não cópias dos dados de pacientes/clientes.
- Não ativar emissão real nesta etapa. O próximo pacote deverá implementar preenchimento e revisão da nota, com uma confirmação explícita antes de qualquer emissão.

## Observação sobre o workflow

Como o repositório é público, os runners padrão hospedados pelo GitHub para Linux são gratuitos e ilimitados para esse uso, conforme a documentação oficial: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
