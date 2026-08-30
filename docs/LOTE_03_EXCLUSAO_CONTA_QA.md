# LOTE 03 — Exclusão de Conta & Data Lifecycle

## Objetivo

Certificar que a exclusão permanente percorre:

```text
Frontend
  ↓
Supabase Edge Function: delete-account
  ↓
auth.admin.deleteUser(user.id)
  ↓
ON DELETE CASCADE
  ├─ public.profiles
  └─ public.app_state
```

A Edge Function nunca recebe `user_id` do cliente. O usuário-alvo é derivado exclusivamente do
Bearer token validado pelo servidor.

## 3.1 — Conta descartável

Criar um usuário exclusivamente para QA, por exemplo:

- `qa-delete-<timestamp>@example.com`
- senha temporária com pelo menos 8 caracteres

Não usar uma conta real.

## 3.2 — Popular dados

Com o usuário QA autenticado, criar:

- `public.profiles`
- `public.app_state` contendo transações, favoritos, configurações e estado financeiro

O `app_state.state` deve conter dados inequívocos de teste, por exemplo:

```json
{
  "pj_tx2": [{ "id": "qa-delete-tx-001", "valor": 123.45 }],
  "pj_favs2": [{ "id": "qa-delete-fav-001" }],
  "pj_pl": { "2026-08": 1234.56 },
  "pj_plm": { "2026-08": 1234.56 },
  "pj_ctb": { "2026-08": 100 },
  "pj_irrf": { "2026-08": 50 }
}
```

## 3.3 — Excluir

Executar a opção **Excluir Conta** no aplicativo e confirmar duas vezes.

A chamada deve ser:

```text
POST /functions/v1/delete-account
Authorization: Bearer <JWT-do-usuario-QA>
```

A função:

1. rejeita métodos diferentes de POST;
2. rejeita ausência de Bearer token;
3. valida o JWT com `auth.getUser(token)`;
4. ignora qualquer `user_id` enviado no body;
5. executa `auth.admin.deleteUser(user.id)` no servidor;
6. retorna sucesso somente após a exclusão permanente.

## 3.4 — Verificar Supabase

Após a resposta `200` da Edge Function, confirmar que o usuário e os dados
não existem mais.

Consultar pelo SQL Editor:

```sql
-- Substitua pelo UUID do usuário QA antes da exclusão.
select id from auth.users where id = '<QA_USER_ID>';
select id from public.profiles where id = '<QA_USER_ID>';
select user_id from public.app_state where user_id = '<QA_USER_ID>';
```

Resultado esperado: **zero linhas nas três consultas**.

As FKs de `profiles.id` e `app_state.user_id` para `auth.users.id` usam
`ON DELETE CASCADE`.

## 3.5 — Verificar dispositivo

Antes da exclusão, inspecionar:

- `localStorage`
- `sessionStorage`
- Cache Storage
- sessão Supabase
- Service Worker

Após a exclusão, confirmar:

- não existem chaves de estado `pj_*`;
- não existem caches do aplicativo;
- não existem chaves `sb-*` de sessão;
- `supabase.auth.getSession()` retorna sessão nula;
- a página retorna para o fluxo de login;
- o Service Worker não mantém cache de dados financeiros.

A exclusão do Cache Storage é deliberada para o teste de lifecycle. O Service
Worker continua registrado, mas recebe `CLEAR_CACHES` e não deve manter dados da conta.

## 3.6 — Segurança

### A tentando excluir B

1. Autenticar como A.
2. Chamar `delete-account` enviando no body um `user_id` de B.
3. Esperado: B não é afetado; a função usa exclusivamente o usuário do token.

### Token inválido

Enviar:

```http
Authorization: Bearer token-invalido
```

Esperado: `401 invalid_session`.

### Token expirado

Enviar JWT expirado.

Esperado: `401 invalid_session`.

### Sem token

Não enviar `Authorization`.

Esperado: `401 missing_authorization`.

### Chamada manipulada

Enviar:

```json
{ "user_id": "<OUTRO_USUARIO>", "email": "outro@example.com" }
```

Esperado: nenhum desses campos altera o alvo da exclusão.

Também testar `GET`, `PUT` e `DELETE`.

Esperado: `405 method_not_allowed`.

## Critério de aprovação

O lote só é considerado aprovado quando:

- `auth.users` não contém o usuário QA;
- `profiles` não contém o usuário QA;
- `app_state` não contém o usuário QA;
- não há dados financeiros da conta em `localStorage`;
- não há sessão Supabase persistida;
- não há dados da conta no Cache Storage;
- chamadas sem autenticação ou com token inválido/expirado retornam `401`;
- uma conta autenticada não consegue escolher outra conta como alvo;
- `npm test` permanece verde.

> Observação: JWTs de acesso já emitidos são stateless e podem permanecer
> criptograficamente válidos até o `exp`. A exclusão remove a sessão/refresh
> token e impede a emissão de novas sessões. Para operações sensíveis, a
> própria API deve validar a sessão quando for necessária revogação imediata.
