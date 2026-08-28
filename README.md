# Marcus Vinícius Porto Souza LTDA — Gestão Financeira PJ

Aplicativo de gestão financeira para dentista PJ (Simples Nacional).

## Tecnologias

- Next.js 16.3.3
- React 19.2.8
- React DOM 19.2.8
- Recharts 3.10.1
- Supabase Auth
- Supabase PostgreSQL
- Row Level Security (RLS)
- localStorage como cache offline por usuário
- PWA
- ESLint 9.39.5
- Vitest 3.2.7

## Arquitetura de persistência e sincronização

A persistência utiliza uma arquitetura **online-first com fallback offline seguro**:

```text
Usuário autenticado
       ↓
cache local por user_id
       ↓
fila de alterações offline
       ↓
Supabase RPC save_app_state
       ↓
app_state + RLS
```

O aplicativo não sobrescreve silenciosamente uma versão mais nova da nuvem. Em caso de alteração concorrente, o conflito é apresentado ao usuário para escolha explícita.

## Segurança e autenticação

- Supabase Auth para autenticação.
- Fluxo de recuperação de senha com atualização de senha após `PASSWORD_RECOVERY`.
- Validação de senha mínima de 8 caracteres no cliente.
- MFA é opcional e não é exigido pelo aplicativo.
- RLS permanece como camada de autorização dos dados.
- As variáveis `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `NEXT_PUBLIC_SITE_URL` são configuradas por ambiente.
- Nunca colocar `service_role` ou outro segredo em variável `NEXT_PUBLIC_*`.
- A proteção contra senhas vazadas depende do recurso disponível no plano do Supabase; no plano gratuito utilizado neste projeto, esse recurso não é ativado.

## PWA e funcionamento offline

O Service Worker:

- mantém o shell da aplicação disponível para navegação offline;
- utiliza cache versionado;
- utiliza cache-first para assets imutáveis do build;
- não armazena dados financeiros;
- não intercepta `/api/` nem chamadas externas/Supabase;
- mantém os dados financeiros no armazenamento local por usuário e na fila de sincronização existente.

Para instalar no iPhone:

1. Abra o endereço de produção no Safari.
2. Toque em Compartilhar.
3. Escolha **Adicionar à Tela de Início**.

## Variáveis de ambiente

Crie `.env.local` em desenvolvimento ou configure as mesmas variáveis na Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICAVEL
NEXT_PUBLIC_SITE_URL=https://SEU-DOMINIO
```

Nunca envie `.env.local` ao GitHub.

## Desenvolvimento local

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## Validação local

```bash
npm run lint
npm test
npm run build
```

## CI / GitHub Actions

O CI utiliza Node.js 24 e valida:

1. instalação com `npm ci`;
2. ESLint;
3. testes unitários;
4. build de produção;
5. reprodutibilidade do lockfile;
6. auditoria de dependências com severidade alta.

O workflow de reparo de dependências também executa testes, build e auditoria antes de sincronizar o `package-lock.json`.

## Vercel

Configure em Production/Preview/Development conforme necessário:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

Depois do deploy, confirme o domínio de produção e as URLs de autenticação no Supabase.

## Documentação dos lotes

- **Lote H — PWA + Segurança + Auditoria Final:** `docs/LOTE_H_AUDITORIA.md`
- **Lote K — Auth & Security:** `docs/LOTE_K_AUTH_SECURITY.md`
- **Lote M — Infraestrutura / CI:** `docs/LOTE_M_INFRA_CI.md`
- **Lote N — Supabase Security Final:** `docs/LOTE_N_SUPABASE_SECURITY.md`
- **Lote O — PWA + CI/QA Final:** `docs/LOTE_O_PWA_CI_QA.md`
- **Lote P — Documentation Cleanup:** `docs/LOTE_P_DOCUMENTATION.md`
- **Lote Q — Final Hardening & Release QA:** `docs/LOTE_Q_FINAL_HARDENING.md`
- **Supabase Migration Ledger:** `docs/SUPABASE_MIGRATION_LEDGER.md`
- **Fase 5 — Refatoração, performance, CSP e documentação:** `docs/FASE_5_REFACTOR_PERFORMANCE_CSP.md`

## Observações

- O layout e a estrutura visual da aplicação não fazem parte deste lote de documentação.
- O estado financeiro permanece armazenado como documento JSON em `app_state`.
- A resolução de conflitos continua explícita para evitar perda silenciosa de dados.
- O motor tributário não foi alterado pelo Lote P.
