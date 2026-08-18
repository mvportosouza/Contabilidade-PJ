# Marcus Vinícius Porto Souza LTDA — Gestão Financeira PJ

Aplicativo de gestão financeira para dentista PJ (Simples Nacional).

## Tecnologias

- Next.js 14
- React 18
- Recharts
- Supabase Auth
- Supabase PostgreSQL
- RLS
- localStorage como cache offline por usuário
- PWA

## Lote A — Persistência + Supabase + RLS + Offline

A persistência agora utiliza uma arquitetura **online-first com fallback offline seguro**:

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

O aplicativo não sobrescreve silenciosamente uma versão mais nova da nuvem. Em caso de alteração concorrente, o conflito é apresentado ao usuário e ele pode escolher explicitamente manter a versão local ou usar a versão da nuvem.

### Antes do primeiro deploy desta versão

Execute no Supabase SQL Editor:

`supabase/migrations/20260818_lote_a_persistencia_rls.sql`

Consulte `docs/LOTE_A.md` para a arquitetura e o roteiro de testes.

## Variáveis de ambiente

Crie `.env.local` em desenvolvimento ou configure as mesmas variáveis na Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICAVEL
NEXT_PUBLIC_SITE_URL=https://SEU-DOMINIO
```

Nunca coloque `service_role` ou qualquer segredo em uma variável `NEXT_PUBLIC_*`.

## Deploy

### GitHub

1. Crie/conecte o repositório.
2. Faça o push de todos os arquivos.
3. Não envie `.env.local`.

### Vercel

1. Importe o repositório.
2. Configure as três variáveis de ambiente.
3. Faça o deploy.
4. Confirme o domínio de produção em `NEXT_PUBLIC_SITE_URL`.

### Supabase Auth

Configure a URL de produção e as URLs de preview necessárias no painel de autenticação do Supabase. O fluxo atual utiliza PKCE.

## PWA / iPhone

1. Abra o endereço de produção no Safari.
2. Toque em Compartilhar.
3. Escolha **Adicionar à Tela de Início**.
4. O aplicativo continuará disponível com cache local quando a conexão cair, desde que a sessão e os dados já tenham sido carregados anteriormente naquele dispositivo.

## Desenvolvimento local

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## Limites atuais do Lote A

- O estado financeiro ainda é armazenado como um documento JSON em `app_state`.
- O modelo normalizado de lançamentos/contas será tratado em uma etapa posterior.
- A resolução de conflitos é explícita para evitar perda silenciosa de dados.
- O motor tributário não foi alterado neste lote.
