# Lote K — Auth & Security

## Alterações

- Fluxo de recuperação de senha com `resetPasswordForEmail`.
- Fluxo de atualização de senha após `PASSWORD_RECOVERY`.
- Validação de senha mínima de 8 caracteres no cliente.
- Cliente Supabase sem URL/chave hardcoded como fallback.
- Variáveis de ambiente mantidas em `env.example`.

## Sem alteração de layout

O fluxo utiliza os mesmos estilos e dimensões existentes. Nenhuma alteração estrutural no Dashboard foi feita.

## Supabase Auth

- URL de produção configurada como Site URL.
- URLs de produção/preview devem estar cadastradas como Redirect URLs.
- O fluxo de recuperação depende da configuração correta dessas URLs.
- Confirmação de e-mail permanece conforme a política do projeto.
- MFA deve ser habilitado conforme a necessidade da conta e a capacidade disponível no projeto.
- **Leaked Password Protection:** o projeto considera o recurso, mas ele não deve ser tratado como ativo neste projeto no plano gratuito utilizado.

## Vercel

Variáveis necessárias:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

Não use `service_role` no frontend.

## Segurança

A autorização dos dados permanece no Supabase por meio de RLS. A chave publicável não concede, por si só, acesso irrestrito aos dados protegidos por RLS.
